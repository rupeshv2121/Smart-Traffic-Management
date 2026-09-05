"""
tools/webcam_test.py
Live sanity check for the YOLO model against real webcam hardware.

Opens a webcam feed, runs the same yolo11s.pt model used by predictors/Signal.py
on every frame, and shows the annotated video in a window. Not part of the API -
just a manual smoke test.

Usage:
    python tools/webcam_test.py [--camera 0] [--conf 0.4]

Press 'q' to quit.
"""

import argparse
import sys
import time
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from predictors.Signal import get_model, VEHICLE_CLASSES


def main():
    parser = argparse.ArgumentParser(description="Live webcam test for the YOLO model.")
    parser.add_argument("--camera", type=int, default=None,
                        help="Camera index to use (default: auto-detect first available)")
    parser.add_argument("--conf", type=float, default=0.4, help="Confidence threshold")
    parser.add_argument(
        "--scan", action="store_true",
        help="Just probe camera indices 0-5 and report which ones open, then exit.",
    )
    args = parser.parse_args()

    if args.scan:
        for i in range(6):
            for name, backend in (("MSMF", cv2.CAP_MSMF), ("DSHOW", cv2.CAP_DSHOW)):
                c = cv2.VideoCapture(i, backend)
                ok = c.isOpened()
                if ok:
                    w = c.get(cv2.CAP_PROP_FRAME_WIDTH)
                    h = c.get(cv2.CAP_PROP_FRAME_HEIGHT)
                    print(f"index {i} [{name}]: OPEN ({int(w)}x{int(h)})")
                else:
                    print(f"index {i} [{name}]: closed")
                c.release()
        return

    backends = [
        ("MSMF", cv2.CAP_MSMF),
        ("DSHOW", cv2.CAP_DSHOW),
        ("ANY", cv2.CAP_ANY),
    ]

    def try_open_camera(index: int) -> tuple:
        """Try all backends for a given index. Returns (VideoCapture, backend_name) or (None, None)."""
        for name, backend in backends:
            candidate = cv2.VideoCapture(index, backend)
            if candidate.isOpened():
                ok, _ = candidate.read()
                if ok:
                    return candidate, name
            candidate.release()
        return None, None

    cap = None
    used_backend = None
    used_index = None

    # If the user specified a camera index, try it with retries (USB can be flaky).
    if args.camera is not None:
        for attempt in range(5):
            cap, used_backend = try_open_camera(args.camera)
            if cap is not None:
                used_index = args.camera
                break
            print(f"Open attempt {attempt + 1}/5 failed for index {args.camera}, retrying...")
            time.sleep(1.0)
        if cap is None:
            print(f"Index {args.camera} unavailable. Scanning for another camera...")

    # Auto-detect: scan indices 0-9 and pick the first one that works.
    if cap is None:
        print("Scanning camera indices 0-9 for the first available camera...")
        for idx in range(10):
            if args.camera is not None and idx == args.camera:
                continue  # already tried and failed
            cap, used_backend = try_open_camera(idx)
            if cap is not None:
                used_index = idx
                print(f"  -> Found working camera at index {idx} [{used_backend}]")
                break
            else:
                print(f"  index {idx}: not available")

    if cap is None:
        raise SystemExit(
            "Could not open any camera (indices 0-9, backends MSMF/DSHOW/ANY).\n"
            "Check:\n"
            "  - Another app (Teams/Zoom/browser) isn't already using the camera\n"
            "  - Windows Settings > Privacy & security > Camera > "
            "'Let desktop apps access your camera' is ON\n"
            "  - The USB cable/port connection is solid\n"
            "  - Try running with --scan to list detected devices"
        )
    print(f"Opened camera index {used_index} via {used_backend} backend.")

    model = get_model()
    print("Model loaded. Press 'q' in the video window to quit.")

    prev_time = time.time()
    consecutive_failures = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            consecutive_failures += 1
            if consecutive_failures > 30:
                print("Camera stopped responding (30 consecutive failed reads).")
                break
            continue
        consecutive_failures = 0

        results = model(frame, conf=args.conf, verbose=False)

        vehicle_count = 0
        for det in results[0].boxes.data.tolist():
            x1, y1, x2, y2, conf, class_id = det
            class_id = int(class_id)
            color = (0, 255, 0) if class_id in VEHICLE_CLASSES else (255, 180, 0)
            if class_id in VEHICLE_CLASSES:
                vehicle_count += 1
            cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
            label = f"{model.names[class_id]} {conf:.2f}"
            cv2.putText(
                frame, label, (int(x1), max(int(y1) - 8, 0)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
            )

        now = time.time()
        fps = 1.0 / max(now - prev_time, 1e-6)
        prev_time = now
        cv2.putText(
            frame, f"vehicles: {vehicle_count}  fps: {fps:.1f}",
            (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2,
        )

        cv2.imshow("YOLO webcam test - press q to quit", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
