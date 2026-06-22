#!/usr/bin/env bash
# =============================================================================
# start.sh — One-command launcher (Linux/macOS/Git-Bash) for the full stack:
#   (optional) Infra: TimescaleDB + Redis (docker compose)
#   Layer 2 (GatiShakti-ML, FastAPI + YOLO)  :8000  (optional, non-fatal)
#   Layer 3 (Layer-3_STM, Node/TS)           :8100 / :8200
#   Layer 5 (Layer-5, React/Vite)            :5273
#
# Usage:
#   ./start.sh
#   ./start.sh --skip-perception     # don't start the heavy YOLO service
#   ./start.sh --no-infra            # never touch docker
#   ./start.sh --stop-infra-on-exit  # docker compose stop on exit
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ML="$ROOT/GatiShakti-ML"; STM="$ROOT/Layer-3_STM"; L5="$ROOT/Layer-5"

SKIP_PERCEPTION=0; NO_INFRA=0; STOP_INFRA=0
for arg in "$@"; do
  case "$arg" in
    --skip-perception) SKIP_PERCEPTION=1 ;;
    --no-infra) NO_INFRA=1 ;;
    --stop-infra-on-exit) STOP_INFRA=1 ;;
  esac
done

SERVER_PID=""; UI_PID=""; INFRA_STARTED=0
cleanup() {
  echo ""; echo "Stopping services..."
  [ -n "$UI_PID" ] && kill "$UI_PID" 2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  if [ "$INFRA_STARTED" -eq 1 ] && [ "$STOP_INFRA" -eq 1 ]; then
    ( cd "$STM" && docker compose stop ) || true
  fi
  echo "Done."
}
trap cleanup EXIT INT TERM

echo "=============================================================="
echo " Integrated Traffic Stack — Layers 2 + 3 + 5"
echo "=============================================================="

# --- [1] Optional infra ------------------------------------------------------
if [ "$NO_INFRA" -eq 0 ] && [ -f "$STM/.env" ] && grep -Eq '^\s*(DATABASE_URL|REDIS_URL)\s*=\s*\S' "$STM/.env"; then
  echo "[1] .env requests Postgres/Redis — bringing up docker compose..."
  if ( cd "$STM" && docker compose up -d ); then
    INFRA_STARTED=1
    echo "    waiting for TimescaleDB to become healthy..."
    for _ in $(seq 1 40); do
      h="$(docker inspect --format '{{.State.Health.Status}}' stm-timescaledb 2>/dev/null || true)"
      [ "$h" = "healthy" ] && break; sleep 2
    done
    echo "    + infra up (or Layer 3 will fall back to the file store if not)."
  else
    echo "    ! docker compose failed (is the engine running?) — Layer 3 falls back automatically."
  fi
else
  echo "[1] No infra requested — file store (no Docker needed)."
fi

# --- [2] Layer 2 perception (optional, non-fatal) ----------------------------
if [ "$SKIP_PERCEPTION" -eq 1 ]; then
  echo "[2] Perception skipped — Layer 3 runs on mock perception."
else
  if [ -x "$ML/.venv/Scripts/python.exe" ]; then PYTHON="$ML/.venv/Scripts/python.exe"
  elif [ -x "$ML/.venv/bin/python" ]; then PYTHON="$ML/.venv/bin/python"
  else PYTHON="python"; fi
  echo "[2] Starting Layer 2 perception service..."
  ( cd "$ML" && "$PYTHON" -m uvicorn app:app --port 8000 ) & SERVER_PID=$!
  ready=0
  for _ in $(seq 1 40); do
    if curl -s http://localhost:8000/health 2>/dev/null | grep -q '"ok"'; then ready=1; break; fi
    sleep 1
  done
  if [ "$ready" -eq 1 ]; then echo "    + perception healthy at http://localhost:8000"
  else echo "    ! perception not ready — continuing on mock perception."; fi
fi

# --- [3] Dependencies (first run only) ---------------------------------------
for proj in "$STM" "$L5"; do
  [ -d "$proj/node_modules" ] || ( echo "[3] npm install in $proj..." && cd "$proj" && npm install )
done

# --- [4] Layer 5 dashboard (background) --------------------------------------
echo "[4] Starting Layer 5 dashboard UI -> http://localhost:5273 ..."
( cd "$L5" && npm run dev ) & UI_PID=$!

# --- [5] Layer 3 pipeline (foreground; Ctrl+C stops everything) --------------
echo "[5] Starting Layer 3 STM live pipeline (Ctrl+C to stop everything)..."
echo "    Login: admin / operator / inspector / dispatcher · password stm@1234"
cd "$STM" && npm run live
