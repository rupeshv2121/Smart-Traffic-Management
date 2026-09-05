# STM — Smart Traffic Management System · Technical Documentation

**System:** City-scale adaptive traffic-signal optimisation with a secure emergency green-corridor service.
**Deployment target:** Delhi NCT (live junction: `DEL_DL_ITO_01`, ITO Crossing).
**Architecture baseline:** STM Solution Architecture v2.0 — five layers, two systems, two cross-cutting spines.

---

## 1. How to read this documentation

| # | Document | Covers |
|---|---|---|
| 00 | [System Architecture](00-system-architecture.md) | The whole stack: layer model, two-system split, end-to-end pipeline, repository map, port map, runtime topology. |
| 01 | [Layer 1 — Sensing & EMV Telemetry](layer-1-sensing-and-emv-telemetry.md) | Physical sensing plane: approach cameras, the EMV token/GPS intake, edge heartbeat. |
| 02 | [Layer 2 — Perception (Computer Vision)](layer-2-perception-ml.md) | `GatiShakti-ML`: YOLO11 inference, occupancy/confidence derivation, ANPR, bus-lane and parking models. |
| 03 | [Layer 3 — Decision & Optimisation](layer-3-decision-orchestration.md) | `Layer-3_STM`: max-pressure optimiser, safety supervisor, resilience ladder, EMV trust gate, corridor manager, persistence, gateway. |
| 04 | [Layer 4 — Communication & Control](layer-4-communication-and-control.md) | Actuation contract, execution modes, NTCIP mapping, MQTT transport, controller read-back. |
| 05 | [Layer 5 — Command & Operations](layer-5-command-and-operations.md) | The React operations portal: modules, RBAC, SSE stream, screens, public app. |
| 06 | [3D Simulator](simulator-green-corridor-sim.md) | `green-corridor-sim`: scene graph, local traffic controller, lane tracker, postMessage bridge. |
| 07 | [Cross-Cutting: Security & Trust](cross-cutting-security-and-trust.md) | Ed25519 corridor tokens, five-check verifier, JWT/RBAC, threat model. |
| 08 | [Cross-Cutting: Resilience & Fail-Safe](cross-cutting-resilience-and-failsafe.md) | The 4-state degradation ladder, fallback derivation, graceful-degradation matrix. |
| 09 | [Data Contracts](data-contracts.md) | Every inter-layer schema with field-level definitions and ownership. |
| 10 | [API Reference](api-reference.md) | All HTTP/SSE/WebSocket endpoints across the three services. |
| 11 | [Operations Runbook](operations-runbook.md) | Install, run, configure, verify, troubleshoot, deploy. |
| — | [L3 → L4 Actuation Contract](L3-L4-actuation-contract.md) | Signed inter-team wire contract (pre-existing, normative). |

---

## 2. The system in one paragraph

Four approach cameras at a junction are read every cycle by a YOLO11 perception service (**Layer 2**), which emits a
single `Layer2Payload` describing per-approach vehicle mix, spatial occupancy and a calibrated CV-confidence score.
The Layer-3 orchestrator (**Layer 3**) consumes that payload every 30 s, scores each approach with a person-centric
weighting, runs a max-pressure differential to pick the phase to release, and passes the proposal through a
deterministic **Safety Supervisor** that owns every signal change. In parallel, a signed emergency-vehicle token
(**Layer 1** telemetry) can preempt normal optimisation and open a multi-junction **green corridor**, routed with
A\* and re-planned with D\* Lite. The approved `ActuationCommand` goes to the field controller (**Layer 4**), and a
flattened `CycleSnapshot` is broadcast to the operations portal (**Layer 5**) over SSE and persisted for analytics
and audit (**Data/Logging**). Two spines run through everything: **Security & Trust** (nothing preempts without a
verified token; nothing writes without a verified JWT) and **Resilience** (a four-rung ladder degrades from full
adaptive control to a fixed-time fail-safe plan rather than failing outright).

---

## 3. Layer-to-implementation map

| Layer | Name | Implementation | Language / Runtime | Port |
|---|---|---|---|---|
| 1 | Sensing & Telemetry | Camera frames + `EmvIngestServer` | Files / Node HTTP | 8100 |
| 2 | Perception & Detection | `GatiShakti-ML/` | Python · FastAPI · YOLO11 · OpenCV | 8000 |
| 3 | Decision & Optimisation | `Layer-3_STM/` | TypeScript · Node.js | 8200 (gateway) |
| 4 | Communication & Control | Contract + simulated read-back | MQTT / NTCIP (spec) | — |
| 5 | Command & Operations | `Layer-5/` | React 18 · Vite · TypeScript | 5273 |
| — | 3D Simulator | `green-corridor-sim/` | React · Three.js (R3F) | 8081 |

---

## 4. Documentation conventions

- **Normative** statements use MUST / MUST NOT / SHOULD. They describe contracts other teams depend on.
- **Source of truth** callouts name the exact file that defines a schema. If a document and the code disagree,
  the named file wins and the document is a defect.
- Code references are given as `path/to/file.ts:line` where a specific site matters.
- All times are seconds unless suffixed; all timestamps are ISO-8601 UTC; all coordinates are WGS84.
- Currency amounts are Indian Rupees (₹).
