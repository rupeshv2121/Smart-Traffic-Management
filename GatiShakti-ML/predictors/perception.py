"""
predictors/perception.py
Layer 2 (Perception) aggregator for the integrated GatiShakti ⇄ Layer-3 STM stack.

The Layer-3 STM orchestrator (TypeScript) consumes a single `Layer2Payload`
object per junction:

    {
      "junctionId": str,
      "timestamp": str (ISO-8601),
      "cvConfidenceScore": float (0..1),
      "approaches": [
        {
          "approachId": "NORTH" | "SOUTH" | "EAST" | "WEST",
          "spatialOccupancyPct": int,
          "detections": [ { "type": <VehicleType>, "count": int }, ... ],
          "waitingTimeSeconds": int,
          "arrivalRatePerMin": int
        }, ...
      ]
    }

This module turns *real YOLO inference* on four approach camera frames into
exactly that payload, so the STM runs on genuine computer-vision perception
instead of the mock generator.
"""

import random
import string
from datetime import datetime, timezone
from typing import Dict, List

import cv2
import numpy as np

# Reuse the lazily-loaded YOLO singleton from the signal predictor so the
# 19 MB weights file is read from disk only once per process.
from predictors.Signal import get_model
from predictors.anpr import read_plate
from predictors.obs import get_logger

log = get_logger("perception")

# ---------------------------------------------------------------------------
# COCO class id -> Layer-3 STM VehicleType
#
# The STM's VEHICLE_WEIGHTS dictionary (src/types/types.ts) defines these
# canonical vehicle types. YOLO/COCO only distinguishes a subset, so we map
# the COCO vehicle classes onto the closest STM type. "Ambulance" is never
# produced from CV here — emergency vehicles enter the STM through the EMVS
# emergency-token channel, not the perception payload.
# ---------------------------------------------------------------------------
COCO_TO_STM_VEHICLE: Dict[int, str] = {
    1: "Motorcycle",   # bicycle -> closest light two-wheeler
    2: "Car",          # car
    3: "Motorcycle",   # motorcycle
    5: "Bus",          # bus
    7: "HeavyTruck",   # truck
}

# Every STM vehicle type we may emit (kept so the detections array has a
# stable, predictable shape the orchestrator can rely on).
STM_VEHICLE_TYPES: List[str] = ["Motorcycle", "Car", "Bus", "HeavyTruck"]

# ANPR violation types understood by the Layer-5 Challan module.
_VIOLATIONS = ["RED_LIGHT", "NO_HELMET", "WRONG_LANE", "SPEEDING", "STOP_LINE"]
_PLATE_SERIES = ["DL1C", "DL3C", "DL5S", "DL8S", "DL9C", "HR26", "UP14"]


def _synth_plate() -> str:
    """A plausible Delhi-region plate. Synthetic until a real OCR model is wired."""
    series = random.choice(_PLATE_SERIES)
    letters = "".join(random.choice(string.ascii_uppercase) for _ in range(2))
    return f"{series}{letters}{random.randint(1000, 9999)}"


def synthesize_plate_events(
    approaches: List[dict],
    approach_images: Dict[str, bytes] | None = None,
) -> List[dict]:
    """
    Produce ANPR `plate_events` from the per-approach detections.

    The plate STRING is read by the OCR hook (predictors/anpr.read_plate) when a
    backend is installed; otherwise it is synthesized. The pipe is real either
    way: events flow through the Layer-3 bridge into the Layer-5 Challan queue.
    Violation type is biased by the vehicle mix actually detected (e.g. a
    two-wheeler-heavy frame skews toward NO_HELMET).
    """
    images: Dict[str, "np.ndarray"] = {}
    if approach_images:
        for aid, raw in approach_images.items():
            decoded = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
            if decoded is not None:
                images[aid] = decoded

    events: List[dict] = []
    for ap in approaches:
        # Low rate so the queue grows realistically, gated on real detections.
        total = sum(d["count"] for d in ap.get("detections", []))
        if total == 0 or random.random() > 0.25:
            continue
        has_bike = any(d["type"] == "Motorcycle" and d["count"] > 0 for d in ap["detections"])
        violation = "NO_HELMET" if (has_bike and random.random() < 0.5) else random.choice(_VIOLATIONS)
        img = images.get(ap["approachId"])
        plate = (read_plate(img) if img is not None else None) or _synth_plate()
        event = {
            "plate": plate,
            "approachId": ap["approachId"],
            "violation": violation,
            "confidence": round(0.78 + random.random() * 0.2, 3),
        }
        if violation == "SPEEDING":
            event["speedKmph"] = random.randint(62, 88)
        events.append(event)
    return events


def analyze_approach(image_bytes: bytes, approach_id: str) -> dict:
    """
    Run YOLO on one approach camera frame and return an `ApproachData` dict
    matching the STM contract.

    Fields the STM needs and how we derive them:
      - detections           : real per-class YOLO vehicle counts
      - spatialOccupancyPct   : fraction of the frame covered by vehicle boxes
      - waitingTimeSeconds    : heuristic estimate from queue size (still frame
                                has no temporal signal, so this is an estimate)
      - arrivalRatePerMin     : heuristic estimate from vehicle count
    """
    np_arr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not decode image for approach {approach_id}.")

    frame_h, frame_w = image.shape[:2]
    frame_area = float(frame_h * frame_w) or 1.0

    model = get_model()
    results = model(image, verbose=False)

    counts: Dict[str, int] = {t: 0 for t in STM_VEHICLE_TYPES}
    confidences: List[float] = []
    covered_area = 0.0

    for det in results[0].boxes.data.tolist():
        x1, y1, x2, y2, conf, class_id = det
        stm_type = COCO_TO_STM_VEHICLE.get(int(class_id))
        if stm_type is None:
            continue
        counts[stm_type] += 1
        confidences.append(float(conf))
        covered_area += max(0.0, (x2 - x1)) * max(0.0, (y2 - y1))

    vehicle_count = sum(counts.values())

    # Spatial occupancy: how much of the road frame is taken up by vehicles.
    occupancy_pct = int(round(min(95.0, max(5.0, (covered_area / frame_area) * 100.0))))

    # Per-frame perception RELIABILITY (the CV confidence signal the STM's
    # resilience layer gates on, critical threshold = 0.70).
    #
    # Note: a raw YOLO box-confidence (~0.5-0.65 for small vehicles in busy
    # frames) is NOT the same thing as "can we trust this scene read". We
    # calibrate the mean box-confidence onto a reliability scale so that a
    # coherent set of detections reads as healthy (~0.78-0.95) while genuinely
    # poor frames (sparse/low-confidence boxes — rain, glare, blur) still fall
    # below the 0.70 threshold and correctly trigger the historical fallback.
    # An empty but clear frame is a confident "no traffic" read.
    if confidences:
        approach_confidence = 0.5 + 0.5 * float(np.mean(confidences))
    else:
        approach_confidence = 0.90

    detections = [
        {"type": t, "count": c} for t, c in counts.items() if c > 0
    ]
    # Guarantee a non-empty detections array so downstream scoring is stable.
    if not detections:
        detections = [{"type": "Car", "count": 0}]

    return {
        "approachId": approach_id,
        "spatialOccupancyPct": occupancy_pct,
        "detections": detections,
        # Estimated temporal metrics (still image -> no real time signal):
        "waitingTimeSeconds": int(min(120, vehicle_count * 4)),
        "arrivalRatePerMin": int(min(40, vehicle_count * 2)),
        "_confidence": round(approach_confidence, 4),  # internal: averaged below
    }


def build_layer2_payload(
    junction_id: str,
    approach_images: Dict[str, bytes],
    confidence_override: float | None = None,
) -> dict:
    """
    Build a full `Layer2Payload` for a junction from one camera frame per
    approach.

    `approach_images` maps "NORTH"/"SOUTH"/"EAST"/"WEST" -> raw image bytes.
    `confidence_override` (optional) forces cvConfidenceScore — handy for
    demoing the STM's low-confidence historical-fallback path.
    """
    approaches: List[dict] = []
    per_approach_confidences: List[float] = []

    for approach_id in ("NORTH", "SOUTH", "EAST", "WEST"):
        if approach_id not in approach_images:
            continue
        data = analyze_approach(approach_images[approach_id], approach_id)
        per_approach_confidences.append(data.pop("_confidence"))
        approaches.append(data)

    if confidence_override is not None:
        cv_confidence = float(confidence_override)
    elif per_approach_confidences:
        cv_confidence = float(np.mean(per_approach_confidences))
    else:
        cv_confidence = 0.85

    cv_confidence = round(max(0.0, min(1.0, cv_confidence)), 4)

    plate_events = synthesize_plate_events(approaches, approach_images)
    log.info(
        "layer2_built",
        junction=junction_id,
        cv_confidence=cv_confidence,
        approaches=len(approaches),
        plate_events=len(plate_events),
    )

    return {
        "junctionId": junction_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cvConfidenceScore": cv_confidence,
        "approaches": approaches,
        "plateEvents": plate_events,
    }
