# 11 · Operations Runbook

> Install, run, configure, verify, troubleshoot and deploy the STM stack.

---

## 1. Prerequisites

| Requirement | Version | Needed for |
|---|---|---|
| Node.js | 20 LTS or newer | Layer 3, Layer 5, simulator |
| npm | bundled with Node | dependency management |
| Python | 3.12 | Layer 2 perception |
| Docker Desktop | current | *Optional* — TimescaleDB + Redis |
| PowerShell 5.1+ or Bash | — | launch scripts |
| Disk | ~2 GB | YOLO weights, node_modules, `.venv` |

**Zero-infrastructure default:** with no `DATABASE_URL`, `REDIS_URL` or `OTEL_*` set, the stack runs end-to-end on a
file store, in-memory hot state and no-op tracing. Docker is genuinely optional.

---

## 2. One-time setup

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

This creates `GatiShakti-ML/.venv`, installs Python requirements, downloads `models/yolo11s.pt` if absent, and runs
`npm install` in `Layer-3_STM`.

### Manual / cross-platform

```bash
# Layer 2
cd GatiShakti-ML
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate on POSIX
pip install -r requirements.txt
python scripts/download_models.py

# Layer 3
cd ../Layer-3_STM
npm install
cp .env.example .env            # everything has a safe default
npm run emv:keygen              # persist the dev Ed25519 keypair (needed for cross-process dispatch)

# Layer 5
cd ../Layer-5
npm install

# Simulator
cd ../green-corridor-sim
npm install
```

> **`npm run emv:keygen` matters.** Without a persisted `.emv-keys.json`, each process mints an ephemeral keypair.
> Single-process tests still pass, but `npm run emv:dispatch` from a second terminal will produce tokens the running
> STM cannot verify — every dispatch will be rejected with `SIGNATURE_INVALID`.

---

## 3. Running the stack

### Everything at once

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```
```bash
./start.sh
```

The launcher frees the five stack ports, brings up Docker infrastructure only if the Layer-3 `.env` asks for
Postgres/Redis, starts perception (non-fatal if it never comes up — Layer 3 falls back to mock), opens Layer 5 and
the simulator in their own windows, then runs the Layer-3 pipeline in the foreground. `Ctrl+C` stops everything the
script started.

| Flag | Effect |
|---|---|
| `-SkipPerception` / `--skip-perception` | Do not start the heavy YOLO service; Layer 3 uses mock perception |
| `-NoInfra` | Never touch Docker, even if `.env` requests it |
| `-StopInfraOnExit` | `docker compose stop` when the script exits |

### Component by component

```bash
# Layer 2 — perception            :8000
cd GatiShakti-ML && .venv/Scripts/python -m uvicorn app:app --reload --port 8000

# Layer 3 — orchestrator          :8100 + :8200
cd Layer-3_STM
npm run live      # live perception, falls back to mock if :8000 is down
npm run dev       # continuous loop on mock perception only
npm run sim       # continuous simulator
npm run test      # integration + chaos harness

# Layer 5 — operations portal     :5273
cd Layer-5 && npm run dev

# Simulator                        :8081
cd green-corridor-sim && npm run dev
```

### Optional infrastructure

```bash
cd Layer-3_STM
docker compose up -d                                   # TimescaleDB pg16 + Redis 7

DATABASE_URL=postgres://postgres:postgres@localhost:5432/stm \
REDIS_URL=redis://localhost:6379 \
npm run live
```

Tables are created on first run and `cycle_history` is promoted to a Timescale hypertable automatically.

---

## 4. First-run walkthrough

1. Start the stack. The Layer-3 console prints the pipeline configuration banner, then a cycle block every 30 s.
2. Open `http://localhost:5273`. Log in — password `stm@1234` with username `admin`, `operator`, `inspector` or
   `dispatcher`; or use a demo role button.
3. **Live Operations** — the junction diagram, approach demand and decision panel should update every 30 s and the
   connection chip should read `live`.
4. **Signal Control** (ADMIN/OPERATOR) — request an override on a phase. Watch the next cycle switch to
   `MANUAL_OVERRIDE` / `OVERRIDE_MODE`, and the audit trail record the request and application.
5. **Emergency Corridor** (ADMIN/DISPATCHER) — dispatch an EMV. The next cycle should show
   `EMV token VERIFIED` in the reason chain and mode `GREEN_CORRIDOR`. Dispatch a second, lower-priority EMV to see
   the `CONFLICT` state and the held reason.
6. **Challan Review** (ADMIN/INSPECTOR) — issue or reject a violation; confirm the audit record.
7. **3D Simulation** — the embedded simulator should follow the real signal state; dispatching an ambulance from the
   3D view calls the real dispatch API.
8. **System Health** — confirm the ladder rung, edge status, broker connectivity and last heartbeat.

---

## 5. Configuration reference

### Layer 3 — `Layer-3_STM/.env`

| Variable | Default | Purpose |
|---|---|---|
| `PERCEPTION_URL` | `http://localhost:8000` | Layer-2 base URL |
| `JUNCTION_ID` | `DEL_DL_ITO_01` | Junction under live control |
| `JUNCTION_LAT` / `JUNCTION_LNG` | `28.6304` / `77.2177` | Physical position for the GPS consistency check |
| `EMV_INGEST_PORT` | `8100` | Token intake port |
| `DASHBOARD_PORT` | `8200` | Gateway port |
| `DATA_DIR` | `.data` | File-store location |
| `DATABASE_URL` | unset | Set (or `STORE=postgres`) to use Postgres/TimescaleDB |
| `REDIS_URL` | unset | Set to enable the Redis hot store |
| `JWT_SECRET` | dev default | **Override in production** |
| `JWT_TTL_SECONDS` | `28800` | Session lifetime (8 h) |
| `ALLOW_DEMO_LOGIN` | `true` | `false` forces username+password |
| `ALLOW_SSO_STUB` | `true` | `false` once a real IdP is wired |
| `EMV_GPS_MAX_DISTANCE_METERS` | `3000` | Approach-zone radius |
| `EMV_GPS_MAX_SPEED_MPS` | `40` | Plausibility ceiling |
| `EMV_GPS_MAX_AGE_MS` | `300000` | GPS fix staleness limit |
| `EMV_ETA_TOL_RATIO` / `EMV_ETA_TOL_ABS` | `0.6` / `15` | ETA agreement tolerance |
| `EMV_CLOCK_SKEW_MS` | `5000` | Time-bound tolerance |
| `EMV_PUBLIC_KEY_PEM` / `EMV_PRIVATE_KEY_PEM` | unset | Production key provisioning |
| `BROKER_CONNECTED` | `true` | Chaos toggle → `LOCALLY_AUTONOMOUS` |
| `EDGE_FAULT` | `false` | Chaos toggle → `TOTAL_FAILSAFE` |
| `OTEL_CONSOLE` | unset | `true` prints spans to the console |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | Ship traces to a collector |

### Layer 5 — `Layer-5/.env`

| Variable | Default |
|---|---|
| `VITE_GATEWAY_URL` | `http://localhost:8200` |
| `VITE_SIM_URL` | `http://localhost:8081` |

---

## 6. Verification

```bash
# health across the stack
curl -s http://localhost:8000/health
curl -s http://localhost:8100/emergency/health
curl -s http://localhost:8200/health

# live stream (Ctrl+C to stop)
curl -N http://localhost:8200/events

# analytics + metrics
curl -s http://localhost:8200/analytics
curl -s http://localhost:8200/metrics | head -20

# force the low-confidence fallback path from the perception side
curl -s "http://localhost:8000/perception/layer2?confidence=0.6"

# EMV round trip
cd Layer-3_STM
npm run emv:dispatch -- EAST 35 CRITICAL
curl -s http://localhost:8100/emergency/token
```

### Test suites

```bash
cd Layer-3_STM       && npm run test    # integration + chaos + asserted regressions
cd green-corridor-sim && npm run test    # Vitest
cd Layer-3_STM       && npm run build   # tsc — must be clean
cd Layer-5           && npm run build   # tsc -b && vite build — must be clean
```

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `EADDRINUSE` on 8100 / 8200 | A stale `npm run live` still holds the ports | `Get-NetTCPConnection -LocalPort 8200 -State Listen` then `Stop-Process -Id <pid> -Force`; or just use `start.ps1`, which frees them |
| Every dispatch rejected `SIGNATURE_INVALID` | Ephemeral keypair — signer and verifier are different processes | `npm run emv:keygen`, then restart the STM |
| `TOKEN_EXPIRED` immediately | Machine clock skew, or a TTL shorter than the ETA | Sync the clock; raise `EMV_CLOCK_SKEW_MS`; check the dispatch TTL |
| `ROUTE_SCOPE_MISMATCH` | The token's `routeJunctions` does not include this junction | Dispatch with a route that includes `JUNCTION_ID`; check the A\* destination |
| `GPS_OUT_OF_APPROACH_ZONE` | Fix beyond 3 km, or `JUNCTION_LAT`/`LNG` misconfigured | Verify the junction coordinates; tune `EMV_GPS_MAX_DISTANCE_METERS` |
| `ETA_GPS_MISMATCH` | Claimed ETA inconsistent with position and speed | Expected for a bad claim. If the real fleet is noisy, widen `EMV_ETA_TOL_RATIO` / `EMV_ETA_TOL_ABS` |
| Snapshot shows `source: MOCK_FALLBACK` | Perception unreachable or a frame is missing | Confirm `:8000` is up; check `PERCEPTION_URL`; look for the 500 naming the approach |
| Mode stuck on `HISTORICAL_FALLBACK` | CV confidence below 0.70, latch engaged | Inspect the confidence gauge; clean or re-aim the camera; check for a `?confidence=` override left in place |
| Mode stuck on `SAFE_DEFAULT` | `TOTAL_FAILSAFE` | Check `EDGE_FAULT`; check `resilience.edgeComputeOk` in the snapshot |
| Ladder stuck at `LOCALLY_AUTONOMOUS` | Broker down or heartbeat stale | Check `BROKER_CONNECTED`; confirm the loop is actually cycling (heartbeat is per-cycle) |
| Dashboard shows `disconnected` | Gateway down, or wrong `VITE_GATEWAY_URL` | Check `:8200/health`; verify the env var; `EventSource` reconnects automatically once it is back |
| Dashboard blank after login | Waiting for the first frame | The gateway replays its buffer on connect; if empty, the loop has not completed a cycle yet |
| `403 role X not permitted` | Correct behaviour — the role matrix | Log in as a permitted role; see [Layer 5 §3](layer-5-command-and-operations.md#3-roles-and-the-access-matrix) |
| Dispatch returns `409` | **Not an error** — corridor conflict | A higher-priority or closer EMV holds the corridor; the request is held and promoted when the winner clears |
| Postgres warning at startup, file store used | Database unreachable | `docker compose up -d`; verify `DATABASE_URL`. The fallback is intentional |
| Simulator iframe blank | Simulator not running, or WebGL unavailable | Start `green-corridor-sim`; the renderer falls back WebGL2 → WebGL1, but some environments have neither |
| Bus-lane detection missing every cycle | Endpoint unreachable or geometry file absent | Check `lanecoordinates.json` and `:8000`; the loop skips it by design |
| YOLO weights error | `models/yolo11s.pt` missing | `python scripts/download_models.py` |

### Reading the console

Each cycle prints a labelled block:

```
CYCLE #412 — 09:14:30
📡 LAYER 2 (Perception · LIVE_CV)   Confidence: 84.2%   Detections: NORTH(62% · 30veh), …
👤 MEMBER 1 (Normal-Mode Architect)   ✅ Scoring approaches with person-centric weights
👤 MEMBER 2 (Optimizer + Emergency)   ✅ MAX-PRESSURE — Selected EAST
👤 MEMBER 3 (Invariant Guardian)      ✅ PASSED   Clearances: Yellow=5s, AllRed=2s
👤 MEMBER 4 (Data & Resilience)       ✅ Passed — Using NORMAL_MODE
📋 Decision Chain: 1. … 2. …
🚦 LAYER 4 (Actuation)   Phase EAST | 52s | NORMAL_MAX_PRESSURE
```

The Decision Chain is the `reasonChain` — the authoritative explanation of the cycle, and the first place to look
when behaviour surprises you.

---

## 8. Data locations

| Path | Contents | Cap |
|---|---|---|
| `Layer-3_STM/.data/audit.jsonl` | Append-only audit log | 5 000 lines, self-trimming |
| `Layer-3_STM/.data/history.jsonl` | Cycle snapshot history (analytics + fallback derivation) | 2 000 lines |
| `Layer-3_STM/.data/challans.json` | Violation queue | 200 records |
| `Layer-3_STM/.data/*.json` | Registry, users, misc documents | — |
| `Layer-3_STM/.emv-keys.json` | **Development** Ed25519 keypair — git-ignored | — |
| `GatiShakti-ML/models/yolo11s.pt` | YOLO weights | ~21 MB |

Postgres mode uses the equivalent tables (`audit_log`, `cycle_history` hypertable, document tables).

**Backup:** archive `.data/` (or take a Postgres dump). **Reset:** delete `.data/`; the stores recreate lazily and
the fallback derivation returns to the static defaults until history rebuilds.

---

## 9. Monitoring

| Signal | Where | Watch for |
|---|---|---|
| `stm_safety_pass_ratio` | `/metrics` | Any sustained value below 1.0 — investigate the audit log for `SAFETY_BLOCK` |
| Mode distribution | `/analytics` | A rising `HISTORICAL_FALLBACK` share is the leading indicator of camera degradation |
| `stm_sse_clients` | `/metrics` | Zero while operators expect to be watching means the gateway is unreachable |
| `resilience.ladderState` | SSE / System Health | Anything other than `FULL_ADAPTIVE` |
| `controller.junctionHealth.edgeStatus` | System Health | `DEGRADED` or `OFFLINE` |
| `heartbeatAgeMs` | SSE | Growth beyond 30 s means the loop has stalled |
| Audit `outcome: "blocked"` | `/audit` | Every occurrence deserves a look |
| `pipeline.cycle` span duration | OTel | Approaching 30 s means the loop is at risk of overrun |

Suggested alerts: `stm_safety_pass_ratio < 1` for 5 minutes; `ladderState != FULL_ADAPTIVE` for 10 minutes;
`heartbeatAgeMs > 60000`; no `stm_snapshots_total` increase for 90 seconds.

---

## 10. Production deployment checklist

### Security

- [ ] `JWT_SECRET` from a secret manager
- [ ] `ALLOW_DEMO_LOGIN=false`
- [ ] `ALLOW_SSO_STUB=false`, real OIDC/SAML wired
- [ ] Default password `stm@1234` rotated for every account
- [ ] `EMV_PUBLIC_KEY_PEM` provisioned per junction; **no private key on any field node**
- [ ] `.emv-keys.json` absent from deployed images
- [ ] TLS on `:8200`; CORS restricted to the operator origin
- [ ] mTLS on the EMV intake and MQTT actuation topics
- [ ] Perception CORS narrowed from `*`

### Data

- [ ] Postgres/TimescaleDB provisioned; `DATABASE_URL` set; backups scheduled
- [ ] Redis provisioned if multiple readers need hot state
- [ ] Audit log shipped to append-only external storage
- [ ] Retention policy set on `cycle_history`

### Integration

- [ ] Real camera feeds replacing the sample frames in `JUNCTION_CAMERAS`
- [ ] Frames timestamped at **capture** so the 10 s staleness gate measures real latency
- [ ] Bus-lane and parking geometry re-surveyed for the deployed camera poses
- [ ] MQTT broker configured; Layer-4 driver wired; `controllerType` no longer `SIMULATED`
- [ ] `setBrokerConnected()` driven by the real broker client
- [ ] `setEdgeFault()` driven by real hardware-validation output
- [ ] Real GNSS stream from EMV devices at ≥1 Hz
- [ ] Distributed token revocation across junctions

### Model quality

- [ ] YOLO fine-tuned on Indian traffic (e.g. IDD) so auto-rickshaws are classified correctly
- [ ] `COCO_TO_STM_VEHICLE` and `VEHICLE_CLASS_NAMES` updated to the new class ids
- [ ] CV-confidence calibration re-validated against the new model
- [ ] Real plate OCR installed (`pip install easyocr`) if challan reads must be genuine
- [ ] `waitingTimeSeconds` / `arrivalRatePerMin` replaced with tracked measurements

### Operations

- [ ] Prometheus scraping `:8200/metrics`; alerts from section 9 configured
- [ ] OTel collector endpoint configured
- [ ] Process supervision (systemd / PM2 / container orchestrator) for all three services
- [ ] Layer 5 built (`npm run build`) and served statically behind TLS, not via the Vite dev server
- [ ] Runbook rehearsed: camera loss, broker loss, edge fault, corridor conflict

---

## 11. Known limitations

Accurate as of this document; each has a defined upgrade path.

| Limitation | Impact | Path |
|---|---|---|
| Camera frames are bundled sample images | Perception is real, the input is not live | Replace paths in `JUNCTION_CAMERAS` with capture output |
| `waitingTimeSeconds` / `arrivalRatePerMin` are heuristics from a still frame | Priority scoring is approximate on those terms | Video + tracking (e.g. ByteTrack) |
| COCO model, not Indian-traffic fine-tuned | Auto-rickshaws misclassified; `AutoRickshaw` and `MiniTruck` weights unused | Fine-tune on IDD; update the class maps |
| Plate strings synthetic without an OCR backend | Challan plates are not real reads; the pipe is real | `pip install easyocr` |
| Layer 4 is contract + simulated read-back | No physical actuation | Implement the MQTT publisher and NTCIP driver per the contract |
| Peer junctions run on mock perception | City map is orchestrated but not sensed | One perception process per edge node |
| Corridor progress uses an ETA fallback | Prototype GPS is static, so `tick()` advances by elapsed/ETA | Real GNSS stream drives `updateGps()` pass-detection |
| Command Dashboard AI panel is heuristic | Advisory text is rule-based, not learned | Train and serve a model; the panel already carries a confidence field |
| Revocation is per-junction | A revoked token dies locally, not city-wide | Broker fan-out of the revocation list |
| SSO is an email-to-role stub | Not authentication | Real OIDC/SAML |
