# ERI: Engine for Reinert Insights — Project Status

Last updated: 2026-07-09 (post-rebrand, post-packaging)
Repo: `C:\Users\vrpra\Desktop\iramuteq-web` (own git repo, `main` branch)

## What this is

A from-scratch, full-stack modern reimplementation of Iramuteq (the desktop
text-analysis tool that normally wraps Python 2 + R), branded **ERI: Engine for
Reinert Insights**. No R dependency — the math engine is pure
NumPy/SciPy/pandas/scikit-learn/NetworkX. Backend written directly; frontend built by a
parallel subagent against a shared contract (`CONTRACT.md`); integrated, verified in a
real browser, then overhauled for academic-publication visuals and packaged as a
standalone Windows exe.

## Current state: complete through v1 + distributable

- All four analyses working end-to-end (stats, Reinert CHD, similarity, AFC).
- Visualizations follow academic Iramuteq conventions (see "Visualization overhaul").
- **`release/ERI-win64.zip` (≈138 MB) is a working, shareable build**: a friend
  double-clicks `ERI.exe` — no Python, no Node, no installs. Verified by launching the
  exe and running the full corpus→CHD flow against it.

## Architecture (single monolithic server outside dev)

The frontend is a **Next.js static export** (`output: "export"`, `trailingSlash: true`;
the workspace route is `/project/?id=...` — query param, not a dynamic segment).
FastAPI mounts the exported `frontend/out` at `/` (`_ui_dir()` in
`backend/app/main.py`: `ERI_UI_DIR` env → PyInstaller `_MEIPASS/ui` → repo-relative
`frontend/out`). `frontend/lib/api.ts:getApiBase()` targets `localhost:8000` only when
the page itself runs on port 3000 (dev); otherwise it calls the page's own origin —
which is what makes the same static bundle work in dev, Docker, and the exe (whose port
is chosen at runtime).

Run modes:
1. **Desktop exe** — `backend/desktop.py` (PyInstaller entry): picks a free port, sets
   the DB to `%LOCALAPPDATA%\ERI\eri.db`, starts uvicorn, auto-opens the browser.
   Build: `frontend: npm run build`, then `backend: build_exe.ps1` → `backend/dist/ERI.exe`
   (onefile, ~139 MB, ~10-30 s first-launch unpack, unsigned → SmartScreen warning).
2. **Docker** — single container (root `Dockerfile`: node build stage → python runtime;
   `docker compose up --build`, port 8000, volume `eri-data`). Per-service Dockerfiles
   were deleted. Still not actually built/tested in a session.
3. **Dev** — uvicorn :8000 + `next dev` :3000 (hot reload) as before.

## Visualization overhaul (matches published Iramuteq figures)

- **Similarity** (`similarity-view.tsx`) — rewritten from Cytoscape canvas to pure
  D3/SVG: words as frequency-scaled **text nodes** (white halo, community-colored);
  translucent **community contours** (points expanded → `d3.polygonHull` →
  Catmull-Rom-closed path, handles 1-2-node communities); **maximum spanning tree**
  rendering on by default (toggle) — this is Iramuteq's "arbre maximum" and what makes
  the reference figures readable; per-community anchor forces so contours separate
  spatially; synchronous seeded force simulation (deterministic, re-layout reseeds);
  zoom/pan; metric select + freq/weight sliders retained; hover neighborhood highlight;
  click → strongest-edges card; **vector SVG export** (replaced the old PNG-only export).
- **CHD** (`chd-view.tsx`) — classic academic **vertical top-down dendrogram**:
  orthogonal connectors, terminal classes on a uniform baseline, colored class headers
  ("Class N — pct%", segment count), and a **WORD | FREQ | χ² table stacked under each
  terminal branch inside the SVG** (top 18 words), so the export is a complete
  publication figure. Click a class → the interactive inspector below (χ² chart/table,
  variables, characteristic segments) — unchanged.
- **Clean exports** (`lib/export.ts`) — `downloadSvg` strips `[data-export-ignore]`
  elements (selection rings), `text-decoration` (selection underlines), and stale
  `class` attributes from the clone before serializing.

Verified in the browser against the user's real corpus (44 docs, 95k tokens, PT):
communities render as separated colored areas; dendrogram shows 6 classes with word
tables; export-strip logic confirmed on the live DOM. `npx tsc --noEmit` clean; final
static-export `npm run build` clean.

## Rebrand notes

"Iramuteq Web" → "ERI: Engine for Reinert Insights" in: UI header (`app/page.tsx`),
`<title>`/metadata (`app/layout.tsx`), FastAPI title, README.md, CONTRACT.md, CLAUDE.md,
frontend/README.md. References to the *original* Iramuteq software (iramuteq.org link,
"legacy Iramuteq `****` format") are intentionally kept — that's the external tool's
name, not our brand. Internal env var `IRAMUTEQ_DB` kept for compatibility (desktop
launcher sets it to `%LOCALAPPDATA%\ERI\eri.db`).

## Backend engine (unchanged this round — see git history for details)

`nlp/` (regex tokenizer + simplemma en/pt/fr/es, stopwords, UCE segmentation, legacy
`****`/CSV parsing) · `analysis/` (CA via SVD of standardized residuals; Reinert CHD
with axis-1 cut scan + 2-means-in-CA-space candidates + reallocation phase + balanced
tie-break; cooc/Jaccard/cosine networks + greedy-modularity communities; AFC; stats) ·
SQLite (WAL) storage · thread-pool jobs with SSE progress · every error →
`{code, message, hint}` envelope. **17/17 pytest green** (rerun after the static-mount
change).

## Verification ledger (this round)

1. `npx tsc --noEmit` + `npm run build` (static export) — zero errors.
2. Browser (dev servers, real 95k-token corpus): rebranded header/title; similarity
   text-nodes + hulls + MST; vertical dendrogram with χ² tables; export-strip check on
   live DOM (1 selection ring in DOM → 0 after strip).
3. `pytest tests -q` → 17/17 after mounting static UI.
4. uvicorn monolith: `/` serves ERI HTML, `/project/?id=…` 200, `/api/health` ok,
   unknown path 404.
5. **ERI.exe**: booted (banner + port print), UI title served, full
   project→preview→save→CHD flow via bundled SciPy/sklearn → 4 classes, 92.6%
   classified, `SMOKE OK`.

## CI / releases (added 2026-07-10)

`.github/workflows/build.yml`: on `v*` tags (or manual dispatch) builds the
frontend export + PyInstaller binary on windows-latest AND macos-latest (Apple
Silicon), smoke-tests that each binary boots and serves `/api/health`, zips
them with `packaging/LEIA-ME*.txt` + the demo corpus, and publishes a GitHub
Release. This is how the macOS version ships — PyInstaller can't cross-compile
from Windows. Intel Macs: build from source with `backend/build_exe.sh`.

## Known gaps / next steps

- Docker single-container path written but **never built/run** (was true before, still
  true — only the exe and dev paths are verified).
- Exe is unsigned (SmartScreen "run anyway" needed — documented in LEIA-ME.txt inside
  the zip); onefile → slow first launch; console window stays open by design.
- CORS still `*`; no auth; no CI; CRLF warnings (no `.gitattributes`).
- `release/` is gitignored (139 MB artifacts stay out of git); rebuild via
  `build_exe.ps1` + `Compress-Archive`.
- AFC and stats views untouched this round (already fine); similarity PNG export was
  replaced by SVG — if someone wants PNG back it's a small canvas-rasterize helper.
