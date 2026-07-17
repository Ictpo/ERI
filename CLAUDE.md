# ERI: Engine for Reinert Insights

Modern reimplementation of Iramuteq (multidimensional text analysis), branded
"ERI: Engine for Reinert Insights". Monorepo: `backend/` (FastAPI +
NumPy/SciPy/pandas/NetworkX math engine, no R dependency) and `frontend/`
(Next.js 14 App Router + TypeScript + Tailwind + D3).

Ships as a **native desktop app** (pywebview window over a local FastAPI
server, bundled by PyInstaller into one file). Users download a zip from
GitHub Releases and double-click — no Python, no Node, no install.

**Owner:** a USP marketing student using ERI for real interview research.
Prefers plain-language explanations over jargon; the app's user-facing texts
(LEIA-ME files) are in Portuguese.

---

## THE WORKFLOW — how a change gets shipped

This is the standing process. **Follow it end to end for any user-visible
change; don't skip the verification step and don't ask the user to test
manually — verify it yourself and show proof.**

### 1. Change the code

Source of truth for the API is `CONTRACT.md` — if a route or JSON shape
changes, edit the contract FIRST, then match both `backend/app/main.py` and
`frontend/lib/{types,api}.ts`.

### 2. Verify locally — in the real app, not just tests

```powershell
# backend suite (engine invariants + API/SSE e2e)
cd backend; .\.venv\Scripts\python.exe -m pytest tests -q

# frontend types + static export
cd frontend; npx tsc --noEmit; npm run build
```

Then **drive the actual UI in a browser** against a running backend. Two
servers, both needed for dev:

```powershell
cd backend; .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
cd frontend; npm run dev     # http://localhost:3000
```

Open `http://localhost:3000/project/?id=<id>`, exercise the feature with the
user's REAL data (their projects are in the local SQLite db), read the console
for errors, and screenshot/probe the result. Existing project ids can be
listed with `curl -s http://localhost:8000/api/projects`.

**Gotchas learned the hard way:**
- Never run `npm run build` while `npm run dev` is live — they share `.next/`
  and the dev server breaks with `Cannot find module './xxx.js'`. Stop the dev
  server, `rm -rf .next out`, then build.
- The preview/browser tool can't reliably click Radix sliders/tabs — focus the
  element and dispatch `keydown` (`Home`, `ArrowRight`) or use
  `PointerEvent`s. Setting React input values needs the native setter +
  `input` event.
- Probe rendered output by fetching the export blob and parsing it, rather
  than trusting screenshots alone, when checking geometry/overlaps.

### 3. Rebuild the static export + the exe

The desktop app serves the frontend's **static export**, so the frontend must
be rebuilt before the exe or the exe ships stale UI.

```powershell
cd frontend; npm run build                     # -> frontend/out
cd ..\backend; powershell -ExecutionPolicy Bypass -File build_exe.ps1
# -> backend/dist/ERI.exe   (build_exe.py is the cross-platform driver;
#    build_exe.sh is the mac/linux wrapper)
```

### 4. Boot-test the exe (always — the bundle can break when the source didn't)

```bash
# headless: no window, writes the chosen port to a file
ERI_HEADLESS=1 ERI_PORT_FILE=port.txt ./ERI.exe &
# then: curl http://127.0.0.1:$(cat port.txt)/api/health   -> {"ok":true,...}
```

For a full native-window lifecycle check (window opens, closes cleanly, no
orphan server), enumerate the window by title and post `WM_CLOSE`, then assert
the port stopped listening and the process exited. `Start-Process`'s
`MainWindowHandle` is unreliable for pywebview — enumerate windows instead.

### 5. Refresh the local shareable zip

```powershell
Copy-Item -Force backend\dist\ERI.exe release\ERI.exe
Compress-Archive -Force -Path release\ERI.exe, packaging\LEIA-ME.txt, release\demo_corpus.txt `
  -DestinationPath release\ERI-win64.zip
```
`release/` is gitignored (140MB artifacts stay out of git).

### 6. Commit and push

```bash
git add -A
git commit -m "<what changed, and why>"   # end with the Co-Authored-By line
git push origin main
```

### 7. Cut a release — CI builds BOTH platforms

**PyInstaller cannot cross-compile**, so the Mac binary can only be built on a
Mac. `.github/workflows/build.yml` does that on GitHub's runners: on any `v*`
tag it builds the frontend + PyInstaller binary on **windows-latest** and
**macos-latest** (Apple Silicon), boot-tests each (headless + port file),
zips them with the matching `packaging/LEIA-ME*.txt` + demo corpus, and
publishes a GitHub Release.

```bash
git tag -a v2.1.4 -m "ERI v2.1.4 — <title>

What was wrong:
- <plain-language symptom the user actually saw>

What changed:
- <plain-language fix>"
git push origin v2.1.4
```

**The annotated tag message becomes the release notes** (the workflow re-fetches
the tag and uses `%(contents)`), so write it for the user, not for engineers.
Then watch the run (`https://api.github.com/repos/Ictpo/ERI/actions/runs?per_page=1`)
and confirm both zips land at `https://github.com/Ictpo/ERI/releases/tag/<tag>`.

Repo: **https://github.com/Ictpo/ERI** (public). `gh` CLI is NOT installed —
use the REST API via curl for release checks, and never try to create releases
locally; the tag push is the trigger.

### Versioning

`vMAJOR.MINOR.PATCH`. Bug-fix batch → patch (`v2.1.2` → `v2.1.3`). New
capability → minor. Architecture change → major (`v2.0.0` = native window).
`v1.2.0-browser` is the preserved last browser-tab build (fallback).

---

## Run modes

| Mode | Command | Notes |
|---|---|---|
| Dev | uvicorn :8000 + `npm run dev` :3000 | hot reload, two processes |
| Monolith | `uvicorn app.main:app --port 8000` with `frontend/out` built | one process serves UI + API |
| Docker | `docker compose up --build` | single container, port 8000, volume `eri-data`. **Never actually built/tested** |
| Desktop | `ERI.exe` | native window, free port, auto-opens |

The frontend is a **static export** (`output: "export"`, `trailingSlash`) — the
workspace route is `/project/?id=...` (query param, NOT a dynamic segment;
static export can't do dynamic routes). `lib/api.ts:getApiBase()` targets
localhost:8000 only when the page itself runs on port 3000 (dev); otherwise it
uses the page's own origin — that's what lets one static bundle work in dev,
Docker, and the exe (whose port is chosen at runtime). `main.py` mounts
`frontend/out` (or `ERI_UI_DIR`, or PyInstaller's `_MEIPASS/ui`) at `/`.

## Architecture map

- `backend/app/nlp/` — `tokenize.py` (regex tokens + simplemma lemmatization
  en/pt/fr/es; **underscores are word characters**: `dia_a_dia` stays one token
  and a trailing `_` locks a word against lemmatization), `stopwords.py`,
  `segment.py` (UCE segmentation), `corpus_parse.py` (legacy `**** *var_mod`
  TXT + CSV; **strips a leading UTF-8 BOM** — without it the first document is
  silently dropped).
- `backend/app/analysis/` — `matrix.py` (segments × active forms, min_freq,
  3000-form cap), `ca.py` (correspondence analysis via SVD of standardized
  residuals — shared core), `chd.py` (Reinert: axis-1 χ² cut scan + 2-means in
  CA space + reallocation phase, balanced tie-break), `similarity.py`
  (cooc/jaccard/cosine + NetworkX communities), `stats.py`, `afc.py`.
- `backend/app/jobs.py` — thread-pool jobs; SSE at `/api/analyses/{id}/events`.
  `storage.py` — SQLite (WAL), env `IRAMUTEQ_DB`.
- `backend/app/errors.py` — every error becomes `{error:{code,message,hint}}`;
  keep it that way (the frontend toasts message+hint verbatim).
- `backend/desktop.py` — the PyInstaller entry: free port, per-OS data dir,
  uvicorn on a daemon thread, pywebview window on the main thread, graceful
  shutdown on close. **Load-bearing details**: Windows builds are `--windowed`
  so `sys.stdout/stderr` are `None` → they're routed to `<data_dir>/eri.log`
  (remove that shim and uvicorn logging crashes the exe); `ALLOW_DOWNLOADS`
  must stay `True` or every export button silently does nothing.
- `frontend/` — workspace at `/project/?id=...`: left sidebar (analyses
  history), center (corpus builder / composer / analysis config), right
  (result tabs). Viz components are client-only (`dynamic(…, {ssr:false})`).

## Branding: two Tailwind scales are overridden (they lie about their names)

`frontend/tailwind.config.ts` overrides **both** built-in scales:
- **`indigo-*` renders ROSE** (`#D6266F` primary) — the Eri brand colour.
- **`slate-*` renders a WARM neutral ramp** (Paper `#FBF6F2` → Ink `#211619`) —
  the identity calls for neutrals "warmed off the cold slate of stock UI".

Every warm step is pinned to Tailwind slate's original **lightness (L\*)**, so
pre-existing contrast decisions survive and only the hue moves. One deliberate
deviation: the identity's Muted `#8C7A72` measures **3.81:1 on Paper — under
the 4.5:1 AA floor**, and `slate-500` is used for body-secondary text
everywhere, so `500` is `#7F6D65` (same hue, slate-500's lightness, 4.57:1).
Accessibility beats an exact token match.

`BRANDING.md` (the implementation guide) says to keep slate; the full identity
doc says to warm it. The identity doc won — but **the two sources disagree, so
check the identity doc, not just BRANDING.md**, before further brand work.

## Academic rigor rules (READ BEFORE TOUCHING ANY CHART)

ERI produces figures for real research. Branding must never be load-bearing
for reading an analysis. Standing rules:

- **Brand colour never encodes data.** Categorical encoding comes only from
  the Okabe–Ito palette in `lib/palette.ts` (plain hex — deliberately NOT
  Tailwind classes, so the `indigo`→rose override in `tailwind.config.ts`
  cannot reach it). Keep it that way.
- **Any colour that carries meaning must be justified with colour-vision
  evidence, not brand feel.** Measured min CIE76 ΔE vs the slate word
  markers across protan/deutan/tritan (Machado 2009 matrices):
  `#D6266F` brand rose **10.1 — fails** (protanopes see the same grey as
  words), `#4f46e5` old indigo 20.2, **`#851445` rose-800 26.4 — in use**,
  `#000000` 50.0 (plain mode). BRANDING.md Step 3 asked for `#D6266F`; it
  was rejected on this evidence and the brand ramp's 800 step used instead —
  on-brand *and* better than what it replaced.
- **Keep redundant channels.** AFC distinguishes words/modalities by shape
  (circle vs diamond) and label weight as well as colour. Don't drop them.
- **Text on a palette fill must use `readableTextOn()`** (`lib/palette.ts`).
  Hardcoded white broke the `#F0E442` yellow class label (1.32:1 contrast).
- **Plain mode** (`lib/appearance.tsx`, toggle in both headers,
  localStorage-backed) strips decoration: brand loader → plain spinner, AFC
  modality → black. It must never change a number, a position, or the
  categorical palette. Progress bars/percentages are functional — keep them
  in both modes.

**Known rigor limitation (unfixed):** `categoryColor()` wraps with modulo 8,
but CHD allows up to 12 classes and network communities are unbounded
(`greedy_modularity_communities`) — a real corpus here already produced 7.
Past 8 groups, two different classes/communities get the SAME colour. CHD
mitigates this by printing "Class N" text; **the similarity network does not
label communities, so >8 communities is genuinely ambiguous there.** Fixing
it properly means capping categorical colour (~6–8) and using another
channel, not inventing more hues.

## Visual/export conventions

- Similarity = D3 SVG force layout, **text nodes** (not dots), max-spanning-tree
  on by default, convex-hull community areas.
- CHD = vertical top-down dendrogram, classes on a shared baseline with
  word/freq/χ² tables inside the SVG.
- AFC = scatter; **markers never move** (they're the statistical result). Label
  overlaps are resolved in two phases: variable labels settle against each
  other, then freeze; word labels flow around them. Leader lines connect any
  displaced label to its marker.
- Every view's Download opens a **preview dialog** (SVG or PNG, per-view
  controls). Exports always show the FULL drawing — `[data-zoom-group]`
  transforms are reset, `[data-export-ignore]` elements stripped.
- Download blob URLs live **10 minutes** — the native window reads the blob
  only after the Save-As dialog closes; a short revoke produced empty files.

## Conventions / gotchas

- Python 3.13 local venv at `backend/.venv`; Docker uses 3.12-slim.
- Analyses are synchronous functions `(doc_texts, docs, params, progress)`
  registered in `RUNNERS` in `main.py`; `TextParams.from_dict` sanitizes shared
  params — reuse it.
- Windows dev: PowerShell 5.1 — **no `&&` chaining**; the Bash tool is also
  available and is usually easier.
- App icon: `packaging/eri.ico`, regenerated by `packaging/make_icon.py` from
  the source PNG. Small sizes MUST be **BMP** (only 256px may be PNG) or
  Windows shows a fallback icon in small views. Binaries are unsigned →
  SmartScreen / Gatekeeper warnings are expected and documented in LEIA-ME.
- Claude Design sync: see `.design-sync/NOTES.md` (config, previews, and the
  one-command re-sync are committed there).
