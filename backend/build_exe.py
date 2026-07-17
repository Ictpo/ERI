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
        "--hidden-import", "app.splash",
        "--hidden-import", "webview",
    ]
    if os.name == "nt":
        # Native pywebview window — suppress the console behind it.
        args.append("--windowed")
        icon = HERE.parent / "packaging" / "eri.ico"
        if icon.is_file():
            args.extend(["--icon", str(icon)])
        # Startup feedback: the onefile bundle takes 10-30 s to unpack with no
        # visible sign it's working. PyInstaller's splash covers exactly that
        # gap; desktop.py closes it once the window is up.
        # NOTE: --splash is Windows/Linux only — PyInstaller does not support
        # it on macOS, so Mac builds have no splash (see NOTES in CLAUDE.md).
        splash = HERE.parent / "packaging" / "eri-splash.png"
        if splash.is_file():
            args.extend(["--splash", str(splash)])
    args.append(str(HERE / "desktop.py"))
    run(args)
    exe = HERE / "dist" / ("ERI.exe" if os.name == "nt" else "ERI")
    print(f"\nBuilt: {exe}")


if __name__ == "__main__":
    main()
