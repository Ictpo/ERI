"""Cross-platform PyInstaller build for the ERI desktop binary.

Run this ON the OS you want a binary for (PyInstaller cannot cross-compile):
  Windows -> dist/ERI.exe      macOS/Linux -> dist/ERI

Prereq: the frontend static export must exist (frontend: `npm run build`).
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
UI = HERE.parent / "frontend" / "out"


def main() -> None:
    if not (UI / "index.html").is_file():
        sys.exit("frontend/out not found — run 'npm run build' in frontend/ first.")
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    from PyInstaller.__main__ import run

    sep = ";" if os.name == "nt" else ":"
    os.chdir(HERE)
    args = [
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name", "ERI",
        "--add-data", f"{UI}{sep}ui",
        "--collect-data", "simplemma",
        "--hidden-import", "app.main",
        "--hidden-import", "webview",
    ]
    if os.name == "nt":
        # Native pywebview window — suppress the console behind it.
        args.append("--windowed")
    args.append(str(HERE / "desktop.py"))
    run(args)
    exe = HERE / "dist" / ("ERI.exe" if os.name == "nt" else "ERI")
    print(f"\nBuilt: {exe}")


if __name__ == "__main__":
    main()
