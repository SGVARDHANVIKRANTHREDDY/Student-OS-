# Student OS System Launcher (PowerShell Version)
# Run this script to start everything

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "                   Student OS System Launcher                        " -ForegroundColor Cyan -BackgroundColor Black
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Python not found. Please install Python 3.8+ from https://www.python.org" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if requests module is installed
Write-Host "Checking Python dependencies..." -ForegroundColor Yellow
$requestsCheck = python -c "import requests" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing requests package..." -ForegroundColor Yellow
    python -m pip install requests --quiet
}

# Run the launcher
Write-Host ""
Write-Host "Starting Student OS..." -ForegroundColor Green
Write-Host ""

python RUNSTUDENTOS.py

# Keep window open if there's an error
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Please try again or check the error above." -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
