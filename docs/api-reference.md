# 10 · API Reference

> Complete surface of every network endpoint in the stack: the Layer-2 perception service, the Layer-3 EMV intake
> and dashboard gateway, and the Layer-4 MQTT topics.

**Services**

| Base URL | Service | Auth |
|---|---|---|
| `http://localhost:8000` | Layer 2 — GatiShakti-ML (FastAPI) | none |
| `http://localhost:8100` | Layer 3 — EMV token intake | none (see hardening notes) |
| `http://localhost:8200` | Layer 3 — Dashboard gateway | reads open · writes `Authorization: Bearer <jwt>` |
| `stm/junction/{id}/…` | Layer 4 — MQTT topics | broker policy (mTLS / user+password) |

---

# A · Layer 2 — Perception Service (`:8000`)

Interactive OpenAPI documentation: `http://localhost:8000/docs`.

## A.1 `GET /health`

```json
{ "status": "ok" }
```

## A.2 `GET /perception/layer2`

The single endpoint Layer 3 polls each cycle.

**Query parameters**

| Name | Type | Default | Notes |
|---|---|---|---|
| `junction_id` | string | `DEL_DL_ITO_01` | Selects the camera set via `cameras_for()` |
| `confidence` | float 0–1 | — | Overrides `cvConfidenceScore`. Use `0.6` to demonstrate the Layer-3 historical fallback |

**Responses**

| Code | Body |
|---|---|
| `200` | `Layer2Payload` — see [Data Contracts §1](data-contracts.md#1-layer2payload--layer-2--layer-3) |
| `500` | `{"detail": "Camera frame missing for NORTH: <path>"}` or a decode failure |

```bash
curl "http://localhost:8000/perception/layer2?junction_id=DEL_DL_ITO_01"
curl "http://localhost:8000/perception/layer2?confidence=0.6"
```

## A.3 `POST /predict/signal`

Standalone adaptive signal-timing model. **Not consumed by Layer 3.**

**Request** — `multipart/form-data`

| Field | Type | Required |
|---|---|---|
| `traffic_image` | file (image/*) | yes |
| `road_width` | float, metres | yes |
| `signal_id` | string | yes |
| `timestamp` | string | no — defaults to UTC now |
| `previous_vehicle_count` | int | no — default 0 |
| `previous_red_light_time` | float | no — default 0.0 |

**`200` response**

```json
{
  "vehicle_count": 27,
  "annotated_image": "<base64 JPEG>",
  "traffic_density": "High",
  "recommended_green_time": 27.0,
  "recommended_yellow_time": 5.0,
  "recommended_red_time": 33.0,
  "confidence_score": 0.86,
  "signal_id": "JN-ITO-N",
  "timestamp": "2026-09-05T09:14:30"
}
```

Errors: `400` non-image upload, empty file, or a bad value; `500` missing model weights.

## A.4 `POST /predict/buslane`

**Request** — `multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `lane_image` | file (image/*) | — |
| `signal_id` | int | — |
| `bus_lane_coordinates` | string (JSON) | `[[x1,y1],[x2,y2],…]`; 8 points recommended, ≥3 required |

**`200` response**

```json
{
  "unauthorized_count": 3,
  "confidence_score": 0.71,
  "violations": [ { "type": "Car", "bbox": [412, 288, 505, 361] } ],
  "annotated_image": "<base64 JPEG — yellow lane outline, red violation boxes>"
}
```

Authorised classes inside the lane are `Bus` and `Truck` (Truck deliberately, because stock COCO frequently
misclassifies Indian buses as trucks). Errors: `400` bad image or malformed JSON; `500` missing weights.

## A.5 `POST /predict/parking`

**Request** — `multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `parking_image` | file (image/*) | — |
| `parking_id` | string | — |
| `parking_slots` | string (JSON) | `[{"id":1,"coordinates":[x1,y1,x2,y2,x3,y3,x4,y4]}, …]` |

**`200` response**

```json
{
  "total_slots": 12, "occupied_slots": 8, "vacant_slots": 4,
  "occupancy_rate": 67, "confidence_score": 0.82,
  "slot_status": [ { "id": 1, "status": "Occupied" }, { "id": 2, "status": "Vacant" } ],
  "annotated_image": "<base64 JPEG — green occupied, red vacant>"
}
```

---

# B · Layer 3 — EMV Ingest (`:8100`)

Presence, expiry and revocation only. **This server does not decide trust** — the junction-side `EmvVerifier` is the
single authority, and it re-verifies every token on every cycle.

## B.1 `GET /emergency/health`

```json
{ "status": "ok" }
```

## B.2 `GET /emergency/token`

```json
{ "token": { /* EmergencyToken */ } }     // or { "token": null }
```

Expiry is enforced on read: a token past `expiresAt` returns `null`.

## B.3 `POST /emergency/token`

**Body:** a full `EmergencyToken` (see [Data Contracts §2](data-contracts.md#2-emergencytoken--layer-1--layer-3)).

Shape validation requires `emvId`, `targetPhaseId`, `signature`, `tokenId` (strings), `expiresAt` (number) and a
non-null `gpsTrack` object.

| Code | Body |
|---|---|
| `202` | `{ "accepted": true, "tokenId": "TKN-…" }` |
| `400` | `{ "error": "malformed EmergencyToken" }` |

## B.4 `POST /emergency/revoke`

**Body:** `{ "tokenId": "TKN-…" }`

| Code | Body |
|---|---|
| `200` | `{ "revoked": "TKN-…" }` |
| `400` | `{ "error": "tokenId required" }` |

Side effects: clears the active token if it matches; adds the id to the junction verifier's permanent blocklist;
ends the corridor run, releasing all reservations and promoting any held EMV.

```bash
# development helper — signs and posts a token
cd Layer-3_STM
npm run emv:keygen
npm run emv:dispatch -- EAST 35 CRITICAL
```

---

# C · Layer 3 — Dashboard Gateway (`:8200`)

CORS: `access-control-allow-origin: *`, methods `GET, POST, OPTIONS`, headers `content-type, authorization`.
`OPTIONS` is answered for preflight on every route.

## C.1 Streaming

### `GET /events` — Server-Sent Events

Two named event types. On connect the gateway **replays its history buffer** (up to 20 snapshots) plus the latest
city frame, so a new dashboard is populated immediately.

```
event: snapshot
data: {"cycle":412,"timestamp":"2026-09-05T09:14:30.412Z", … CycleSnapshot … }

event: city
data: {"generatedAt":"2026-09-05T09:14:30.500Z", … CitySnapshot … }
```

Client de-duplication on `cycle` is required, because replayed frames repeat on reconnect.

### `WS /stream` — WebSocket

Identical frames as JSON envelopes. Read-only; writes stay on the REST plane.

```json
{ "event": "snapshot", "data": { /* CycleSnapshot */ } }
{ "event": "city",     "data": { /* CitySnapshot  */ } }
```

## C.2 Open reads

### `GET /health`

```json
{ "status": "ok", "clients": 2, "buffered": 20 }
```

### `GET /control/state`

```json
{ "override": { "phaseId": "EAST", "durationSeconds": 45,
                "requestedBy": "Signal Operator (NCT-OPS-OPR)",
                "reason": "VIP movement", "issuedAt": 1757062470000, "expiresAt": 1757062515000 } }
```
`override` is `null` when none is active.

### `GET /audit?limit=n`

`limit` defaults to 100. Newest first.

```json
{ "entries": [ { "id": "…", "ts": "2026-09-05T09:14:30.500Z", "actor": "SYSTEM",
                 "action": "DECISION", "junctionId": "DEL_DL_ITO_01",
                 "detail": "cycle #412: NORMAL_MAX_PRESSURE → EAST 52s (conf 84%)",
                 "outcome": "ok" } ] }
```

### `GET /analytics`

Aggregates over the rolling window (240 cycles ≈ 2 h).

```json
{ "cycles": 240, "avgGreenSeconds": 47, "avgVehiclesPerCycle": 96,
  "safetyPassRate": 100, "avgConfidencePct": 84, "avgCongestionPct": 61,
  "modeDistribution": { "NORMAL_MAX_PRESSURE": 205, "HISTORICAL_FALLBACK": 28, "GREEN_CORRIDOR": 7 },
  "planDistribution": { "MAX_PRESSURE": 198, "TOD_FALLBACK": 28, "EMERGENCY": 7, "STARVATION": 7 } }
```

### `GET /analytics/series?hours=24&buckets=48`

| Parameter | Default | Clamped to |
|---|---|---|
| `hours` | 24 | [1, 24] |
| `buckets` | 48 | [6, 96] |

Buckets span `[now − hours, now]` evenly; **empty buckets are omitted**, so a fresh start renders only the window it
actually has data for — `coveredFrom` / `coveredTo` label it.

```json
{ "windowHours": 24, "buckets": 48, "bucketMinutes": 30, "samples": 412,
  "coveredFrom": "2026-09-05T06:00:00.000Z", "coveredTo": "2026-09-05T09:14:30.412Z",
  "points": [ { "ts": "2026-09-05T06:15:00.000Z", "throughputPcu": 88, "avgWaitSeconds": 41,
                "congestion": 0.58, "avgConfidencePct": 86, "safetyPassPct": 100, "samples": 30 } ] }
```

### `GET /challans`

```json
{ "challans": [ { "id": "CH-…", "plate": "DL3CQR4482", "junctionCode": "JN-ITO",
                  "junctionName": "ITO Crossing", "violation": "NO_HELMET",
                  "ts": "2026-09-05T09:14:30.412Z", "fineRupees": 1000,
                  "status": "PENDING", "confidence": 0.912 } ] }
```

### `GET /registry`

```json
{ "edgeNodes": [ { "id": "EN-118", "name": "ITO Edge Node", "zone": "Central",
                   "status": "ONLINE", "lastHeartbeat": "2026-09-05T09:14:30.412Z",
                   "junctionsServed": 1, "cpuPct": 34, "uptimePct": 99.8 } ],
  "users": [ … ], "zones": [ … ] }
```

### `GET /fallback-plan`

The historical time-of-day plans the system would fall back to right now.

```json
{ "plans": [ { "phaseId": "NORTH", "recommendedGreenTime": 42, "historicalDemand": 71 },
             { "phaseId": "SOUTH", "recommendedGreenTime": 35, "historicalDemand": 48 },
             { "phaseId": "EAST",  "recommendedGreenTime": 51, "historicalDemand": 88 },
             { "phaseId": "WEST",  "recommendedGreenTime": 30, "historicalDemand": 33 } ] }
```

### `GET /metrics` — Prometheus

`content-type: text/plain; version=0.0.4`

| Metric | Type | Meaning |
|---|---|---|
| `stm_snapshots_total` | counter | Cycle snapshots broadcast |
| `stm_city_snapshots_total` | counter | City snapshots broadcast |
| `stm_sse_clients` | gauge | Connected SSE dashboards |
| `stm_safety_pass_ratio` | gauge | Safety-validated cycles, 0–1 |
| `stm_avg_congestion_pct` | gauge | Mean congestion over the analytics window |
| `stm_live_congestion_score` | gauge | Latest live junction congestion, 0–1 |
| `stm_challans_total` | gauge | Challans in the queue |
| `stm_audit_entries` | gauge | Retained audit entries |

## C.3 Authentication

### `POST /auth/login`

Two mutually exclusive bodies.

**Password path**

```json
{ "username": "operator", "password": "stm@1234" }
```

| Code | Body |
|---|---|
| `200` | `{ "token": "<jwt>", "user": { "sub", "name", "role", "iat", "exp" } }` |
| `401` | `{ "error": "invalid credentials" }` |

**Demo role path** — gated by `ALLOW_DEMO_LOGIN`.

```json
{ "role": "OPERATOR" }
```

| Code | Body |
|---|---|
| `200` | `{ "token", "user" }` |
| `400` | `{ "error": "unknown role" }` |
| `403` | `{ "error": "password login required" }` — when `ALLOW_DEMO_LOGIN=false` |

Neither body present ⇒ `400 { "error": "username+password or role required" }`.

### `POST /auth/sso` — IdP stub

Gated by `ALLOW_SSO_STUB`. Maps the email local-part to a role: `admin`→`ADMIN`, `inspect`→`INSPECTOR`,
`dispatch`/`emv`→`DISPATCHER`, otherwise `OPERATOR`.

```json
{ "email": "priya.dispatch@delhi.gov.in" }
```

| Code | Body |
|---|---|
| `200` | `{ "token", "user", "via": "sso-stub" }` |
| `400` | `{ "error": "email required" }` |
| `403` | `{ "error": "SSO not configured" }` |

> Not an authentication mechanism. Replace with real OIDC/SAML validation and set `ALLOW_SSO_STUB=false` before any
> non-demonstration deployment.

## C.4 Guarded writes

All require `Authorization: Bearer <jwt>`. Common failures: `401` missing/invalid/expired token;
`403 { "error": "role X not permitted" }`.

### `POST /control/override` — `ADMIN`, `OPERATOR`

```json
{ "phaseId": "EAST", "durationSeconds": 45, "reason": "VIP movement" }
```

`requestedBy` is taken from the **verified JWT claims**, never from the body. Duration is clamped to [10, 120].

| Code | Body |
|---|---|
| `200` | `{ "ok": true, "override": { … ManualOverride … } }` |
| `400` | `{ "ok": false, "error": "invalid phaseId \"NE\" (expected NORTH\|SOUTH\|EAST\|WEST)" }` |

An override requested while an emergency corridor is active is **deferred**, not applied, and the deferral is
audited.

### `POST /control/clear` — `ADMIN`, `OPERATOR`

Body: `{}` → `200 { "ok": true }`.

### `POST /control/dispatch` — `ADMIN`, `DISPATCHER`

```json
{ "targetPhaseId": "EAST", "etaSeconds": 35, "priorityClass": "CRITICAL",
  "emvId": "AMB-2041", "destinationJunctionId": "DEL_DL_AIIMS_05" }
```

Defaults: `targetPhaseId` `NORTH`, `etaSeconds` 30, `priorityClass` `CRITICAL`, `emvId` auto-generated,
`destinationJunctionId` `DEL_DL_AIIMS_05`.

| Code | Body | Meaning |
|---|---|---|
| `200` | `{ "ok": true, "token": { … EmergencyToken … } }` | Corridor granted; token signed and submitted |
| `409` | `{ "ok": false, "conflict": true, "active": { "emvId": "AMB-2041", "priorityClass": "CRITICAL" } }` | **Normal outcome.** Held behind a higher-priority or closer EMV; queued for safe sequencing |
| `400` | `{ "ok": false, "error": "…" }` | Malformed request |
| `503` | `{ "ok": false, "error": "dispatch unavailable" }` | Dispatch not wired |

Clients must treat `409` as a state, not an error.

### `POST /challans/{id}/issue` · `POST /challans/{id}/reject` — `ADMIN`, `INSPECTOR`

| Code | Body |
|---|---|
| `200` | `{ "ok": true, "challan": { … status: "ISSUED" \| "REJECTED", resolvedBy, resolvedAt … } }` |
| `404` | `{ "error": "challan not found" }` |
| `503` | `{ "error": "challan store unavailable" }` |

Each resolution appends an audit record naming the inspector from the verified claims.

## C.5 Error envelope

| Code | Shape | Cause |
|---|---|---|
| `400` | `{ error }` or `{ ok:false, error }` | Malformed body or invalid value |
| `401` | `{ error: "missing bearer token" \| "bad signature" \| "token expired" \| "malformed token" }` | Auth |
| `403` | `{ error: "role X not permitted" }` | Role matrix |
| `404` | `{ error: "not found" }` | Unknown route or missing resource |
| `409` | `{ ok:false, conflict:true, active }` | EMV corridor conflict |
| `503` | `{ error: "… unavailable" }` | Optional dependency not wired |

---

# D · Layer 4 — MQTT topics

| Direction | Topic | Payload | QoS | Retained |
|---|---|---|---|---|
| L3 → L4 | `stm/junction/{junctionId}/command` | `ActuationCommand` JSON | 1 | **false** |
| L4 → all | `stm/junction/{junctionId}/status` | `{ "commandId": "…", "status": "DONE" }` | 1 | **true** |

Commands older than 60 s (2× cycle) MUST be dropped. Deduplication is on `commandId`. Full contract:
[Layer 4](layer-4-communication-and-control.md) and [L3-L4 contract](L3-L4-actuation-contract.md).

---

# E · Quick verification script

```bash
# Layer 2
curl -s http://localhost:8000/health
curl -s "http://localhost:8000/perception/layer2" | head -c 300

# Layer 3 — EMV intake
curl -s http://localhost:8100/emergency/health
curl -s http://localhost:8100/emergency/token

# Layer 3 — gateway reads
curl -s http://localhost:8200/health
curl -s http://localhost:8200/analytics
curl -s http://localhost:8200/fallback-plan
curl -s http://localhost:8200/metrics | head -20
curl -N  http://localhost:8200/events            # live SSE stream

# Layer 3 — auth + a guarded write
TOKEN=$(curl -s -X POST http://localhost:8200/auth/login \
        -H 'content-type: application/json' -d '{"role":"OPERATOR"}' \
        | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s -X POST http://localhost:8200/control/override \
     -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d '{"phaseId":"EAST","durationSeconds":45,"reason":"doc verification"}'

curl -s -X POST http://localhost:8200/control/clear \
     -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}'

# expected negative cases
curl -s -X POST http://localhost:8200/control/override -d '{}'            # 401
curl -s -X POST http://localhost:8200/control/dispatch \
     -H "authorization: Bearer $TOKEN" -d '{}'                            # 403 (OPERATOR)
```
