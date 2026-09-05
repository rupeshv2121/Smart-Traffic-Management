 integrated traffic stack.
#
#   (optional) Infra: TimescaleDB + Redis via docker compose
#   Layer 2 (GatiShakti-ML, FastAPI + YOLO)            :8000   (optional)
#     -> Layer 3 (Layer-3_STM, Node/TS)  EMV :8100, dashboard :8200
#       -> Layer 5 (Layer-5, React/Vite dashboard UI)  :5273
#       -> Green Corridor Sim (React/Three.js)         :8081
#
# Frees stack ports, brings up infra if the Layer-3 .env asks for Postgres/Redis,
# starts perception (non-fatal if it never comes up - Layer 3 falls back to mock),
# opens Layer 5 and the Green Corridor Sim in their own windows, then runs the
# Layer 3 pipeline in the foreground. Ctrl+C stops everything this script started.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\start.ps1
#   .\start.ps1 -SkipPerception        # don't start the heavy YOLO service
#   .\start.ps1 -NoInfra               # never touch docker (even if .env wants it)
#   .\start.ps1 -StopInfraOnExit       # docker compose stop when the script exits
# =============================================================================
param(
    [switch]$SkipPerception,
    [switch]$NoInfra,
    [switch]$StopInfraOnExit
)
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$ml   = Join-Path $root "GatiShakti-ML"
$stm  = Join-Path $root "Layer-3_STM"
$l5   = Join-Path $root "Layer-5"
$sim  = Join-Path $root "green-corridor-sim"

$ports = @{
    "Layer 2 perception"     = 8000
    "Layer 3 EMV intake"     = 8100
    "Layer 3 dashboard"      = 8200
    "Layer 5 UI (Vite)"      = 5273
    "Green Corridor Sim"     = 8081
}

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

function Test-Port {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.Connect("127.0.0.1", $Port); return $client.Connected }
    catch { return $false }
    finally { $client.Dispose() }
}

# Does the Layer-3 .env (uncommented) request Postgres or Redis?
function Test-InfraRequested {
    $envFile = Join-Path $stm ".env"
    if (-not (Test-Path $envFile)) { return $false }
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*(DATABASE_URL|REDIS_URL)\s*=\s*\S') { return $true }
    }
    return $false
}

Write-Host "=============================================================="
Write-Host " Integrated Traffic Stack - Layers 2 + 3 + 5 + Green Sim"
Write-Host "=============================================================="

# --- [0] Free stack ports ----------------------------------------------------
Write-Host "[0] Freeing stack ports (self-healing)..."
foreach ($port in $ports.Values) { Stop-PortOwner -Port $port }

# --- [1] Optional infra (TimescaleDB + Redis) --------------------------------
$infraStarted = $false
if (-not $NoInfra -and (Test-InfraRequested)) {
    Write-Host "[1] Layer-3 .env requests Postgres/Redis - bringing up docker compose..."
    try {
        Push-Location $stm
        docker compose up -d | Out-Host
        Pop-Location
        $infraStarted = $true
        Write-Host "    Waiting for TimescaleDB to become healthy..."
        $dbOk = $false
        for ($i = 0; $i -lt 40; $i++) {
            $h = (docker inspect --format '{{.State.Health.Status}}' stm-timescaledb 2>$null)
            if ($h -eq "healthy") { $dbOk = $true; break }
            Start-Sleep -Seconds 2
        }
        if ($dbOk) { Write-Host "    + TimescaleDB healthy; Redis on :6379" -ForegroundColor Green }
        else { Write-Host "    ! TimescaleDB not healthy yet - Layer 3 will fall back to the file store if it can't connect." -ForegroundColor Yellow }
    } catch {
        Pop-Location -ErrorAction SilentlyContinue
        Write-Host "    ! Could not start docker compose (is Docker Desktop running?)." -ForegroundColor Yellow
        Write-Host "      Layer 3 will fall back to the file store + in-memory hot state automatically." -ForegroundColor Yellow
    }
} elseif ($NoInfra) {
    Write-Host "[1] Infra skipped (-NoInfra)."
} else {
    Write-Host "[1] No Postgres/Redis configured in Layer-3 .env - using file store (no infra needed)."
}

# --- [2] Layer 2 perception (optional, non-fatal) ----------------------------
$server = $null
if ($SkipPerception) {
    Write-Host "[2] Perception skipped (-SkipPerception) - Layer 3 will run on mock perception."
} else {
    $venvPy = Join-Path $ml ".venv\Scripts\python.exe"
    $python = if (Test-Path $venvPy) { $venvPy } else { "python" }
    Write-Host "[2] Starting Layer 2 perception service (FastAPI + YOLO)..."
    try {
        $server = Start-Process -FilePath $python -ArgumentList @("-m", "uvicorn", "app:app", "--port", "8000") -WorkingDirectory $ml -PassThru -NoNewWindow
        Write-Host "    Waiting for perception service (up to ~40s)..."
        $ready = $false
        for ($i = 0; $i -lt 40; $i++) {
            if ($server.HasExited) { break }
            if (Test-Port -Port 8000) { $ready = $true; break }
            Start-Sleep -Seconds 1
        }
        if ($ready) { Write-Host "    + Perception healthy at http://localhost:8000 (docs: /docs)" -ForegroundColor Green }
        else { Write-Host "    ! Perception not ready - continuing; Layer 3 falls back to mock perception." -ForegroundColor Yellow }
    } catch {
        Write-Host "    ! Could not start perception ($($_.Exception.Message)) - continuing on mock." -ForegroundColor Yellow
        $server = $null
    }
}

# --- [3] Dependencies (first run only) ---------------------------------------
foreach ($proj in @($stm, $l5, $sim)) {
    if (-not (Test-Path (Join-Path $proj "node_modules"))) {
        Write-Host "[3] Installing dependencies in $proj (first run only)..."
        Push-Location $proj; npm install; Pop-Location
    }
}

# --- [4] Layer 5 dashboard (own window) --------------------------------------
Write-Host "[4] Opening Layer 5 dashboard UI (new window) -> http://localhost:5273 ..."
$dashboard = Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit", "-ExecutionPolicy", "Bypass",
    "-Command", "Set-Location '$l5'; npm run dev"
) -PassThru

# --- [4b] Green Corridor Sim (own window) ------------------------------------
Write-Host "[4b] Opening Green Corridor Sim (new window) -> http://localhost:8081 ..."
$simProc = Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit", "-ExecutionPolicy", "Bypass",
    "-Command", "Set-Location '$sim'; npm run dev"
) -PassThru

# --- [5] Layer 3 pipeline (foreground; Ctrl+C stops everything) --------------
Write-Host "[5] Starting Layer 3 STM live pipeline (Ctrl+C to stop everything)..."
Write-Host "    Login: admin / operator / inspector / dispatcher  ·  password stm@1234" -ForegroundColor Cyan
try {
    Push-Location $stm
    npm run live
} finally {
    Pop-Location
    Write-Host ""
    Write-Host "Stopping services..."
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
    if ($dashboard -and -not $dashboard.HasExited) { Stop-Process -Id $dashboard.Id -Force -ErrorAction SilentlyContinue }
    if ($simProc -and -not $simProc.HasExited) { Stop-Process -Id $simProc.Id -Force -ErrorAction SilentlyContinue }
    Stop-PortOwner -Port 5273
    Stop-PortOwner -Port 8081
    if ($infraStarted -and $StopInfraOnExit) {
        Write-Host "Stopping infra (docker compose stop)..."
        Push-Location $stm; docker compose stop | Out-Host; Pop-Location
    } elseif ($infraStarted) {
        Write-Host "Infra left running (use 'docker compose down' in Layer-3_STM to stop it)."
    }
    Write-Host "Done."
}
