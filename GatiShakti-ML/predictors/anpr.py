"""
predictors/anpr.py — pluggable license-plate OCR hook.

`read_plate(image_bgr)` attempts a real plate read using whichever OCR backend
is installed (EasyOCR, then Tesseract), and returns the recognised string or
None. When no backend is present it returns None, and the caller falls back to
a synthesized plate — so the perception service runs without an OCR model but
upgrades to real reads the moment a backend is installed (pip install easyocr).

This is the single swap point to make Challan plate reads real; the rest of the
ANPR pipe (event → Layer-3 bridge → Challan store) is already real.
"""
from __future__ import annotations

import re
from typing import Optional

import numpy as np

_BACKEND = None  # lazily resolved: "easyocr" | "tesseract" | "none"
_READER = None
_PLATE_RE = re.compile(r"[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{3,4}")


def _resolve_backend() -> str:
    global _BACKEND, _READER
    if _BACKEND is not None:
        return _BACKEND
    try:
        import easyocr  # type: ignore

        _READER = easyocr.Reader(["en"], gpu=False)
        _BACKEND = "easyocr"
        return _BACKEND
    except Exception:
        pass
    try:
        import pytesseract  # type: ignore  # noqa: F401

        _BACKEND = "tesseract"
        return _BACKEND
    except Exception:
        _BACKEND = "none"
        return _BACKEND


def _normalise(text: str) -> Optional[str]:
    cleaned = re.sub(r"[^A-Z0-9]", "", text.upper())
    m = _PLATE_RE.search(cleaned)
    return m.group(0) if m else None


def read_plate(image_bgr: "np.ndarray") -> Optional[str]:
    """Best-effort plate read. Returns a normalised plate or None."""
    backend = _resolve_backend()
    try:
        if backend == "easyocr" and _READER is not None:
            for _box, text, conf in _READER.readtext(image_bgr):
                if conf < 0.4:
                    continue
                plate = _normalise(text)
                if plate:
                    return plate
            return None
        if backend == "tesseract":
            import cv2  # local import; opencv is already a dependency
            import pytesseract  # type: ignore

            gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
            return _normalise(pytesseract.image_to_string(gray))
    except Exception:
        return None
    return None
