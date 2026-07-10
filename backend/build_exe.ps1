# Builds the single-file ERI.exe (Windows).
# Prereqs: backend venv populated, frontend already exported (npm run build -> ../frontend/out).
# Usage:  powershell -ExecutionPolicy Bypass -File build_exe.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

.\.venv\Scripts\python.exe -m pip install --quiet pyinstaller
.\.venv\Scripts\python.exe build_exe.py
