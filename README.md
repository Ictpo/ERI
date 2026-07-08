# Iramuteq Web

A modern, multi-user web reimplementation of [Iramuteq](http://www.iramuteq.org/) —
multidimensional text and questionnaire analysis — with the legacy wxPython/R desktop
stack replaced by a FastAPI statistical engine and an interactive Next.js interface.

| Legacy Iramuteq pain point | Iramuteq Web |
| --- | --- |
| Fragile local Python 2 + R install | `docker compose up` — zero local setup |
| Single-user desktop GUI | Server-side projects, any number of browsers |
| `**** *var_mod` manual text tagging | Visual corpus builder: upload TXT/CSV, edit variables in a table (legacy format still parsed) |
| Static R plot images | Interactive, zoomable D3/Cytoscape visualizations with SVG/PNG export |
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
  force-directed Cytoscape graph, community detection, live threshold sliders.
- **Correspondence factor analysis (AFC)** — vocabulary × variable-modalities factor
  map with inertia percentages, contributions, hover details, zoom/pan.
- **Text statistics** — frequencies, hapax legomena, per-variable totals, dynamic
  word cloud with live filters.

## Quick start

```bash
docker compose up --build
# frontend: http://localhost:3000   backend API docs: http://localhost:8000/docs
```

Dev without Docker:

```bash
cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
.venv/Scripts/uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev
```

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest tests -q
cd frontend && npm run build
```

## Repository layout

- `CONTRACT.md` — the API contract both halves are built against
- `backend/` — FastAPI + NumPy/SciPy/pandas/NetworkX engine (no R)
- `frontend/` — Next.js 14 workspace UI with D3 + Cytoscape visualizations
- `CLAUDE.md` — architecture map, run scripts and conventions for future work
