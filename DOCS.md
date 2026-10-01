# ERI: Engine for Reinert Insights — reference

What the app does, what it looks like and why, and how it works end to end.

This is the orientation document. Three companions go deeper:

| Document | Covers |
|---|---|
| [`backend/ANALYSIS.md`](backend/ANALYSIS.md) | The mathematics of all four analyses, formula by formula |
| [`CONTRACT.md`](CONTRACT.md) | The HTTP/JSON contract both halves are built against |
| [`BRANDING.md`](BRANDING.md) | The step-by-step brand implementation log |

---

## 1. What ERI is

ERI is a from-scratch reimplementation of **Iramuteq**, the desktop tool for
multidimensional text analysis used in qualitative social research. Iramuteq
wraps Python 2 and R; installing it is a project in itself, and its interface
assumes you already know the method.

ERI keeps the methods and drops the installation. It ships as a **single
executable**: download, double-click, work. No Python, no R, no Node.

**The problem it solves.** A researcher finishes twenty interviews and has
80,000 words of transcript. Reading them yields impressions; nobody can hold
that much text in their head at once. ERI applies the statistical methods of
the French school of textual analysis — Reinert's classification, Benzécri's
correspondence analysis — to surface the vocabulary structures actually present
in the corpus, and then shows the original sentences behind each finding so the
interpretation stays yours.

**Who it's for.** Qualitative researchers, most of whom are not statisticians.
Every error message, parameter and result view is written to be understood
without a methods course. The Portuguese `LEIA-ME` files are the end-user
entry point.

**Tagline.** *Hear the pattern beneath the noise.*

---

## 2. What you can do with it

### The working loop

```
Project  →  Corpus  →  Analysis  →  Result  →  Export
```

1. **Create a project.** A named container. Everything lives in a local SQLite
   database on your own machine — nothing is uploaded anywhere.
2. **Load a corpus.** Two ways in:
   - **Upload a file.** A legacy Iramuteq `.txt` (documents introduced by
     `****` lines with `*variable_modality` tags) or a `.csv` table where you
     pick the text column and the remaining columns become variables.
   - **Compose document by document.** Define your variables once, then paste
     each interview and pick its values from dropdowns. No markers to
     hand-write and no chance of a typo in a tag.
3. **Run an analysis.** Pick one of the four methods and its parameters.
   Analyses run in a background thread pool; progress streams live to the UI.
4. **Read the result.** Each view is interactive — zoom, pan, spread, toggles.
5. **Export.** Every view has a Download button that opens a preview showing
   exactly what will be saved, as vector **SVG** or raster **PNG**.

### The four analyses

| Method | Question it answers | Output |
|---|---|---|
| **Text statistics** | What words are in this corpus, and how often? | Frequency table, hapax list, word cloud, per-variable breakdown |
| **Reinert classification (CHD)** | What distinct "ways of talking" exist here? | Dendrogram of lexical classes, each with its characteristic words, variables and example sentences |
| **Similarity network** | Which words travel together? | Force-directed graph of co-occurrence, with detected communities |
| **Correspondence analysis (AFC)** | Which vocabulary belongs to which group? | Factor plane plotting words against the modalities of a chosen variable |

The mathematics behind each is specified in
[`backend/ANALYSIS.md`](backend/ANALYSIS.md). In short: everything is built on
a segment × form binary matrix, a shared correspondence-analysis core (SVD of
standardized residuals), and χ² association tests.

### Corpus conventions worth knowing

- **Variables** are the metadata that make AFC and class profiling possible —
  age band, gender, customer segment, whatever you coded.
- **Underscores are word characters.** `dia_a_dia` stays one token instead of
  three, and a trailing underscore (`havaianas_`) locks a word against
  lemmatization. This is the classic Iramuteq convention, preserved.
- **A leading UTF-8 BOM is stripped** on import. Windows editors add it
  invisibly, and without stripping it the first `****` marker sits off column 0
  and the first document vanishes silently.

---

## 3. Visual identity

### The name and the mark

**ERI: Engine for Reinert Insights.** The full name carries the product; the
bare acronym is reserved for pinpointed places — the fox mark, the splash
wordmark, the executable.

The mark is a **neon fox**, derived from an original painting by Erine Chen Bi
Ting. Inside the fox's silhouette runs faint binary. The fox is the app's
listener: attentive, quiet, watching for a pattern.

### Palette

The identity is warm ink and neon, never corporate blue.

| Token | Hex | Role |
|---|---|---|
| Rose (primary) | `#D6266F` | Buttons, active states, focus |
| Rose hover | `#A81A57` | Hover |
| Rose 800 | `#851445` | AFC modality markers (see below) |
| Coral | `#F0704A` | Gradient mid, binary rain |
| Amber | `#F4A63F` | Gradient end, rain highlights |
| Paper | `#FBF6F2` | Page ground |
| Surface | `#F5ECE6` | Cards, wells |
| Ink text | `#211619` | Body copy |
| Ink black | `#0C0709` | Dark surfaces, splash, loader |

**Two Tailwind scales are overridden, and they lie about their names.** This is
the single most surprising thing in the codebase:

- **`indigo-*` renders ROSE.** The brand ramp replaces Tailwind's indigo, so
  the 46 existing `indigo-*` usages became on-brand with zero component
  edits.
- **`slate-*` renders a WARM neutral ramp.** The identity calls for neutrals
  "warmed off the cold slate of stock UI." The steps are **not** all at stock
  lightness: Paper/Surface/Border/Ink are the identity's hex values and are
  darker than stock slate 50/100/200/900, so contrast checked on stock slate
  must be re-checked on `slate-100`/`200` surfaces.

One deliberate deviation: the identity's published Muted `#8C7A72` measures
**3.81:1 on Paper — below the 4.5:1 AA floor** — and `slate-500` carries
secondary body text everywhere. So `500` is `#7F6D65`: same hue, slate-500's
lightness, **4.57:1 on Paper — but only 4.21:1 on Surface (`slate-100`)**, so
text sitting directly on `slate-100` (e.g. inactive tab labels) uses
`slate-600`. Accessibility beat an exact token match.

### Typography

- **Newsreader** (serif) — wordmark and headings only.
- **Inter** — body, tables, controls, everything else.

### Motion: the pounce

Animation appears in exactly two places, both of them waiting states:

- **Startup splash** — the desktop window opens on an animated screen while the
  server boots: the fox under a spinning rose/coral/amber ring, over falling
  binary rain.
- **In-app loader** — the same motif while an analysis runs.

The rain is not decorative noise. **Each falling column is the ASCII-binary of
`E`, `ER` or `ERI`** — so the acronym is literally encoded in it, and the
columns come in three lengths (8, 16, 24 bits) for that reason. Streams fall at
a steady speed independent of length, with a bright leading head and a fading
tail, and start above the frame so the screen opens empty and fills in.

---

## 4. Academic rigor rules

ERI produces figures for real research. **Branding is never load-bearing for
reading an analysis.** These rules are enforced in code and must survive future
brand work.

**Brand colour never encodes data.** Categorical encoding comes only from the
**Okabe–Ito** colourblind-safe palette in
[`frontend/lib/palette.ts`](frontend/lib/palette.ts) — written as plain hex,
deliberately *not* Tailwind classes, so the `indigo`→rose override cannot reach
it.

**Colour that carries meaning is justified with colour-vision evidence, not
brand feel.** Measured minimum CIE76 ΔE against the neutral word markers across
protan/deutan/tritan simulation (Machado 2009 matrices):

| Colour | ΔE | Verdict |
|---|---|---|
| `#D6266F` brand rose | 10.1 | **Rejected** — protanopes see it as the same grey as the words |
| `#4f46e5` old indigo | 20.2 | Was in use |
| `#851445` rose-800 | **26.4** | **In use** — on-brand *and* better than what it replaced |
| `#000000` | 50.0 | Plain mode |

**Keep redundant channels.** AFC separates words from modalities by **shape**
(circle vs diamond) and label weight as well as colour. Never reduce it to
colour alone.

**Text on a fill uses `readableTextOn()`.** The palette spans `#000000` to
`#F0E442` (1.32:1 against white) — hardcoded white text made the yellow class
label unreadable.

**Plain mode** ([`lib/appearance.tsx`](frontend/lib/appearance.tsx),
kept in the local database via `/api/settings`, so it survives a relaunch)
strips decoration for publication: the animated loader becomes a plain
spinner, the AFC modality colour becomes black. It must
**never** change a number, a position, or the categorical palette. Progress
bars and percentages are functional information — they stay in both modes.

**Exports are white-background only**, deliberately. A dark figure pasted into
a dissertation is a problem, so the export path always paints white and resets
zoom, regardless of what you were looking at.

### Known rigor limitation (open)

`categoryColor()` wraps with modulo 8, but CHD allows up to **12** classes and
network communities are unbounded. Past 8 groups, two different
classes/communities get the **same colour**. CHD mitigates this by printing
"Class N" text; **the similarity network does not label communities, so more
than 8 communities is genuinely ambiguous there.** Fixing it properly means
capping categorical colour around 6–8 and adding another channel, not inventing
more hues.

---

## 5. How it works

### Shape of the system

```
┌─────────────────────────────────────────────────────┐
│  pywebview window  (native desktop shell)           │
│  ┌───────────────────────────────────────────────┐  │
│  │  Next.js static export  (the whole UI)        │  │
│  └───────────────────┬───────────────────────────┘  │
│                      │  HTTP + SSE, 127.0.0.1       │
│  ┌───────────────────▼───────────────────────────┐  │
│  │  FastAPI  ──  analysis engine  ──  SQLite     │  │
│  └───────────────────────────────────────────────┘  │
│         all of it inside one ERI.exe                │
└─────────────────────────────────────────────────────┘
```

One process. The server binds a **free port on localhost only** and the
database is a local file — nothing listens on the network and nothing leaves
the machine.

### The frontend is a static export

Next.js 14 App Router with `output: "export"`. Consequences that shape the
code:

- **No dynamic routes.** The workspace is `/project/?id=…` — a query
  parameter, not `/project/[id]`, because static export cannot do dynamic
  segments.
- **One bundle works everywhere.** `lib/api.ts:getApiBase()` targets
  `localhost:8000` only when the page itself is served from port 3000 (dev);
  otherwise it calls the page's own origin. That single rule lets the same
  built bundle run in dev, from the monolith, and inside the exe — whose port
  is chosen at runtime and unknowable at build time.
- **Visualization components are client-only** (`dynamic(…, { ssr: false })`),
  since D3 needs a DOM.

FastAPI mounts the exported `frontend/out` at `/` (`ERI_UI_DIR` env →
PyInstaller's `_MEIPASS/ui` → repo-relative `frontend/out`), so in production
the UI and the API are the same origin and the same process.

### The API

All responses are JSON; every error is `{error: {code, message, hint}}` and the
frontend shows `message` + `hint` verbatim. Keep it that way.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness + version (used by the boot test) |
| `GET/PUT` | `/api/settings` | App preferences (plain mode), so they survive a relaunch |
| `GET/POST` | `/api/projects` | List / create projects |
| `GET/DELETE` | `/api/projects/{pid}` | Fetch / delete one |
| `POST` | `/api/projects/{pid}/corpus/preview` | Parse an upload and report warnings **before** saving |
| `GET/PUT` | `/api/projects/{pid}/corpus` | Read / replace the corpus |
| `GET/POST` | `/api/projects/{pid}/analyses` | List / launch analyses |
| `GET/DELETE` | `/api/analyses/{aid}` | Fetch result / delete |
| `GET` | `/api/analyses/{aid}/events` | **SSE** progress stream |

The preview step is deliberate: importing a corpus is the easiest place to
lose data silently, so the parse result and its warnings are shown for review
before anything is written.

### Jobs and progress

Analyses are plain synchronous functions with the signature
`(doc_texts, docs, params, progress)`, registered in `RUNNERS` in `main.py`.
[`jobs.py`](backend/app/jobs.py) runs them on a `ThreadPoolExecutor`
(4 workers) and tracks `queued → running → done | error`. The SSE endpoint
streams each state change and sends keep-alive comments while idle, so a long
CHD reports "Running successive bipartitions" rather than freezing.

### Storage

SQLite via [`storage.py`](backend/app/storage.py), `journal_mode=WAL`, three
tables: `projects`, `corpora`, `analyses` (results stored as JSON). The
location is `IRAMUTEQ_DB`, which the desktop build points at a per-OS data
directory:

| OS | Location |
|---|---|
| Windows | `%LOCALAPPDATA%\ERI\eri.db` |
| macOS | `~/Library/Application Support/ERI/eri.db` |
| Linux | `$XDG_DATA_HOME/ERI/eri.db` |

### The desktop shell

[`backend/desktop.py`](backend/desktop.py) is the PyInstaller entry point. Its
load-bearing details, each of which exists because of a real failure:

- **The window opens on the animated splash first**, then a background worker
  imports the web server, starts uvicorn, waits until it reports it has
  started (`server.started`, up to ~60 s), and swaps the window to the app.
  The analysis stack (numpy/scipy/scikit-learn/networkx) is imported only
  when the first analysis runs. If startup fails, the window shows a plain
  error page with a hint instead of hanging on the splash.
- **Windows builds are `--windowed`**, so `sys.stdout`/`stderr` are `None`.
  They are redirected to `<data_dir>/eri.log`; remove that shim and uvicorn's
  logging crashes the exe.
- **`ALLOW_DOWNLOADS` must stay `True`** or every export button silently does
  nothing.
- **One native bridge** is exposed to the page as `window.pywebview.api`:
  `save_file` — exports go through a native Save dialog that **forces the
  correct extension**. The browser's own blob download uses an "All files"
  dialog, so renaming the file dropped the extension and produced a
  formatless file.
- **External links are plain `target="_blank"`.** pywebview hands new-window
  requests to the system browser (`OPEN_EXTERNAL_LINKS_IN_BROWSER`, its
  default, set explicitly in `desktop.py`), so the app window never navigates.
- **Never hold the pywebview `Window` as an attribute of the js_api object** —
  pywebview introspects that object and recurses forever through the native
  WinForms/WebView2 COM tree. Fetch the window with `webview.active_window()`
  inside the method instead.

### Run modes

| Mode | How | Notes |
|---|---|---|
| **Dev** | uvicorn `:8000` + `npm run dev` `:3000` | Hot reload, two processes |
| **Monolith** | `uvicorn app.main:app --port 8000` with `frontend/out` built | One process serves UI + API |
| **Desktop** | `ERI.exe` | Native window, free port |

---

## 6. Building and releasing

The desktop app serves the frontend's **static export**, so the frontend must
be rebuilt before the exe or the exe ships stale UI.

```powershell
cd frontend; npm run build                    # -> frontend/out
cd ..\backend; .\.venv\Scripts\python.exe build_exe.py
#                                             -> backend/dist/ERI.exe  (~157 MB)
```

> **Build with the project venv, not the global Python.** The global
> interpreter lacks `uvicorn`, and PyInstaller will happily produce a broken
> ~54 MB exe that fails at launch instead of erroring at build time.

Then **boot-test the bundle** — it can break when the source didn't:

```bash
ERI_HEADLESS=1 ERI_PORT_FILE=port.txt ./ERI.exe &
curl http://127.0.0.1:$(cat port.txt)/api/health     # -> {"ok":true,...}
```

**Releases are cut by tag.** PyInstaller cannot cross-compile, so the macOS
binary can only be built on macOS; `.github/workflows/build.yml` does that on
GitHub's runners. Pushing any `v*` tag builds the frontend and the binary on
**windows-latest** and **macos-latest**, boot-tests each headless, zips them
with the matching `LEIA-ME` and a demo corpus, and publishes a GitHub Release.
**The annotated tag message becomes the release notes**, so write it for the
researcher, not for engineers.

Binaries are **unsigned** — SmartScreen and Gatekeeper warnings are expected
and documented in the `LEIA-ME` files.

---

## 7. Where things live

```
backend/
  app/
    main.py            FastAPI app, routes, RUNNERS registry
    jobs.py            thread-pool jobs + SSE
    storage.py         SQLite (WAL)
    errors.py          {code, message, hint} envelope
    splash.py          generated animated splash HTML
    nlp/
      tokenize.py      tokens, lemmatization, TextParams
      stopwords.py     en / pt / fr / es
      segment.py       UCE segmentation
      corpus_parse.py  legacy TXT + CSV import
    analysis/
      matrix.py        segment x form binary matrix
      ca.py            correspondence-analysis core (SVD)
      chd.py           Reinert classification
      similarity.py    co-occurrence network
      afc.py           correspondence factor analysis
      stats.py         descriptive statistics
  desktop.py           PyInstaller entry: window, server, native bridges
  build_exe.py         cross-platform PyInstaller driver
  ANALYSIS.md          the mathematics

frontend/
  app/                 routes: / and /project
  components/
    results/           one view per analysis + export dialog
    workspace/         sidebar, corpus builder/composer, results pane
    ui/                design-system primitives, brand loader
    made-by.tsx        author credit -> LinkedIn
  lib/
    palette.ts         Okabe-Ito categorical palette (never themed)
    appearance.tsx     plain mode
    export.ts          SVG/PNG export pipeline + native save bridge
    api.ts, types.ts   API client, mirrors CONTRACT.md

packaging/             icons, brand marks, splash generator, LEIA-ME files
.github/workflows/     two-platform build + release
```

---

## 8. Limitations, stated plainly

- **More than 8 groups reuse colours** (see §4). Real corpora have already
  produced 7 communities.
- **Binaries are unsigned**, so first launch shows an OS warning.
- **Every launch can take 10–30 seconds**: the one-file bundle unpacks to a new
  temporary folder on each start (deleted on exit), and antivirus may scan it.
  The animated splash covers the second half of that wait, but the unpack
  itself happens before any of our code runs, so the first moment is silent.
- **Lemmatization is dictionary-based** (`simplemma`), not contextual. It is
  fast and dependency-free, and it will occasionally mis-lemmatize a word that
  a full parser would get right.
- **Intel Macs must build from source** — CI publishes Apple Silicon only.
- **`cytoscape` and `cytoscape-cose-bilkent` are declared dependencies but are
  not imported anywhere** — leftovers from an earlier network prototype that
  D3 replaced. They can be dropped from `package.json`.
