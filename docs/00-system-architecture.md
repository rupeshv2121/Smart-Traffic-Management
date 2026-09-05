# 00 · System Architecture

> **Scope:** the whole STM stack — layer model, system split, control-loop timing, runtime topology, data flow,
> repository layout and the seams between components.

---

## 1. Architectural principles

The design rests on six principles. Every layer document refers back to these.

| # | Principle | What it means in code |
|---|---|---|
| **P1** | **Sense → Process → Decide → Guard → Act → Log** | The cycle is a strict pipeline. No stage may skip the *Guard* step. |
| **P2** | **The Safety Supervisor owns every signal change** | `SafetySupervisor.validateProposedActuation()` is the only path to an actuation command. Optimiser output is a *proposal*, never a command. |
| **P3** | **Degrade, never fail** | Four resilience rungs (see [Resilience](cross-cutting-resilience-and-failsafe.md)). Each failure mode has a defined, less-capable but safe successor state. |
| **P4** | **Trust is verified at the point of use** | An emergency token is verified *at each junction*, not just at dispatch. Fail-closed: no trust config means no preemption. |
| **P5** | **Layers communicate only through published contracts** | Layer 5 never imports Layer-3 internals; it consumes `CycleSnapshot`. Layer 3 never imports YOLO; it consumes `Layer2Payload`. |
| **P6** | **Everything decided is logged** | One append-only audit record per cycle plus one per operator action; a full `CycleSnapshot` history backs analytics and the fallback loop. |

---

## 2. The five-layer model

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  LAYER 5 — DATA, LOGGING, ANALYTICS & COMMAND                                │
│  Operations portal · RBAC · audit · analytics · challan · public app         │
│  Layer-5/ (React)  ◄── SSE/WS ──  Layer-3_STM/src/dashboard/ (gateway)       │
└───────────────────────────────▲──────────────────────────────────────────────┘
                                │ CycleSnapshot · CitySnapshot   (read)
                                │ Override · Dispatch · Challan  (write, JWT)
┌───────────────────────────────┴──────────────────────────────────────────────┐
│  LAYER 3 — DECISION & OPTIMISATION                          [Layer-3_STM/]   │
│                                                                              │
│   EMV Trust Gate ──► Resilience Ladder ──► Max-Pressure ──► Safety           │
│   (5 checks)         (4 rungs)              Optimiser        Supervisor      │
│                                                                 │            │
│   Corridor Manager (A* / D* Lite · reservations · sequencing)    │            │
└─────────────────────────────────────────────────────────────────┼────────────┘
             ▲                                                    │ ActuationCommand
             │ Layer2Payload (HTTP, 30 s)                         ▼
┌────────────┴─────────────────────────┐   ┌──────────────────────────────────┐
│  LAYER 2 — PERCEPTION & DETECTION    │   │  LAYER 4 — COMMUNICATION &       │
│  [GatiShakti-ML/]                    │   │  CONTROL                         │
│  YOLO11 · occupancy · confidence     │   │  MQTT bus · NTCIP SET · read-back│
│  ANPR · bus-lane · parking           │   └──────────────┬───────────────────┘
└────────────▲─────────────────────────┘                  │
             │ frames                                     ▼ field controller
┌────────────┴──────────────────────────────────────────────────────────────────┐
│  LAYER 1 — SENSING                                                            │
│  Approach cameras (N/S/E/W)   ·   EMV device telemetry (signed token + GPS)   │
└───────────────────────────────────────────────────────────────────────────────┘

CROSS-CUTTING SPINE A — SECURITY & TRUST       (Ed25519 tokens · JWT · RBAC · audit)
CROSS-CUTTING SPINE B — RESILIENCE & FAIL-SAFE (4-state ladder · historical fallback)
```

### Layer responsibilities (normative)

| Layer | Owns | Must not |
|---|---|---|
| **1 — Sensing** | Raw frames; EMV token + GPS presence, expiry, revocation. | Decide trust. Decide timing. |
| **2 — Perception** | Turning pixels into counts, occupancy, confidence, plate events. | Decide which phase goes green. |
| **3 — Decision** | Scoring, phase selection, green duration, safety interlocks, corridor lifecycle, trust verification, persistence. | Talk to hardware directly. Render UI. |
| **4 — Comm & Control** | Delivering the command to the controller; clamping to hard safety floors; status read-back. | Re-optimise. Invent durations (except `SAFE_DEFAULT`). |
| **5 — Data & Command** | Presentation, audit, analytics, enforcement workflow, operator write-path. | Bypass the gateway to reach control logic. |

---

## 3. The two-system split

The architecture separates an **automatic physical system** from a **human-facing digital system** that share one
durable store.

| | System 1 — Physical / Edge | System 2 — Digital / Applications |
|---|---|---|
| **Runs** | Continuously, unattended, at a 30 s cycle | On demand, driven by operators and citizens |
| **Components** | Cameras → YOLO11 → orchestrator → Safety Supervisor → controller | EMVS dispatch, Corridor Inspector (TI), Challan review, Administration, Common-User app |
| **Latency budget** | Hard: one cycle | Soft: interactive |
| **Failure posture** | Must degrade to a safe fixed-time plan | May degrade to read-only |
| **Data access** | Owns the write path to live control state | **Always** through the Data Access Layer (the Layer-3 gateway + persistence), never the database directly |

The gateway (`Layer-3_STM/src/dashboard/dashboard-gateway.ts`) *is* the Data Access Layer boundary. System 2 has
exactly three write verbs, all JWT and role guarded: manual phase override, EMV dispatch, challan resolution.

---

## 4. The 30-second control loop

`Layer-3_STM/src/live.ts` drives one iteration every `PIPELINE_CYCLE_MS = 30_000`.

```
 t+0 s   ├─ recordHeartbeat()                    edge liveness pulse (resilience ladder)
         ├─ GET /perception/layer2               Layer 2 · YOLO on 4 approach frames
         │    └─ on failure → MockDataGenerator  (graceful degradation, source=MOCK_FALLBACK)
         ├─ GET /predict/buslane                 optional; violations → challan queue
         ├─ corridorManager.register/updateGps/tick
         │    └─ pass-detection · re-plan · promote held EMV · release reservations
         ├─ emvIngest.getActiveToken()           the granted, signed corridor token (or null)
         ├─ deriveFallbackPlans(history)         time-of-day historical plans
         ├─ orchestrateActuation(...)            ── the decision pipeline, section 5 below
         ├─ apply manual override                (emergency always wins; deferral audited)
         ├─ buildSnapshot() → dashboard.broadcast()      SSE `snapshot`
         ├─ buildCitySnapshot() → broadcastCity()        SSE `city`
         ├─ control.audit(...)                   append-only audit record
         ├─ challans.ingest(plateEvents)         ANPR → violation queue
         └─ registry.touchHeartbeat("EN-118")    edge node stays ONLINE
 t+30 s  └─ repeat
```

Every iteration is wrapped in an OpenTelemetry span named `pipeline.cycle`, tagged with `stm.cycle`, `stm.mode`,
`stm.phase`, `stm.cvConfidence`, `stm.safetyPassed`.

---

## 5. The decision pipeline (Layer 3 internals)

```
Layer2Payload + EmergencyToken? + HistoricalTimingPlan[]
        │
   ┌────▼───────────────────────────────────────────────────────────┐
   │ STAGE 0-pre  EMV TRUST GATE            EmvVerifier             │
   │   signature · time-bound · route-scope · revocation · GPS      │
   │   FAIL ⇒ token := null  (fail-closed; corridor request ignored)│
   └────┬───────────────────────────────────────────────────────────┘
   ┌────▼───────────────────────────────────────────────────────────┐
   │ STAGE 0    CORRIDOR RECONCILIATION                             │
   │   no token and corridor active ⇒ resume() + arm recovery window│
   └────┬───────────────────────────────────────────────────────────┘
   ┌────▼───────────────────────────────────────────────────────────┐
   │ STAGE 0b   RESILIENCE LADDER          computeLadderState()     │
   │   TOTAL_FAILSAFE      ⇒ short-circuit to SAFE_DEFAULT          │
   │   LOCALLY_AUTONOMOUS  ⇒ continue, flagged (no coordination)    │
   └────┬───────────────────────────────────────────────────────────┘
   ┌────▼───────────────────────────────────────────────────────────┐
   │ STAGE 1    DATA STALENESS   age > 10 s ⇒ HISTORICAL_FALLBACK   │
   │ STAGE 2    CONFIDENCE GATE  cv < 0.70 ⇒ HISTORICAL_FALLBACK    │
   │            (both bypassed when a VERIFIED token is present —   │
   │             a corridor is GPS/token-primary, not camera-bound) │
   └────┬───────────────────────────────────────────────────────────┘
   ┌────▼───────────────────────────────────────────────────────────┐
   │ STAGE 3    PROPOSAL                                            │
   │   emergency ⇒ EmergencyResponse (conflictIndex, green window)  │
   │   normal    ⇒ scoreAllApproaches → max-pressure → ProposedPlan │
   └────┬───────────────────────────────────────────────────────────┘
   ┌────▼───────────────────────────────────────────────────────────┐
   │ STAGE 4    SAFETY VALIDATION          SafetySupervisor         │
   │   conflicting greens        ⇒ FORCE_FALLBACK  (SAFE_DEFAULT)   │
   │   min-green / ped-walk      ⇒ MAINTAIN_CURRENT_STATE (HOLD)    │
   │   otherwise                 ⇒ EXECUTE_PHASE_TRANSITION + Y/AR  │
   │   phase-state is committed ONLY after this approves            │
   └────┬───────────────────────────────────────────────────────────┘
   ┌────▼───────────────────────────────────────────────────────────┐
   │ STAGE 5-6  BUILD COMMAND + RESILIENCE ENFORCEMENT              │
   │   ActuationCommand; hijackAndEnforceHistorical() may override  │
   └────┬───────────────────────────────────────────────────────────┘
        ▼
  OrchestratorResult { finalCommand, executionPath, safetyValidationPassed,
                       confidenceScore, reasonChain[], ladderState, link }
```

**Execution paths:** `NORMAL_MODE` · `EMERGENCY_MODE` · `FALLBACK_MODE` · `OVERRIDE_MODE`.

**Execution modes** (the wire value sent to Layer 4): `NORMAL_MAX_PRESSURE` · `GREEN_CORRIDOR` ·
`HISTORICAL_FALLBACK` · `SAFE_DEFAULT` · `MANUAL_OVERRIDE`.

---

## 6. Runtime topology

```
                         ┌────────────────────────────────┐
                         │  Browser — Operator / Citizen  │
                         └───┬────────────────────────┬───┘
                             │ :5273 (Vite)           │ iframe :8081
                    ┌────────▼─────────┐     ┌────────▼──────────┐
                    │  Layer-5 React   │     │ green-corridor-sim│
                    │  operations UI   │◄───►│ 3D scene (R3F)    │
                    └────────┬─────────┘ postMessage bridge      │
        SSE /events · WS /stream │  REST (Bearer JWT)            │
                    ┌────────▼───────────────────────────────────┴──┐
                    │  Layer-3_STM  ·  Node/TypeScript              │
                    │  :8200 DashboardGateway  (SSE·WS·REST·metrics)│
                    │  :8100 EmvIngestServer   (token intake)       │
                    │  in-proc: orchestrator · corridor manager     │
                    └───┬───────────────────┬──────────────────┬────┘
     HTTP /perception/  │                   │ file / SQL       │ Redis
     layer2, /predict/  │                   ▼                  ▼
     buslane            │        ┌────────────────────┐ ┌──────────────┐
                    ┌───▼──────┐ │ .data/*.jsonl  OR  │ │ Redis hot    │
                    │GatiShakti│ │ TimescaleDB (pg16) │ │ store (opt.) │
                    │-ML :8000 │ └────────────────────┘ └──────────────┘
                    │ YOLO11   │
                    └──────────┘
```

### Port map

| Port | Service | Protocols | Purpose |
|---|---|---|---|
| `8000` | GatiShakti-ML (FastAPI) | HTTP | Perception + detection endpoints, OpenAPI docs at `/docs` |
| `8100` | EMV Ingest (Node HTTP) | HTTP | Signed emergency token intake / revocation |
| `8200` | Dashboard Gateway (Node HTTP + `ws`) | HTTP · SSE · WebSocket | Live stream, control write-path, analytics, metrics |
| `5273` | Layer-5 (Vite dev server) | HTTP | Operations portal |
| `8081` | green-corridor-sim (Vite) | HTTP | 3D simulator, embedded as an iframe |
| `5432` | TimescaleDB (optional) | PostgreSQL | Durable persistence |
| `6379` | Redis (optional) | RESP | Hot live-state store |

---

## 7. Integration seams

Five seams carry all inter-component traffic. Each has a named owner and a source-of-truth file.

| # | Seam | Transport | Payload | Source of truth |
|---|---|---|---|---|
| **S1** | Layer 2 → Layer 3 | HTTP GET, 30 s poll | `Layer2Payload` | `Layer-3_STM/src/types/types.ts` mirrored in `GatiShakti-ML/app.py` |
| **S2** | Layer 1 → Layer 3 | HTTP POST | `EmergencyToken` | `Layer-3_STM/src/types/types.ts` |
| **S3** | Layer 3 → Layer 4 | MQTT (spec) `stm/junction/{id}/command` | `ActuationCommand` | [L3-L4 contract](L3-L4-actuation-contract.md) |
| **S4** | Layer 3 → Layer 5 | SSE `/events`, WS `/stream` | `CycleSnapshot`, `CitySnapshot` | `Layer-3_STM/src/dashboard/snapshot.ts`, `city.ts` |
| **S5** | Layer 5 ⇄ Simulator | `window.postMessage` | Signal / emergency / count / corridor frames | `Layer-5/src/pages/SimulationPage.tsx` |

> **Contract-drift rule.** `Layer-5/src/types/snapshot.ts` is a hand-maintained *mirror* of S4. Any change to
> `snapshot.ts` or `city.ts` in Layer 3 MUST be applied to the mirror in the same commit.

---

## 8. Repository layout

```
Layer_23/
├── GatiShakti-ML/              LAYER 2 — Python perception service
│   ├── app.py                  FastAPI entrypoint, endpoint + response models
│   ├── predictors/
│   │   ├── perception.py       Layer2Payload builder (the STM bridge)
│   │   ├── Signal.py           YOLO singleton + adaptive signal timing model
│   │   ├── lanemonitoring.py   Bus-lane violation detector
│   │   ├── parking.py          Parking-slot occupancy detector
│   │   ├── anpr.py             Pluggable plate-OCR hook (EasyOCR → Tesseract → None)
│   │   └── obs.py              structlog / stdlib-JSON logging shim
│   ├── scripts/download_models.py
│   ├── tools/                  pick_lane.py · pick_slots.py · webcam_test.py
│   ├── models/                 yolo11s.pt weights
│   └── lanecoordinates.json, slots.json
│
├── Layer-3_STM/                LAYER 3 — TypeScript decision engine
│   ├── src/
│   │   ├── config.ts           Single source of truth for tunables + env
│   │   ├── types/types.ts      Domain contracts + scoring functions
│   │   ├── live.ts             Live 30 s loop (production entrypoint)
│   │   ├── main.ts             Mock-driven continuous loop
│   │   ├── index.ts            Integration + chaos test harness
│   │   ├── stm-orchestrator.ts The 6-stage decision pipeline
│   │   ├── max-pressure-optimizer.ts
│   │   ├── safety-supervisor.ts
│   │   ├── resilience-handler.ts
│   │   ├── layer2-bridge.ts    Live perception client
│   │   ├── emv/                Trust gate · crypto · corridor · routing · intake
│   │   ├── dashboard/          Gateway · snapshot · city · junctions · congestion
│   │   ├── control/            Manual override channel · historical fallback
│   │   ├── persistence/        File + Postgres adapters
│   │   ├── hotstore/           Redis + null adapters
│   │   ├── auth/               HS256 JWT + scrypt user store
│   │   ├── challan/            Violation queue
│   │   ├── registry/           Edge nodes · users · zones
│   │   ├── multi/              Peer-junction orchestration
│   │   └── observability/      OpenTelemetry tracing
│   └── docker-compose.yml      TimescaleDB + Redis
│
├── Layer-5/                    LAYER 5 — React operations portal
│   └── src/{pages,components,context,hooks,lib,types}/
│
├── green-corridor-sim/         3D simulator (React Three Fiber)
│   └── src/{simulation,components/simulation,components/vehicles,pages}/
│
├── docs/                       ◄ this documentation set
├── setup.ps1 · start.ps1 · start.sh
└── README.md
```

---

## 9. Key system constants

Defined in `Layer-3_STM/src/config.ts` unless noted.

| Constant | Value | Meaning |
|---|---|---|
| `PIPELINE_CYCLE_MS` | 30 000 | Control-loop period |
| `MIN_YELLOW_SECONDS` | 5 | Clearance floor, yellow |
| `MIN_ALL_RED_SECONDS` | 2 | Clearance floor, all-red |
| `MIN_PEDESTRIAN_WALK_SECONDS` | 8 | Pedestrian phase integrity floor |
| `MIN_GREEN_ENFORCED` | 10 | Minimum dwell before a phase may be cut |
| `CONFIDENCE_CRITICAL` | 0.70 | Below this ⇒ historical fallback |
| `CONFIDENCE_WARNING` | 0.80 | Below this ⇒ monitored, still adaptive |
| `MAX_DATA_AGE_SECONDS` | 10 | Perception staleness ceiling |
| `MIN_GREEN` / `MAX_GREEN` | 15 / 90 | Optimiser green bounds (`max-pressure-optimizer.ts`) |
| `SCALING_FACTOR` | 1.5 | Priority-score to seconds gain |
| `EXTENSION_SEC` | 10 | Adaptive green extension step |
| `RECOVERY_CYCLES` | 3 | Post-corridor spillback recovery window |
| `PASS_RADIUS_M` | 180 | GPS pass-detection radius (`corridor-manager.ts`) |
| `MAX_OVERRIDE_SECONDS` | 120 | Manual override ceiling (`control-channel.ts`) |

---

## 10. Non-functional characteristics

| Attribute | Design position |
|---|---|
| **Determinism** | Safety logic is strictly synchronous and side-effect free; the verifier and ladder take injectable clocks so behaviour is reproducible under test. |
| **Statelessness of the optimiser** | `runMaxPressureOptimizer()` is a pure function. All mutable state (pause registry, recovery window) lives in the `MaxPressureOptimizer` instance, scoped per controller — an EMV corridor at one junction cannot leak into another. |
| **Zero-infrastructure default** | With no `DATABASE_URL`, `REDIS_URL` or `OTEL_*`, the stack runs end-to-end on a file store, in-memory hot state and no-op tracing. |
| **Graceful degradation** | Every external dependency (perception, Postgres, Redis, OTel collector, bus-lane endpoint) has a defined fallback that keeps the loop running. |
| **Auditability** | Every cycle and every operator action appends an immutable record; the `reasonChain` explains each decision in ordered prose. |
| **Observability** | Prometheus at `GET /metrics`, OTel spans per cycle, structured JSON logs on the Python side. |
