# ERI: Engine for Reinert Insights — API Contract (v1)

Backend: FastAPI at `http://localhost:8000`. All routes prefixed `/api`.
Frontend: Next.js at `http://localhost:3000`, reads `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
All bodies JSON unless noted. Errors: every non-2xx returns `{ "error": { "code": string, "message": string, "hint": string | null } }` — `message`/`hint` are human-readable and must be shown in a toast.

## Projects

- `GET /api/projects` → `Project[]`
- `POST /api/projects` `{name: string, description?: string}` → `Project`
- `GET /api/projects/{id}` → `Project & {corpus_summary: CorpusSummary | null}`
- `DELETE /api/projects/{id}` → `{ok: true}`

```ts
type Project = { id: string; name: string; description: string; created_at: string };
type CorpusSummary = { n_documents: number; n_tokens: number; n_forms: number; variables: { name: string; modalities: string[] }[] };
```

## Corpus

- `POST /api/projects/{id}/corpus/preview` — multipart form: `file` (.txt or .csv), `kind` = `"txt" | "csv"`, `text_column?` (csv), `encoding?`.
  TXT: documents split on lines starting `****` (legacy Iramuteq: `**** *var_mod` tags parsed into variables) or, if no `****` markers, on blank-line groups.
  Returns `{documents: DocumentIn[], detected_variables: string[], warnings: string[]}`. Does NOT persist.
- `PUT /api/projects/{id}/corpus` `{documents: DocumentIn[]}` — persists corpus (replaces existing). → `CorpusSummary`
- `GET /api/projects/{id}/corpus` → `{documents: DocumentIn[], summary: CorpusSummary}`

```ts
type DocumentIn = { id?: string; text: string; variables: Record<string, string> }; // variables e.g. {"sex":"f","age":"young"}
```

## Analyses (async job pipeline)

- `POST /api/projects/{id}/analyses` `{type: AnalysisType, params: object}` → `{analysis: Analysis}` (job starts immediately)
- `GET /api/projects/{id}/analyses` → `Analysis[]` (history, newest first)
- `GET /api/analyses/{aid}` → `Analysis` (includes `result` when `status === "done"`)
- `DELETE /api/analyses/{aid}` → `{ok: true}`
- `GET /api/analyses/{aid}/events` — **SSE** stream; each event `data:` line is
  `{status: "queued"|"running"|"done"|"error", progress: number (0..1), stage: string, message: string}`.
  Stream closes after a terminal event (`done`/`error`).

```ts
type AnalysisType = "stats" | "chd" | "similarity" | "afc";
type Analysis = {
  id: string; project_id: string; type: AnalysisType; params: object;
  status: "queued" | "running" | "done" | "error";
  error: { code: string; message: string; hint: string | null } | null;
  created_at: string; finished_at: string | null;
  result: StatsResult | ChdResult | SimilarityResult | AfcResult | null;
};
```

### Shared text params (all analysis types accept these)

```ts
type TextParams = {
  lang: "en" | "pt" | "fr" | "es";       // default "en"
  lemmatize: boolean;                      // default true
  remove_stopwords: boolean;               // default true
  custom_stopwords: string[];              // default []
  min_freq: number;                        // default 3 (min occurrences for "active" forms)
};
```

### 1. `stats` — params: `TextParams & { max_cloud_words?: number /* default 150 */ }`

```ts
type StatsResult = {
  total_tokens: number; unique_forms: number; hapax_count: number;
  freq: { form: string; freq: number; docs: number }[];   // sorted desc, full table
  hapax: string[];
  cloud: { form: string; freq: number }[];                 // top max_cloud_words after filters
  by_variable: { variable: string; modality: string; tokens: number; forms: number }[];
};
```

### 2. `chd` (Reinert) — params: `TextParams & { seg_size?: number /* target words per segment, default 40 */; max_classes?: number /* default 6 */ }`

```ts
type ChdResult = {
  n_segments: number; n_classified: number; pct_classified: number;
  tree: ChdNode; // binary tree of splits; leaves carry class_id
  classes: ChdClass[];
};
type ChdNode = { id: number; size: number; class_id: number | null; children: [ChdNode, ChdNode] | null };
type ChdClass = {
  id: number; label: string;            // label = top 3 words joined
  size: number; pct: number;
  words: { form: string; chi2: number; p: number; freq_in: number; freq_total: number }[]; // sorted chi2 desc
  variables: { variable: string; modality: string; chi2: number; p: number }[];             // over-represented modalities
  segments: { text: string; doc_index: number; score: number }[];                            // top 10 characteristic segments
};
```

### 3. `similarity` — params: `TextParams & { max_terms?: number /* default 60 */ }`
(All thresholding/filtering beyond `max_terms` is done client-side with sliders.)

```ts
type SimilarityResult = {
  nodes: { id: string; freq: number; community: number }[];
  edges: { source: string; target: string; cooc: number; jaccard: number; cosine: number }[]; // cooc >= 2 only
  n_segments: number;
};
```

### 4. `afc` — params: `TextParams & { variable: string /* which corpus variable to cross */; max_words?: number /* default 120 */ }`

```ts
type AfcResult = {
  explained: number[];                     // % inertia per axis (>= 2 axes, up to 3)
  rows: AfcPoint[];                        // words
  cols: AfcPoint[];                        // variable modalities
};
type AfcPoint = { label: string; x: number; y: number; z: number | null; mass: number; contrib_x: number; contrib_y: number; freq: number };
```

## Health

- `GET /api/health` → `{ok: true, version: string}`
