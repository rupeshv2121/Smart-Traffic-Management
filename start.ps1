# =============================================================================
# start.ps1 - One-command launcher for the integrated traffic stack.
#
#   Layer 2 (GatiShakti-ML, FastAPI + YOLO)
#     -> Layer 3 (Layer-3_STM, Node/TS)  [EMV intake :8100, dashboard feed :8200]
#       -> Layer 5 (Layer-5, React/Vite dashboard UI :5273)
#
# Frees the project's ports first (so a stray previous run can't block startup),
# boots perception, waits for it to be healthy, opens the Layer 5 dashboard in
# its own window, then runs the STM live pipeline. Ctrl+C stops everything.
#
# Usage:   powershell -ExecutionPolicy Bypass -File .\start.ps1
# =============================================================================
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$ml   = Join-Path $root "GatiShakti-ML"
$stm  = Join-Path $root "Layer-3_STM"
$l5   = Join-Path $root "Layer-5"

# Ports this stack owns. Freed before launch so a previous run that didn't exit
# cleanly (e.g. window closed instead of Ctrl+C) can't cause EADDRINUSE.
$ports = @{
    "Layer 2 perception"  = 8000
    "Layer 3 EMV intake"  = 8100
    "Layer 3 dashboard"   = 8200
    "Layer 5 UI (Vite)"   = 5273
}

# Stop whatever process is listening on a port (no-op if the port is free).
function Stop-PortOwner {
    param([int]$Port)
    $conns = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host ("  - Freeing port {0}: stopping stray {1} (PID {2})" -f $Port, $proc.ProcessName, $proc.Id) -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "=============================================================="
Write-Host " Integrated Traffic Stack - Layers 2 + 3 + 5"
Write-Host "=============================================================="

Write-Host "[0/4] Freeing stack ports (self-healing)..."
foreach ($port in $ports.Values) { Stop-PortOwner -Port $port }

# Prefer the GatiShakti virtual-env interpreter; fall back to system python.
$venvPy = Join-Path $ml ".venv\Scripts\python.exe"
if (Test-Path $venvPy) { $python = $venvPy } else { $python = "python" }

Write-Host "[1/4] Starting Layer 2 perception service (FastAPI + YOLO)..."
$server = Start-Process -FilePath $python -ArgumentList @("-m", "uvicorn", "app:app", "--port", "8000") -WorkingDirectory $ml -PassThru -NoNewWindow

# Wait (up to ~60s) for the service to start listening on port 8000.
# A raw TCP connect test is used (not Invoke-RestMethod) so it is immune to
# system-proxy settings and IPv6/localhost resolution quirks.
Write-Host "[2/4] Waiting for perception service to become healthy..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    if ($server.HasExited) {
        Write-Host "  ! Perception service exited early (code $($server.ExitCode))." -ForegroundColor Red
        exit 1
    }
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect("127.0.0.1", 8000)
        if ($client.Connected) { $ready = $true; $client.Close(); break }
    } catch {
        Start-Sleep -Seconds 1
    } finally {
        $client.Dispose()
    }
}
if (-not $ready) {
    Write-Host "  ! Perception service never became healthy. Stopping." -ForegroundColor Red
    if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    exit 1
}
Write-Host "  + Perception service healthy at http://localhost:8000 (docs: /docs)" -ForegroundColor Green

# --- Layer 5 dashboard UI ----------------------------------------------------
# Runs in its own window (Vite is long-lived and opens a browser tab). It
# auto-connects to the Layer 3 SSE feed once the pipeline below comes up.
if (-not (Test-Path (Join-Path $l5 "node_modules"))) {
    Write-Host "[3/4] Installing Layer 5 dependencies (first run only)..."
    Push-Location $l5
    npm install
    Pop-Location
}
Write-Host "[3/4] Opening Layer 5 dashboard UI (new window) -> http://localhost:5273 ..."
$dashboard = Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit", "-ExecutionPolicy", "Bypass",
    "-Command", "Set-Location '$l5'; npm run dev"
) -PassThru

Write-Host "[4/4] Starting Layer 3 STM live pipeline (Ctrl+C to stop everything)..."
try {
    Push-Location $stm
    npm run live
} finally {
    Pop-Location
    Write-Host ""
    Write-Host "Stopping services..."
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
    if ($dashboard -and -not $dashboard.HasExited) { Stop-Process -Id $dashboard.Id -Force -ErrorAction SilentlyContinue }
    # The dashboard window spawns a child Vite/node; make sure it's gone too.
    Stop-PortOwner -Port 5273
    Write-Host "Done."
}
