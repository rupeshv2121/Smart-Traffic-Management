"""
predictors/obs.py — structured JSON logging for the Layer-2 CV service.

Uses structlog when installed (the documented choice), otherwise falls back to
a thin stdlib-logging shim with the SAME call style — `log.info(event, **kw)`
emitting one JSON object per line — so callers never depend on structlog being
present. This keeps logs machine-parseable for shipping to a log aggregator.
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

try:  # preferred: structlog (add `structlog` to requirements to enable)
    import structlog

    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    )

    def get_logger(name: str = "gatishakti"):
        return structlog.get_logger(name)

except Exception:  # pragma: no cover - fallback when structlog is absent
    class _JsonLogger:
        def __init__(self, name: str) -> None:
            self._name = name
            self._log = logging.getLogger(name)
            if not self._log.handlers:
                h = logging.StreamHandler(sys.stdout)
                h.setFormatter(logging.Formatter("%(message)s"))
                self._log.addHandler(h)
                self._log.setLevel(logging.INFO)

        def _emit(self, level: str, event: str, **kw: Any) -> None:
            rec = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "level": level,
                "logger": self._name,
                "event": event,
                **kw,
            }
            self._log.info(json.dumps(rec, default=str))

        def info(self, event: str, **kw: Any) -> None:
            self._emit("info", event, **kw)

        def warning(self, event: str, **kw: Any) -> None:
            self._emit("warning", event, **kw)

        def error(self, event: str, **kw: Any) -> None:
            self._emit("error", event, **kw)

    def get_logger(name: str = "gatishakti"):
        return _JsonLogger(name)
