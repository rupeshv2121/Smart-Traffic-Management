#!/usr/bin/env bash
# =============================================================================
# start.sh — One-command launcher (Linux/macOS/Git-Bash) for the integrated
# traffic stack: Layer 2 (GatiShakti-ML) -> Layer 3 (Layer-3_STM).
#
# Usage:   ./start.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ML="$ROOT/GatiShakti-ML"
STM="$ROOT/Layer-3_STM"

# Prefer the GatiShakti virtual-env interpreter; fall back to system python.
if [ -x "$ML/.venv/Scripts/python.exe" ]; then
  PYTHON="$ML/.venv/Scripts/python.exe"   # Windows Git-Bash venv layout
elif [ -x "$ML/.venv/bin/python" ]; then
  PYTHON="$ML/.venv/bin/python"           # POSIX venv layout
else
  PYTHON="python"
fi

echo "=============================================================="
echo " Integrated Traffic Stack — GatiShakti-ML + Layer-3 STM"
echo "=============================================================="
echo "[1/3] Starting Layer 2 perception service (FastAPI + YOLO)..."

( cd "$ML" && "$PYTHON" -m uvicorn app:app --port 8000 ) &
SERVER_PID=$!

cleanup() {
  echo ""
  echo "Stopping perception service (pid $SERVER_PID)..."
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[2/3] Waiting for perception service to become healthy..."
ready=0
for _ in $(seq 1 60); do
  if curl -s http://localhost:8000/health 2>/dev/null | grep -q '"ok"'; then
    ready=1; break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "  ! Perception service never became healthy. Stopping." >&2
  exit 1
fi
echo "  + Perception service healthy at http://localhost:8000 (docs: /docs)"

echo "[3/3] Starting Layer 3 STM live pipeline (Ctrl+C to stop both)..."
cd "$STM" && npm run live
