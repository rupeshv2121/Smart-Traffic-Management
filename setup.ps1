# =============================================================================
# setup.ps1 - One-time setup for the integrated traffic stack.
#
# Creates the Python virtual-env + installs CV deps, ensures the YOLO weights
# are present, and installs the Node dependencies for the STM.
#
# Usage:   powershell -ExecutionPolicy Bypass -File .\setup.ps1
# =============================================================================
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$ml   = Join-Path $root "GatiShakti-ML"
$stm  = Join-Path $root "Layer-3_STM"

Write-Host "=============================================================="
Write-Host " Setup - GatiShakti-ML (Layer 2) + Layer-3 STM (Layer 3)"
Write-Host "=============================================================="

# --- Python side -------------------------------------------------------------
$venvDir = Join-Path $ml ".venv"
$venvPy  = Join-Path $venvDir "Scripts\python.exe"

if (-not (Test-Path $venvPy)) {
    Write-Host "[python] Creating virtual environment..."
    python -m venv $venvDir
}
Write-Host "[python] Installing requirements..."
& $venvPy -m pip install --upgrade pip
& $venvPy -m pip install -r (Join-Path $ml "requirements.txt")

$weights = Join-Path $ml "models\yolo11s.pt"
if (-not (Test-Path $weights)) {
    Write-Host "[python] Downloading YOLO weights..."
    & $venvPy (Join-Path $ml "scripts\download_models.py")
} else {
    Write-Host "[python] YOLO weights already present."
}

# --- Node side ---------------------------------------------------------------
Write-Host "[node] Installing STM dependencies..."
Push-Location $stm
npm install
Pop-Location

Write-Host ""
Write-Host "Setup complete. Run the stack with:  .\start.ps1" -ForegroundColor Green
