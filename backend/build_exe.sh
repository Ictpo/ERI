#!/usr/bin/env bash
# Builds the ERI desktop binary for macOS / Linux (run on that OS).
# Prereq: cd ../frontend && npm install && npm run build
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
"$PY" -m pip install --quiet -r requirements.txt pyinstaller
"$PY" build_exe.py
