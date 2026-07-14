# ERI: Engine for Reinert Insights

Modern multi-user web reimplementation of Iramuteq (multidimensional text analysis),
branded "ERI: Engine for Reinert Insights".
Monorepo: `backend/` (FastAPI + NumPy/SciPy/pandas/NetworkX math engine, no R dependency)
and `frontend/` (Next.js 14 App Router + TypeScript + Tailwind + D3/Cytoscape).

## Source of truth

`CONTRACT.md` defines every API route and JSON shape. Frontend (`frontend/lib/types.ts`,
`frontend/lib/api.ts`) and backend (`backend/app/main.py`) must both match it. Change the
contract file first, then both sides.

## Run (dev)

```powershell
# backend — http://localhost:8000 (docs at /docs)
cd backend; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000

# frontend — http://localhost:3000
cd frontend; npm run dev
```

Other modes (both serve UI + API from ONE process on :8000):
- Docker: `docker compose up --build` (root Dockerfile: node stage exports UI,
  python stage serves it; volume `eri-data`).
- Desktop binaries: `cd frontend; npm run build` then `backend/build_exe.py`
  (wrappers: `build_exe.ps1` Windows, `build_exe.sh` mac/linux) → `backend/dist/ERI(.exe)`.
  PyInstaller onefile, NATIVE WINDOW via pywebview (uvicorn on a daemon thread,
  window on main thread; closing the window sets server.should_exit — no orphan
  processes). Windows builds use --windowed (no console): sys.stdout/stderr are
  None there, so desktop.py routes them to <data_dir>/eri.log — do not remove
  that shim or uvicorn logging crashes the windowed exe. Env switches:
  ERI_HEADLESS=1 (serve without window, used by CI smoke test) and
  ERI_PORT_FILE=<path> (write chosen port; CI reads it — windowed exes have no
  stdout to grep). Data dir per-OS (%LOCALAPPDATA%\ERI |
  ~/Library/Application Support/ERI | ~/.local/share/ERI).
  v1.2.0-browser tag = last browser-tab-based build (guaranteed fallback).
  PyInstaller CANNOT cross-compile — `.github/workflows/build.yml` builds
  win64 + macos-arm64 on tag push (`v*`) and publishes a GitHub Release
  (instruction files live in `packaging/`; smoke test boots the binary in CI).

The frontend is a STATIC EXPORT (`output: "export"`, trailingSlash) — the
workspace route is `/project/?id=...` (query param, NOT a dynamic segment).
`lib/api.ts:getApiBase()` targets localhost:8000 only when the page runs on
port 3000 (dev); otherwise it uses the page origin. main.py mounts
`frontend/out` (or `ERI_UI_DIR`, or the PyInstaller `_MEIPASS/ui` bundle) at `/`.

## Verify

```powershell
cd backend; .\.venv\Scripts\python.exe -m pytest tests -q   # engine + API e2e suite
cd frontend; npm run build                                    # must pass with 0 type errors
```

`tests/test_engine.py` validates algorithmic properties (CA orthogonality/inertia sums,
chi2 validity, Jaccard/cosine bounds, CHD theme separation on a synthetic bilingual-theme
corpus). `tests/test_api.py` drives the full async pipeline including SSE.

## Architecture map

- `backend/app/nlp/` — tokenize.py (regex tokens + simplemma lemmatization en/pt/fr/es),
  stopwords.py, segment.py (UCE segmentation, sentence-packed ~seg_size words),
  corpus_parse.py (legacy `**** *var_mod` TXT + CSV).
- `backend/app/analysis/` — matrix.py (segments x active forms binary matrix, min_freq
  filter, 3000-form cap), ca.py (correspondence analysis via SVD of standardized
  residuals — shared core), chd.py (Reinert: successive bipartitions, cut maximizing
  chi2 of the 2xV vocabulary table along the first CA axis; class chi2 word/variable
  profiles; characteristic segments), similarity.py (cooc/jaccard/cosine + NetworkX
  greedy-modularity communities), stats.py, afc.py (words x variable-modalities CA).
- `backend/app/jobs.py` — thread-pool job manager; SSE progress at
  `GET /api/analyses/{id}/events`. `storage.py` — SQLite (WAL), env `IRAMUTEQ_DB`.
- `backend/app/errors.py` — every error becomes `{error:{code,message,hint}}`; keep it
  that way (the frontend toasts message+hint verbatim).
- `frontend/` — see `frontend/README.md`. Workspace at `/project/?id=...`: left sidebar
  (analyses history), center (corpus builder / analysis config), right (result tabs:
  dendrogram, network, factor map, stats+cloud). Viz components are client-only
  (`dynamic(..., {ssr:false})`).
- Visuals follow academic Iramuteq conventions: similarity = D3 SVG force layout with
  text nodes, max-spanning-tree default, convex-hull community areas
  (similarity-view.tsx); CHD = vertical top-down dendrogram, classes on a shared
  baseline with word/freq/chi2 tables inside the SVG (chd-view.tsx). SVG exports strip
  `[data-export-ignore]` elements and selection artifacts (lib/export.ts).

## Conventions / gotchas

- Python 3.13 local venv at `backend/.venv`; Docker uses 3.12-slim (both fine).
- Analyses run in a thread pool — keep runners synchronous functions taking
  `(doc_texts, docs, params, progress)` and registered in `RUNNERS` in main.py.
- `TextParams.from_dict` sanitizes all shared params; new analysis types should reuse it.
- Windows dev: PowerShell 5.1 — no `&&` chaining.
