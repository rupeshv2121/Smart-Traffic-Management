# =============================================================================
# start.ps1 - One-command launcher for the integrated traffic stack.
#
#   Layer 2 (GatiShakti-ML, FastAPI + YOLO)  ->  Layer 3 (Layer-3_STM, Node/TS)
#
# Boots the perception service, waits for it to become healthy, then starts the
# STM live pipeline that polls it. Ctrl+C stops both.
#
# Usage:   powershell -ExecutionPolicy Bypass -File .\start.ps1
# =============================================================================
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$ml   = Join-Path $root "GatiShakti-ML"
$stm  = Join-Path $root "Layer-3_STM"

# Prefer the GatiShakti virtual-env interpreter; fall back to system python.
$venvPy = Join-Path $ml ".venv\Scripts\python.exe"
if (Test-Path $venvPy) { $python = $venvPy } else { $python = "python" }

Write-Host "=============================================================="
Write-Host " Integrated Traffic Stack - GatiShakti-ML + Layer-3 STM"
Write-Host "=============================================================="
Write-Host "[1/3] Starting Layer 2 perception service (FastAPI + YOLO)..."

$server = Start-Process -FilePath $python -ArgumentList @("-m", "uvicorn", "app:app", "--port", "8000") -WorkingDirectory $ml -PassThru -NoNewWindow

# Wait (up to ~60s) for the service to start listening on port 8000.
# A raw TCP connect test is used (not Invoke-RestMethod) so it is immune to
# system-proxy settings and IPv6/localhost resolution quirks.
Write-Host "[2/3] Waiting for perception service to become healthy..."
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

Write-Host "[3/3] Starting Layer 3 STM live pipeline (Ctrl+C to stop both)..."
try {
    Push-Location $stm
    npm run live
} finally {
    Pop-Location
    Write-Host ""
    Write-Host "Stopping perception service..."
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
    Write-Host "Done."
}
