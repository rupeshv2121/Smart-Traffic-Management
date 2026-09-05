# 02 · Layer 2 — Perception & Detection (GatiShakti-ML)

> **Role:** turn pixels into structured traffic state. Layer 2 answers *"what is on each approach right now, and how
> much should we trust that reading?"* — and nothing else. It never decides which phase goes green.

| Property | Value |
|---|---|
| **Directory** | `GatiShakti-ML/` |
| **Stack** | Python 3.12 · FastAPI 0.115 · Uvicorn · Ultralytics YOLO11 · OpenCV (headless) · NumPy · Pillow · Pydantic v2 · structlog |
| **Port** | `8000` (interactive docs at `/docs`) |
| **Model weights** | `models/yolo11s.pt` — stock Ultralytics COCO model (~21 MB) |
| **Primary output** | `Layer2Payload` at `GET /perception/layer2` |
| **Consumers** | Layer 3 (`Layer2Bridge`), and any client of the three standalone `/predict/*` models |

---

## 1. Service architecture

```
                       ┌──────────────────────────────────────────────┐
                       │              app.py (FastAPI)                │
                       │  CORS · Pydantic response models · routing   │
                       └───┬───────────┬───────────┬──────────────┬───┘
                           │           │           │              │
        /perception/layer2 │  /predict │  /predict │     /predict │
                           │  /signal  │  /buslane │     /parking │
                           ▼           ▼           ▼              ▼
                ┌───────────────┐ ┌─────────┐ ┌──────────────┐ ┌──────────┐
                │ perception.py │ │Signal.py│ │lanemonitoring│ │parking.py│
                │ Layer-3 bridge│ │ timing  │ │  .py         │ │  slots   │
                └───────┬───────┘ └────┬────┘ └──────┬───────┘ └────┬─────┘
                        │              │             │              │
                        │        ┌─────▼─────────────▼──────────────▼─────┐
                        │        │   get_model() — lazy YOLO11 singleton  │
                        │        │   models/yolo11s.pt, loaded once/proc  │
                        │        └────────────────────────────────────────┘
                        │
                  ┌─────▼──────┐   ┌──────────┐
                  │  anpr.py   │   │  obs.py  │
                  │ plate OCR  │   │ structlog│
                  │ (pluggable)│   │  shim    │
                  └────────────┘   └──────────┘
```

**Model loading.** `predictors/Signal.py:get_model()` holds a module-level `Optional[YOLO]` singleton, so the weights
file is read from disk exactly once per process. `perception.py` deliberately imports *that* singleton rather than
creating its own, so the perception path and the signal path share one loaded model.
`lanemonitoring.py` and `parking.py` each keep their own singleton over the same weights file — a deliberate
allowance so they can be pointed at fine-tuned weights independently later.

---

## 2. The primary pipeline: `GET /perception/layer2`

This is the single endpoint Layer 3 polls each cycle. It is the whole reason Layer 2 exists in the control path.

```
GET /perception/layer2?junction_id=DEL_DL_ITO_01[&confidence=0.6]
   │
   ├─ cameras_for(junction_id)          → {NORTH,SOUTH,EAST,WEST} → Path
   ├─ read frames as bytes              → 500 if any frame is missing
   │
   └─ build_layer2_payload(junction_id, approach_images, confidence_override)
        │
        ├─ for each approach:  analyze_approach(bytes, approach_id)
        │     ├─ cv2.imdecode → BGR ndarray
        │     ├─ YOLO inference (verbose=False)
        │     ├─ map COCO class → STM VehicleType, accumulate counts
        │     ├─ accumulate box area  → spatialOccupancyPct
        │     ├─ accumulate box conf  → per-approach reliability
        │     ├─ derive waitingTimeSeconds, arrivalRatePerMin (heuristic)
        │     └─ → ApproachData (+ internal _confidence)
        │
        ├─ cvConfidenceScore = override ?? mean(per-approach reliability)
        ├─ synthesize_plate_events(approaches, images)   → ANPR PlateEvent[]
        ├─ log.info("layer2_built", ...)                  structured log
        └─ → Layer2Payload
```

### 2.1 Class mapping — COCO to STM

`perception.py` translates the COCO label space onto the STM's canonical vehicle taxonomy.

| COCO id | COCO class | STM `VehicleType` | STM weight (PCU) |
|---|---|---|---|
| 1 | bicycle | `Motorcycle` | 0.5 |
| 2 | car | `Car` | 1.0 |
| 3 | motorcycle | `Motorcycle` | 0.5 |
| 5 | bus | `Bus` | 3.0 |
| 7 | truck | `HeavyTruck` | 4.0 |

Types in the STM taxonomy that COCO cannot express — `AutoRickshaw` (1.2) and `MiniTruck` (2.0) — are never emitted
by this mapping. `Ambulance` (10.0) is **deliberately never produced from vision**: emergency vehicles enter the
system through the signed-token channel, not the perception payload, so a picture of an ambulance can never open a
corridor.

> **Known model limitation.** `yolo11s.pt` is COCO-trained and not fine-tuned for Indian traffic. Auto-rickshaws are
> commonly detected as `car` or `motorcycle`; non-standard buses are frequently classified `truck`. Upgrading is a
> two-file change: point `MODEL_PATH` at fine-tuned weights (e.g. trained on the Indian Driving Dataset) and update
> `COCO_TO_STM_VEHICLE` / `VEHICLE_CLASS_NAMES` to the new class ids. No caller changes.

### 2.2 Spatial occupancy

```python
covered_area += max(0, x2 - x1) * max(0, y2 - y1)      # per detected vehicle box
occupancy_pct = int(round(min(95.0, max(5.0, (covered_area / frame_area) * 100.0))))
```

Occupancy is the fraction of the frame covered by vehicle bounding boxes, clamped to **[5, 95]**. The clamp keeps
downstream arithmetic stable: 0 % would make queue-derived divisions degenerate, and 100 % would zero out all
downstream headroom in the max-pressure differential. Note that overlapping boxes double-count area, so the metric
is a *monotone proxy* for density rather than a calibrated occupancy — which is all Layer 3 needs, since it uses it
comparatively across approaches.

### 2.3 CV confidence — the calibration that matters

This is the single most consequential number Layer 2 produces: Layer 3's resilience gate trips below **0.70**.

```python
if confidences:
    approach_confidence = 0.5 + 0.5 * float(np.mean(confidences))
else:
    approach_confidence = 0.90            # empty but clear frame = a confident "no traffic" read
```

**Why the affine map.** A raw YOLO box confidence (~0.5–0.65 for small vehicles in busy frames) is *not* the same
quantity as "can we trust this scene read". Feeding raw box confidence straight into a 0.70 gate would keep the
system permanently in historical fallback on perfectly good frames. The map `0.5 + 0.5·mean` places a coherent set
of detections in the healthy **0.78–0.95** band while genuinely poor frames — sparse, low-confidence boxes from
rain, glare or blur — still land below 0.70 and correctly trigger the fallback.

The junction-level score is the arithmetic mean of the four per-approach reliabilities, clamped to [0, 1] and
rounded to 4 decimals.

**Manual override.** `?confidence=0.6` forces the score, which is the supported way to demonstrate the Layer-3
low-confidence historical-fallback path without degrading a real camera.

### 2.4 Derived temporal metrics

A still frame carries no temporal signal, so two fields are explicit heuristics:

```python
"waitingTimeSeconds": int(min(120, vehicle_count * 4)),
"arrivalRatePerMin":  int(min(40,  vehicle_count * 2)),
```

Both feed the Layer-3 priority score. They are honest estimates, documented as such, and are the first candidates
for replacement once a tracking-capable pipeline (e.g. ByteTrack over a video stream) is available — at which point
`waitingTimeSeconds` becomes a real dwell measurement and `arrivalRatePerMin` a real flow count.

### 2.5 Detections array stability

If a frame yields no vehicles, the payload still carries `[{"type": "Car", "count": 0}]`. This guarantees downstream
scoring never sees an empty array, keeping `calculatePersonFlow()` and the reducers stable.

---

## 3. ANPR and the challan pipe

`synthesize_plate_events()` produces `PlateEvent` records that flow into Layer 5's violation queue.

```
detections per approach
   │  total == 0  → skip
   │  random() > 0.25 → skip           (low emission rate: a realistic queue growth)
   ▼
choose violation type
   • two-wheelers present  → 50 % NO_HELMET, else uniform over the five types
   ▼
plate string
   • read_plate(frame)  — real OCR when a backend is installed
   • else _synth_plate() — plausible Delhi-region plate
   ▼
PlateEvent { plate, approachId, violation, confidence, [speedKmph] }
```

**The pipe is real; the plate string may not be.** `predictors/anpr.py` is a pluggable hook resolving
EasyOCR → Tesseract → `None`. With no backend installed it returns `None` and the caller synthesises a plate; the
event still travels the full path (perception → `Layer2Bridge` → `ChallanStore` → Layer-5 Challan Review). Installing
`easyocr` is the single swap that makes reads genuine — no other file changes.

| Violation | Fine (₹) | Emitted when |
|---|---|---|
| `RED_LIGHT` | 1 000 | uniform pick |
| `NO_HELMET` | 1 000 | biased when two-wheelers detected |
| `WRONG_LANE` | 1 500 | uniform pick; also generated from bus-lane violations in Layer 3 |
| `SPEEDING` | 2 000 | uniform pick; carries `speedKmph` 62–88 |
| `STOP_LINE` | 500 | uniform pick |

Fines are defined Layer-3 side in `src/challan/challan-store.ts`.

---

## 4. The three standalone models

These are not in the 30 s control loop (except bus-lane, which Layer 3 polls opportunistically). They are
independently callable products.

### 4.1 `POST /predict/signal` — adaptive signal timing

Single-camera timing recommendation. **Note:** this is a *separate, self-contained* timing model from the Layer-3
max-pressure optimiser; Layer 3 does not consume it. It exists for standalone single-junction deployments and for
comparison.

**Request** (`multipart/form-data`): `traffic_image` (file), `road_width` (float, metres), `signal_id` (str),
`timestamp` (opt), `previous_vehicle_count` (int), `previous_red_light_time` (float).

**Algorithm:**

```python
lanes         = max(1, round(road_width / 3.5))       # 3.5 m per lane
veh_per_lane  = vehicle_count / lanes
density       = Low (<8) | Medium (<15) | High (<25) | Severe (≥25)

width_factor  = max(road_width / 7.0, 0.5)            # 7 m ≈ standard 2-lane road
green_time    = clamp(vehicle_count * 1.0 / width_factor,
                      MIN_GREEN=10,
                      MAX_GREEN_SEVERE=90 if density == "Severe" else MAX_GREEN=60)
yellow_time   = 5.0
red_time      = max(10, previous_vehicle_count * 1.5)  # adaptive feedback from last cycle

confidence    = max(0.5, 1 - |count - prev| / max(prev,1))   if prev > 0 else 0.75
```

Severe congestion is given a longer green ceiling (90 s vs 60 s) so a genuine backlog can clear. The confidence
score is a *stability* measure — it is high when consecutive counts agree, which is a proxy for a settled scene.

**Response:** `vehicle_count`, `traffic_density`, `recommended_{green,yellow,red}_time`, `confidence_score`,
`signal_id`, `timestamp`, `annotated_image` (base64 JPEG with green boxes and class labels).

### 4.2 `POST /predict/buslane` — bus-lane violation detection

**Request:** `lane_image` (file), `signal_id` (int), `bus_lane_coordinates` (JSON string — a polygon of `[x, y]`
pairs; 8 points recommended, 4 along the near/wide edge and 4 along the far/narrow edge, to trace the lane's
perspective; any polygon with ≥3 points is accepted).

**Algorithm:**

1. `decode_image()` — EXIF-transposed decode. **This must stay byte-identical to `parking.py`'s decoder**, because
   polygons picked with `tools/pick_lane.py` are in that decoder's coordinate frame.
2. YOLO inference; keep only tracked classes `{1 Bicycle, 2 Car, 3 Bike, 5 Bus, 7 Truck}`.
3. Compute each box centre `(cx, cy)`; test `cv2.pointPolygonTest(lane_polygon, (cx,cy)) >= 0`.
4. Skip authorised classes `{5 Bus, 7 Truck}`. **Truck is authorised deliberately** — many Indian buses are
   misclassified as trucks by a stock COCO model, and excluding trucks would flood the queue with false violations
   against actual buses.
5. Everything else inside the polygon is a violation.

**Response:** `unauthorized_count`, `confidence_score` (mean confidence over violating boxes, `0.0` when none),
`violations[] {type, bbox}`, `annotated_image` (yellow lane outline, red violation boxes with class labels).

**Layer-3 integration:** `live.ts` calls `bridge.fetchBusLane()` each cycle. Violations are converted into
`WRONG_LANE` plate events with synthesised Delhi-series plates and pushed into the challan queue, and the raw result
(including the annotated image) is attached to the `CycleSnapshot` as `busLane`. If the endpoint is unreachable the
cycle simply skips it — it is never allowed to break the control loop.

### 4.3 `POST /predict/parking` — parking-slot occupancy

**Request:** `parking_image` (file), `parking_id` (str), `parking_slots` (JSON string —
`[{"id": 1, "coordinates": [x1,y1,x2,y2,x3,y3,x4,y4]}, ...]`; flat pairs, ≥3 points per slot).

**Algorithm:** detect vehicles `{2 car, 3 motorcycle, 5 bus, 7 truck}`, take each box centre, and mark a slot
`Occupied` if any centre falls inside its polygon.

**Response:** `total_slots`, `occupied_slots`, `vacant_slots`, `occupancy_rate` (integer percent),
`confidence_score`, `slot_status[] {id, status}`, `annotated_image` (semi-transparent fill at α=0.25 — green
occupied, red vacant — with per-slot `id: status` labels).

---

## 5. Geometry tooling

| Tool | Produces | Used by |
|---|---|---|
| `tools/pick_lane.py` | `lanecoordinates.json` — bus-lane polygons | `/predict/buslane`, `Layer2Bridge` |
| `tools/pick_slots.py` | `slots.json` — parking-slot quads | `/predict/parking` |
| `tools/webcam_test.py` | Live webcam sanity check of the detector | development |

Both pickers open the image through the **same** EXIF-aware decoder used at inference time. Using a different image
viewer to read off coordinates will produce a silent offset on any photo carrying an EXIF orientation flag.

---

## 6. Observability

`predictors/obs.py` provides `get_logger(name)` — structlog when installed, otherwise a stdlib JSON shim with the
same call signature. The perception builder emits one structured event per payload:

```json
{"event": "layer2_built", "junction": "DEL_DL_ITO_01", "cv_confidence": 0.8421,
 "approaches": 4, "plate_events": 1}
```

---

## 7. Operating the service

```bash
cd GatiShakti-ML
python -m venv .venv && .venv/Scripts/activate     # Windows
pip install -r requirements.txt
python scripts/download_models.py                  # fetches yolo11s.pt into models/
.venv/Scripts/python -m uvicorn app:app --reload --port 8000
```

**Verification:**

```bash
curl http://localhost:8000/health
curl "http://localhost:8000/perception/layer2?junction_id=DEL_DL_ITO_01" | head -c 400
curl "http://localhost:8000/perception/layer2?confidence=0.6"     # force the L3 fallback path
```

**CORS:** `allow_origins=["*"]` — appropriate for local and demo use. For production, replace with the exact
frontend origin(s). CORS affects only browser-originated requests; server-to-server calls from Layer 3 are
unaffected either way.

---

## 8. Performance and scaling notes

| Concern | Current behaviour | Scaling path |
|---|---|---|
| Inference cost | 4 sequential YOLO passes per cycle, CPU-bound with `opencv-python-headless` | Batch the four frames into one inference call; move to GPU/`onnxruntime`; the 30 s cycle gives generous headroom |
| Model memory | One `yolo11s.pt` per predictor module holding a singleton | Share a single loader across all four modules if memory-constrained |
| Concurrency | FastAPI async endpoints, but YOLO inference is synchronous and blocks the event loop | Run inference in a thread pool (`run_in_threadpool`) if serving multiple junctions from one process |
| Multi-junction | `JUNCTION_CAMERAS` registry, unknown ids fall back to samples | One perception process per edge node is the intended topology; the registry supports co-located junctions |
| Cold start | First request pays the weights load (~1 s) | Warm the singleton at startup with a dummy inference |

---

## 9. Contract compliance

The Pydantic models in `app.py` (`Layer2Payload`, `ApproachData`, `VehicleDetection`, `PlateEvent`) **mirror** the
TypeScript interfaces in `Layer-3_STM/src/types/types.ts`. Field names are camelCase on the wire to match the
TypeScript side.

> **Normative:** any change to `Layer2Payload` must be applied to both files in the same change set. The Layer-3
> bridge additionally normalises `plate_events` / `plateEvents` (snake and camel case) defensively, but this is a
> compatibility shim, not a licence to diverge.

Full field definitions: [Data Contracts](data-contracts.md#1-layer2payload-layer-2--layer-3).
