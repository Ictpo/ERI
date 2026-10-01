"""Cross-platform PyInstaller build for the ERI desktop binary.

Run this ON the OS you want a binary for (PyInstaller cannot cross-compile):
  Windows -> dist/ERI.exe      macOS -> dist/ERI.app      Linux -> dist/ERI

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
        # Pinned in requirements.txt with everything else the build bundles.
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(HERE / "requirements.txt")])

    from PyInstaller.__main__ import run

    import simplemma

    from app.nlp.tokenize import SUPPORTED_LANGS

    sep = ";" if os.name == "nt" else ":"
    os.chdir(HERE)
    # Bundle only the lemmatizer dictionaries ERI can use (all ~50 would be
    # unpacked on every launch of the one-file exe, and bloat the macOS app).
    dicts = Path(simplemma.__file__).parent / "strategies" / "dictionaries" / "data"
    dict_args = [a for lang in SUPPORTED_LANGS
                 for a in ("--add-data", f"{dicts / (lang + '.plzma')}{sep}simplemma/strategies/dictionaries/data")]
    args = [
        "--noconfirm",
        "--clean",
        "--name", "ERI",
        "--add-data", f"{UI}{sep}ui",
        *dict_args,
        "--hidden-import", "app.main",
        "--hidden-import", "app.splash",
        "--hidden-import", "webview",
        # Keep out libraries ERI no longer uses, even if the build venv still
        # has them (networkx's optional imports would otherwise pull pandas in).
        "--exclude-module", "pandas",
    ]
    if sys.platform == "darwin":
        # macOS gets a real app bundle, dist/ERI.app: double-click opens the
        # window with no Terminal behind it, and Finder/Dock show the icon.
        # PyInstaller builds .app bundles in onedir mode only (onefile + .app
        # is deprecated), which also skips the per-launch unpack.
        args.extend(["--windowed", "--osx-bundle-identifier", "io.github.ictpo.eri"])
        icon = HERE.parent / "packaging" / "eri.ico"  # converted to .icns via Pillow
        if icon.is_file():
            args.extend(["--icon", str(icon)])
    else:
        args.append("--onefile")
    if os.name == "nt":
        # Native pywebview window — suppress the console behind it.
        args.append("--windowed")
        icon = HERE.parent / "packaging" / "eri.ico"
        if icon.is_file():
            args.extend(["--icon", str(icon)])
        # NOTE: no PyInstaller --splash. A static unpack image looked out of
        # place before the animated window; we deliberately show nothing during
        # the onefile unpack, then the pywebview window opens straight onto the
        # animated splash (backend/app/splash.py).
    args.append(str(HERE / "desktop.py"))
    run(args)
    exe = HERE / "dist" / (
        "ERI.exe" if os.name == "nt" else "ERI.app" if sys.platform == "darwin" else "ERI"
    )
    print(f"\nBuilt: {exe}")


if __name__ == "__main__":
    main()
