# ERI: Engine for Reinert Insights

A desktop app for multidimensional text and questionnaire analysis: a modern
reimplementation of [Iramuteq](http://www.iramuteq.org/). ERI opens in its own
native window on Windows and macOS. Inside, the legacy wxPython/R stack is replaced
by a Python statistical engine (FastAPI, running locally inside the app) and an
interactive Next.js interface. Your projects stay on your computer, in a per-user
data folder.

| Legacy Iramuteq pain point | ERI |
| --- | --- |
| Fragile local Python 2 + R install | Download, unzip, double-click. No Python, R or anything else to install |
| `**** *var_mod` manual text tagging | Visual corpus builder: upload TXT/CSV, edit variables in a table (legacy format still parsed) |
| Static R plot images | Interactive, zoomable D3 visualizations with SVG/PNG export |
| Cryptic R stack traces | Every error is a human-readable message with an actionable hint |
| UI freezes during computation | Async job pipeline with live SSE progress |

## Features

- **Visual corpus builder** — TXT (legacy `****` markers auto-parsed) or CSV upload,
  tabular metadata/variable editing, language dictionaries + lemmatization for
  English, Portuguese, French and Spanish (simplemma).
- **Reinert classification (CHD)** — text split into elementary context units,
  successive chi-square bipartitions, interactive dendrogram with per-class χ² word
  profiles, over-represented variables and characteristic segments.
- **Similarity analysis** — co-occurrence network (co-occurrence / Jaccard / cosine),
  force-directed D3 graph, community detection, live threshold sliders.
- **Correspondence factor analysis (AFC)** — vocabulary × variable-modalities factor
  map with inertia percentages, contributions, hover details, zoom/pan.
- **Text statistics** — frequencies, hapax legomena, per-variable totals, dynamic
  word cloud with live filters.

## Quick start

ERI is meant to be used as the desktop app. The other two ways below are for
development.

**The desktop app (no installs at all)** — download from
[GitHub Releases](https://github.com/Ictpo/ERI/releases): `ERI-win64.zip`
(Windows) and `ERI-macos-arm64.zip` (Apple Silicon Macs). Built automatically
by CI (`.github/workflows/build.yml`) on every `v*` tag — PyInstaller cannot
cross-compile, so each OS builds its own binary.

Build locally instead:

```powershell
cd frontend; npm install; npm run build          # static export -> frontend/out
cd ..\backend; powershell -ExecutionPolicy Bypass -File build_exe.ps1   # Windows
# or on macOS/Linux:  cd ../backend && ./build_exe.sh
.\dist\ERI.exe                                    # opens in its own window
```

**Dev mode (two processes, hot reload, in a browser)**:

```bash
cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
.venv/Scripts/uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev        # http://localhost:3000
```

The backend serves the exported UI from `/` whenever `frontend/out` exists
(or `ERI_UI_DIR` points somewhere), so one process is enough outside dev.

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest tests -q
cd frontend && npm run build
```

## Repository layout

- `DOCS.md` — what the app does, its visual identity, and how it works end to end
- `CONTRACT.md` — the API contract both halves are built against
- `backend/` — FastAPI + NumPy/SciPy/scikit-learn/NetworkX engine (no R);
  `desktop.py` + `build_exe.ps1` produce the standalone `ERI.exe`.
  See [`backend/ANALYSIS.md`](backend/ANALYSIS.md) for how each analysis is computed.
- `frontend/` — Next.js 14 workspace UI (static export) with D3 visualizations
- `CLAUDE.md` — architecture map, run scripts and conventions for future work
