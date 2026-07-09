# ERI: Engine for Reinert Insights — Frontend

Next.js 14 (App Router) + TypeScript + Tailwind CSS frontend for ERI,
a browser-based reimplementation of the Iramuteq text-analysis software.

Implements the full API contract in `../CONTRACT.md`: projects, corpus
upload/preview/editing, and four async analyses (text statistics, Reinert
classification, similarity network, correspondence analysis) with live SSE
progress and interactive d3 / Cytoscape visualizations.

## Run locally

```bash
npm install
npm run dev
```

The app starts at http://localhost:3000.

### Environment

| Variable              | Default                 | Description                    |
| --------------------- | ----------------------- | ------------------------------ |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL of the FastAPI backend |

Create a `.env.local` to override:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Production build

```bash
npm run build
npm start
```

## Docker

Multi-stage build producing a standalone Next.js runner:

```bash
docker build -t iramuteq-web-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:8000 iramuteq-web-frontend
```

Note: `NEXT_PUBLIC_*` variables are inlined at build time; pass
`--build-arg NEXT_PUBLIC_API_URL=...` to `docker build` if the backend URL is
not the default.

## Project structure

```
app/                  Routes (/, /project/[id])
components/ui/        Hand-rolled shadcn-style primitives (Radix based)
components/projects/  Project list + create/delete dialogs
components/workspace/ Sidebar, corpus builder, analysis launcher, results pane
components/results/   Stats, word cloud (d3-cloud), CHD dendrogram (d3),
                      similarity network (cytoscape), AFC scatter (d3)
lib/                  Typed API client, contract types, palette, SVG export, CSV helper
```
