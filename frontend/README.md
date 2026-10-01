# ERI: Engine for Reinert Insights — Frontend

Next.js 14 (App Router) + TypeScript + Tailwind CSS interface for ERI, a desktop
app that reimplements the Iramuteq text-analysis software. The build is a static
export (`out/`) that the desktop app shows in its own native window. A browser is
only used during development.

Implements the full API contract in `../CONTRACT.md`: projects, corpus
upload/preview/editing, and four async analyses (text statistics, Reinert
classification, similarity network, correspondence analysis) with live SSE
progress and interactive D3 visualizations.

## Run in development

```bash
npm install
npm run dev
```

The dev server starts at http://localhost:3000 and talks to a backend on port
8000 (see the root README's dev mode).

### Environment

The UI calls the API on its own origin, except when it is served on port 3000
(`npm run dev`), where it calls `http://localhost:8000`. No configuration is
needed for the desktop app or the dev setup above.

To point `npm run dev` at a backend elsewhere, set `NEXT_PUBLIC_API_URL` in a
`.env.local`. The override works in `next dev` only: `getApiBase()` ignores it
in builds, because a URL baked into the static export would send the desktop
app (which picks a random port) to the wrong server.

## Build for the desktop app

```bash
npm run build
```

This writes the static export to `out/`. There's no Next.js server in the
shipped app: the FastAPI backend serves `out/` inside the desktop window, and
`backend/build_exe.ps1` bundles it into `ERI.exe`. (`npm start` doesn't work
with a static export.)

## Project structure

```
app/                  Routes (/, /project/?id=…; a query parameter, since a static export can't have dynamic segments)
components/ui/        Hand-rolled shadcn-style primitives (Radix based)
components/projects/  Project list + create/delete dialogs
components/workspace/ Sidebar, corpus builder, analysis launcher, results pane
components/results/   Stats, word cloud (d3-cloud), CHD dendrogram (d3),
                      similarity network (d3), AFC scatter (d3)
lib/                  Typed API client, contract types, palette, SVG export, CSV helper
```
