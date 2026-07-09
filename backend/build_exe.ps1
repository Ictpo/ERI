# Builds the single-file ERI.exe.
# Prereqs: backend venv populated, frontend already exported (npm run build -> ../frontend/out).
# Usage:  powershell -ExecutionPolicy Bypass -File build_exe.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path "..\frontend\out\index.html")) {
    throw "frontend/out not found - run 'npm run build' in frontend/ first."
}

.\.venv\Scripts\python.exe -m pip install --quiet pyinstaller

.\.venv\Scripts\python.exe -m PyInstaller `
    --noconfirm --clean --onefile `
    --name ERI `
    --add-data "..\frontend\out;ui" `
    --collect-data simplemma `
    --hidden-import app.main `
    desktop.py

Write-Host ""
Write-Host "Built: $PSScriptRoot\dist\ERI.exe"
