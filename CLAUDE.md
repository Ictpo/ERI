# Iramuteq Web

Modern multi-user web reimplementation of Iramuteq (multidimensional text analysis).
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

Or containerized: `docker compose up --build` (frontend 3000, backend 8000, SQLite volume `iramuteq-data`).

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
- `frontend/` — see `frontend/README.md`. Workspace at `/project/[id]`: left sidebar
  (analyses history), center (corpus builder / analysis config), right (result tabs:
  dendrogram, network, factor map, stats+cloud). Viz components are client-only
  (`dynamic(..., {ssr:false})`).

## Conventions / gotchas

- Python 3.13 local venv at `backend/.venv`; Docker uses 3.12-slim (both fine).
- Analyses run in a thread pool — keep runners synchronous functions taking
  `(doc_texts, docs, params, progress)` and registered in `RUNNERS` in main.py.
- `TextParams.from_dict` sanitizes all shared params; new analysis types should reuse it.
- Windows dev: PowerShell 5.1 — no `&&` chaining.
