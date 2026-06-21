# 🚦 Integrated Traffic Management Stack — GatiShakti-ML × Layer-3 STM

This repository unifies two layers of an intelligent traffic-control system into
one runnable stack:

| Layer | Repo (subfolder) | Stack | Responsibility |
|-------|------------------|-------|----------------|
| **Layer 2 — Perception** | [`GatiShakti-ML/`](GatiShakti-ML/) | Python · FastAPI · YOLO11 · OpenCV | Computer vision: detects vehicles per approach, scores occupancy & confidence |
| **Layer 3 — Orchestration** | [`Layer-3_STM/`](Layer-3_STM/) | TypeScript · Node.js | Signal-timing decisions: scoring → max-pressure → safety → resilience |

The two aren't separate products — they're **stacked layers of one architecture**.
Perception (Layer 2) feeds signal-timing orchestration (Layer 3):

```
 GatiShakti-ML (Python CV)            Layer-3_STM (TypeScript)
 ┌───────────────────────┐           ┌──────────────────────────────┐
 │  YOLO11 per-approach   │  HTTP     │ M4 gate → M1 scoring →        │
 │  detection             │ ───────►  │ M2 max-pressure → M3 safety → │
 │  GET /perception/layer2│  Layer2   │ M4 resilience → Layer 4       │
 │  → Layer2Payload (JSON)│  Payload  │ (console actuation)           │
 └───────────────────────┘           └──────────────────────────────┘
```

## 🔗 How they're integrated

The integration replaces the STM's `MockDataGenerator` perception with **real
YOLO inference**:

1. **Layer 2 — new bridge endpoint.** `GET /perception/layer2` in
   [`GatiShakti-ML/app.py`](GatiShakti-ML/app.py) runs YOLO on one camera frame
   per approach (NORTH/SOUTH/EAST/WEST) and returns a ready-to-consume
   `Layer2Payload` — real per-class vehicle detections, occupancy derived from
   bounding-box coverage, and a calibrated CV-reliability score. Logic lives in
   [`GatiShakti-ML/predictors/perception.py`](GatiShakti-ML/predictors/perception.py).

2. **Layer 3 — live perception client.** [`Layer-3_STM/src/layer2-bridge.ts`](Layer-3_STM/src/layer2-bridge.ts)
   fetches that payload, and [`Layer-3_STM/src/live.ts`](Layer-3_STM/src/live.ts)
   (`npm run live`) runs the full orchestrator loop on it.

3. **Resilience by design.** If the perception service is unreachable, the live
   loop **degrades gracefully** to the mock generator and keeps running — the
   original `npm run dev` (pure-mock) and `npm run test` paths are untouched.

> The EMVS emergency channel and the historical-timing database remain mock
> inputs (they are not camera perception), exactly as in the original STM
> architecture.

---

## 🚀 Quick start

### 1. One-time setup
Installs Python CV deps (into `GatiShakti-ML/.venv`), ensures YOLO weights, and
installs Node deps:

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

(The repo already ships with a populated `.venv` and weights, so you can usually
skip straight to running.)

### 2. Run the whole stack with one command
Boots FastAPI, waits for health, then starts the STM live pipeline. Ctrl+C stops
both:

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File .\start.ps1
```
```bash
# Linux / macOS / Git-Bash
./start.sh
```

You'll see the live 30-second loop printing real detections feeding signal
decisions, e.g.:

```
📡 LAYER 2 (Perception · LIVE_CV):
   Confidence: 78.2%
   Detections: NORTH(31% · 13veh), SOUTH(5% · 8veh), EAST(20% · 10veh), WEST(12% · 15veh)
[OPTIMIZER] WEST selected | Pressure: 105.69 | Green: 90s
   🟢 SAFE TO EXECUTE
```

---

## 🛠️ Running the pieces individually

**Layer 2 — perception API only**
```bash
cd GatiShakti-ML
.venv/Scripts/python -m uvicorn app:app --reload --port 8000
# Swagger docs: http://localhost:8000/docs
```

**Layer 3 — orchestrator**
```bash
cd Layer-3_STM
npm run live    # NEW: live loop on real perception (falls back to mock if down)
npm run dev     # original continuous loop on mock perception
npm run test    # integration + chaos tests (one-shot)
```

---

## 🔧 Configuration

The STM live client reads two environment variables (see
[`Layer-3_STM/src/config.ts`](Layer-3_STM/src/config.ts)):

| Variable | Default | Meaning |
|----------|---------|---------|
| `PERCEPTION_URL` | `http://localhost:8000` | Base URL of the GatiShakti-ML service |
| `JUNCTION_ID` | `DEL_DL_ITO_01` | Junction id requested from perception |

### Demo the low-confidence fallback
The perception endpoint accepts an optional override so you can force the STM's
historical-fallback path:

```bash
curl "http://localhost:8000/perception/layer2?confidence=0.6"
```

---

## 📚 Per-layer documentation

- **Layer 2 / CV models & other endpoints** (`/predict/signal`, `/predict/buslane`,
  `/predict/parking`): see [`GatiShakti-ML/README.md`](GatiShakti-ML/README.md).
- **Layer 3 / 4-member pipeline, safety & resilience internals**: see
  [`Layer-3_STM/README.md`](Layer-3_STM/README.md).

---

## 🧱 The integration seam in one line

`GET /perception/layer2` is the contract boundary: Layer 2 produces a
`Layer2Payload`, Layer 3 consumes it. Match those shapes and either side can be
swapped (real cameras, a different optimizer) without touching the other.
