# 01 · Layer 1 — Sensing & EMV Telemetry

> **Role:** the physical edge of the system. Layer 1 acquires raw signals from the world and hands them upward
> without interpreting them. It has **two independent sensing streams** that never share a failure mode.

| Property | Value |
|---|---|
| **Streams** | (A) Approach camera frames · (B) Emergency-vehicle device telemetry |
| **Implementation** | Camera registry in `GatiShakti-ML/app.py`; `Layer-3_STM/src/emv/emv-ingest-server.ts` |
| **Port** | `8100` (EMV intake) |
| **Consumers** | Layer 2 (frames), Layer 3 (tokens) |
| **Design rule** | Layer 1 manages **presence, expiry and revocation**. It never decides **trust**. |

---

## 1. Why two streams

A single-stream design fails badly. If the only input is the camera, then rain, glare, a dirty lens or a dropped
RTSP feed simultaneously removes both normal optimisation *and* emergency preemption — exactly when an ambulance
most needs a corridor. The architecture therefore treats EMV telemetry as a **second, camera-independent sensing
stream**:

```
        ┌──────────────── STREAM A: VISION ────────────────┐
        │  4 approach cameras → frames → Layer 2 (YOLO11)  │
        │  fails on: weather, glare, blur, feed loss       │
        └─────────────────────────┬────────────────────────┘
                                  │
                     ┌────────────▼───────────┐
                     │      LAYER 3           │  A verified corridor token
                     │  decision pipeline     │  BYPASSES the stream-A
                     └────────────▲───────────┘  degradation fallbacks.
                                  │
        ┌─────────────────────────┴────────────────────────┐
        │  STREAM B: EMV DEVICE                            │
        │  signed token + continuous GPS → :8100 intake    │
        │  fails on: GNSS loss, device fault, radio outage  │
        └──────────────────────────────────────────────────┘
```

This independence is enforced in `stm-orchestrator.ts` by the `emvPrimary` flag: when a token survives
verification, the staleness check (Stage 1) and the CV-confidence gate (Stage 2) are skipped, because the corridor
decision does not depend on the camera. Only a `TOTAL_FAILSAFE` (edge compute fault) overrides a corridor.

---

## 2. Stream A — approach cameras

### 2.1 Camera registry

Each junction maps to four approach frames, one per compass direction.

```python
# GatiShakti-ML/app.py
_DEFAULT_CAMERAS = {
    "NORTH": _SAMPLES_DIR / "traffic1.jpg",
    "SOUTH": _SAMPLES_DIR / "traffic2.jpg",
    "EAST":  _SAMPLES_DIR / "traffic3.jpg",
    "WEST":  _SAMPLES_DIR / "trafficmicro1.jpg",
}

JUNCTION_CAMERAS: dict = {
    "DEL_DL_ITO_01": _DEFAULT_CAMERAS,
}

def cameras_for(junction_id: str) -> dict:
    return JUNCTION_CAMERAS.get(junction_id, _DEFAULT_CAMERAS)
```

**Current state:** bundled sample photographs stand in for live feeds so the full stack is runnable without field
hardware. **Production substitution:** replace each path with a frame-grab from the approach camera (RTSP pull,
ONVIF snapshot, or a shared-memory ring buffer written by a capture daemon). Nothing above this function changes —
`build_layer2_payload()` takes raw bytes per approach, so the source is opaque to it.

**Adding a junction:** add one entry to `JUNCTION_CAMERAS`. Unknown junction IDs fall back to the default set so
the multi-junction map keeps rendering before every node has cameras online.

### 2.2 Frame contract

| Property | Requirement |
|---|---|
| Encoding | Any format OpenCV can decode (`cv2.imdecode`); JPEG in practice |
| Orientation | EXIF-corrected before use in bus-lane/parking paths (`decode_image()`); polygon coordinates depend on this |
| Colour | Decoded to BGR |
| Coverage | The frame should show the approach *stop-line queue*, since occupancy is derived from box area over frame area |
| Cadence | One frame per approach per 30 s cycle |

### 2.3 Failure handling

If a mapped frame is missing, `/perception/layer2` returns HTTP 500 with the offending approach named. The Layer-3
bridge treats any non-200 as a perception outage and the live loop falls back to `MockDataGenerator`, marking the
cycle `source: "MOCK_FALLBACK"` — which the dashboard surfaces and which downgrades edge status to `DEGRADED`.

### 2.4 Auxiliary sensing surfaces

Two further camera-derived surfaces are also Layer-1 inputs, consumed by dedicated Layer-2 models:

| Surface | Geometry file | Picked with | Consumed by |
|---|---|---|---|
| Bus-lane polygon | `lanecoordinates.json` | `tools/pick_lane.py` | `POST /predict/buslane` |
| Parking-slot quads | `slots.json` | `tools/pick_slots.py` | `POST /predict/parking` |

Both are pixel-space polygons and are therefore **camera-pose dependent**: if a camera is moved or refocused, the
geometry must be re-picked or detections will be attributed to the wrong region.

---

## 3. Stream B — EMV device telemetry

### 3.1 What the device sends

An emergency vehicle carries a device that holds a **signed corridor token** issued once at dispatch, and streams
its **live GPS track**. The token's claims are static and signed; the GPS track is continuous and deliberately
*not* covered by the signature.

```typescript
interface EmergencyToken {
  // ─── signed claims (Ed25519) ───────────────────────
  emvId: string;            // vehicle identity, e.g. "AMB-2041"
  priorityClass: "CRITICAL" | "HIGH" | "NORMAL";
  etaSeconds: number;       // claimed time to the junction
  targetPhaseId: string;    // approach that must go green
  routeJunctions: string[]; // route scope — junctions this token is valid for
  issuedAt: number;         // epoch ms
  expiresAt: number;        // epoch ms — time-bound
  tokenId: string;          // unique, used for revocation
  // ─── trust envelope ────────────────────────────────
  signature: string;        // base64 Ed25519 over the canonical claims
  gpsTrack: EmvGpsTrack;    // live telemetry (UNSIGNED)
}

interface EmvGpsTrack {
  lat: number;
  lng: number;
  headingDeg: number;       // 0 = north, 90 = east
  speedMps: number;
  timestamp: number;        // epoch ms of the fix
}
```

**Why GPS is unsigned:** a signature over continuously changing telemetry would need re-signing every fix, putting
the private key on the vehicle. Instead the private key stays at dispatch, and the junction checks that the
*unsigned* live track is **consistent with** the *signed* static claims. A stolen or replayed token therefore fails,
because the thief's real position and speed will not match the claimed route and ETA. See
[Security & Trust](cross-cutting-security-and-trust.md).

### 3.2 The intake server

`Layer-3_STM/src/emv/emv-ingest-server.ts` — a deliberately dumb pipe.

| Method | Path | Body | Behaviour |
|---|---|---|---|
| `POST` | `/emergency/token` | `EmergencyToken` | Shape-validated (`isEmergencyToken`), stored as the active token. `202 { accepted, tokenId }`. Malformed ⇒ `400`. |
| `POST` | `/emergency/revoke` | `{ tokenId }` | Clears the active token if it matches, and invokes the `onRevoke` callback. `200 { revoked }`. |
| `GET` | `/emergency/token` | — | `200 { token }` — the active token or `null`. |
| `GET` | `/emergency/health` | — | `200 { status: "ok" }`. |

Two in-process methods complete the surface:

- `submit(token)` — inject a token from within the process (used by the dashboard dispatch endpoint and by the
  corridor manager when promoting a held EMV).
- `clearActive()` — drop the grant when the corridor manager reports the vehicle has ARRIVED or the run ended.

**Expiry is enforced on read.** `getActiveToken()` returns `null` once `Date.now() > active.expiresAt`, so an
expired token can never reach the orchestrator even if nothing revoked it.

### 3.3 Revocation path

```
dispatcher / CLI
      │  POST /emergency/revoke { tokenId }
      ▼
EmvIngestServer  ──── onRevoke(tokenId) ────►  orchestrator.revokeEmvToken(tokenId)
      │                                             └─► EmvVerifier.revoke() — permanent blocklist
      └───────────────────────────────────────►  corridorManager.endRunByTokenId(tokenId)
                                                    └─► release all reservations, re-resolve grants,
                                                        promote any held EMV immediately
```

A revoked `tokenId` fails the verifier's revocation check forever at that junction — it can never reopen a corridor,
even if replayed with a valid signature and unexpired window.

### 3.4 Dispatching a token (development)

```bash
cd Layer-3_STM
npm run emv:keygen                       # once — persists .emv-keys.json so signer and verifier agree
npm run emv:dispatch -- EAST 35 CRITICAL # phase, ETA seconds, priority class
```

`MockEmvDispatch` (`src/emv/emv-dispatch.ts`) stands in for the central dispatch authority. It signs the claims with
the private key and synthesises a plausible GPS fix: the vehicle is placed exactly `etaSeconds × speedMps` metres
from the junction on a deterministic bearing, heading back toward it — so the GPS-derived ETA matches the claim and
the approach-zone check passes. In production this component lives outside the junction; the junction holds only the
public key.

---

## 4. Stream C — edge liveness

A third, internal signal completes Layer 1: the **edge heartbeat**. Each cycle `live.ts` calls
`orchestrator.recordHeartbeat()`, which stamps `LinkMonitor.lastHeartbeatAt`. Thirty seconds of silence marks the
heartbeat stale and drops the resilience ladder to `LOCALLY_AUTONOMOUS`. The same monitor tracks broker connectivity
and an edge-compute fault flag.

| Input | Setter | Ladder effect |
|---|---|---|
| Heartbeat | `recordHeartbeat()` | Stale (>30 s) ⇒ `LOCALLY_AUTONOMOUS` |
| Broker link | `setBrokerConnected(bool)` | Disconnected ⇒ `LOCALLY_AUTONOMOUS` |
| Edge fault | `setEdgeFault(bool)` | Faulted ⇒ `TOTAL_FAILSAFE` |

Chaos toggles for testing: `BROKER_CONNECTED=false` and `EDGE_FAULT=true` (read in `live.ts` `main()`).

The registry also carries a device-level heartbeat: `registry.touchHeartbeat("EN-118")` keeps the live junction's
edge node reported as `ONLINE` on the Administration screen.

---

## 5. Sensing configuration reference

| Variable | Default | Effect |
|---|---|---|
| `JUNCTION_ID` | `DEL_DL_ITO_01` | Junction requested from the perception service and used for route scoping |
| `JUNCTION_LAT` / `JUNCTION_LNG` | `28.6304` / `77.2177` | Physical junction position (ITO crossing) used by the GPS consistency check |
| `EMV_INGEST_PORT` | `8100` | Token intake port |
| `EMV_GPS_MAX_DISTANCE_METERS` | `3000` | Approach-zone radius — beyond this a token is out of scope |
| `EMV_GPS_MAX_SPEED_MPS` | `40` | Physical plausibility ceiling (~144 km/h) |
| `EMV_GPS_MAX_AGE_MS` | `300000` | How stale a GPS fix may be |
| `EMV_ETA_TOL_RATIO` | `0.6` | Allowed relative ETA divergence |
| `EMV_ETA_TOL_ABS` | `15` | Absolute ETA tolerance floor (seconds) |
| `EMV_CLOCK_SKEW_MS` | `5000` | Tolerance on time-bound checks |
| `EMV_PUBLIC_KEY_PEM` / `EMV_PRIVATE_KEY_PEM` | unset | Production key provisioning (takes precedence over `.emv-keys.json`) |

---

## 6. Production hardening checklist

| Item | Current | Required for field deployment |
|---|---|---|
| Camera feeds | Bundled sample JPEGs | RTSP/ONVIF capture per approach, with frame-age stamping |
| Frame timestamping | Payload timestamp is generated at build time | Stamp at capture so the 10 s staleness gate measures real sensing latency |
| EMV intake transport | Plain HTTP on `:8100` | mTLS or a signed-request gateway; the intake must not be world-writable |
| Key provisioning | `.emv-keys.json` dev keypair | Pre-provisioned public key per junction; private key only at the dispatch authority (HSM-backed) |
| GPS source | Synthesised at dispatch for the prototype | Real GNSS stream from the vehicle device, at ≥1 Hz |
| Revocation propagation | Per-junction, in-memory set | Distributed revocation list (broker fan-out) so a revoked token dies city-wide |
| Bus-lane / parking geometry | Hand-picked, checked in | Surveyed geometry, versioned per camera pose, re-validated after any camera service |
