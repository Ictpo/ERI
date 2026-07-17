# ERI — How the analyses are computed

This document specifies the mathematics behind ERI's four analysis methods and
the shared text-processing pipeline that feeds them. It is a companion to the
code in `backend/app/`; file/line references point at the authoritative
implementation. Nothing here uses R — the whole engine is
NumPy / SciPy / scikit-learn / NetworkX.

The four analyses are dispatched by name in
[`app/main.py`](app/main.py) (`RUNNERS = {"stats", "chd", "similarity", "afc"}`):

| Name | Method | Module |
|------|--------|--------|
| `stats` | Descriptive text statistics | [`app/analysis/stats.py`](app/analysis/stats.py) |
| `chd` | Reinert descending hierarchical classification | [`app/analysis/chd.py`](app/analysis/chd.py) |
| `similarity` | Co-occurrence similarity network | [`app/analysis/similarity.py`](app/analysis/similarity.py) |
| `afc` | Correspondence factor analysis | [`app/analysis/afc.py`](app/analysis/afc.py) |

---

## 1. Shared text-processing pipeline

Every analysis starts from the same preprocessing. Parameters live in
`TextParams` ([`app/nlp/tokenize.py`](app/nlp/tokenize.py)); defaults in
parentheses.

### 1.1 Tokenization

`raw_tokens(text)` extracts word tokens with the regex

```
[^\W\d]+(?:['’_-][^\W\d]+)*
```

i.e. runs of Unicode **letters** (accents included, **no digits**), allowing
internal apostrophes, hyphens and underscores. Each token is lower-cased and
`’` is normalized to `'`. Underscores are deliberately kept so users can
protect compound forms (`dia_a_dia`) and lemma-lock a surface form (`havaianas_`),
matching the classic Iramuteq convention.

### 1.2 Normalization → analysis "forms"

`normalize_tokens(tokens, p)` turns raw tokens into the **forms** that analyses
count:

1. Drop stop-words (`remove_stopwords`, default on). Built-in function-word
   lists for `en / pt / fr / es` live in
   [`app/nlp/stopwords.py`](app/nlp/stopwords.py); users may add
   `custom_stopwords`.
2. **Lemmatize** (`lemmatize`, default on) with `simplemma` (pure-Python,
   dictionary-based, `en/pt/fr/es`). If a token has no lemma, the surface form
   is kept. Tokens **containing `_` are never lemmatized** (user-protected).
3. Drop again anything that is a stop-word after lemmatization or has length < 2.

Language must be one of `en, pt, fr, es` (falls back to `en`).

### 1.3 Segmentation into Elementary Context Units (ECU/UCE)

Multivariate methods (CHD, similarity) operate on **segments**, not whole
documents. `segment_corpus` ([`app/nlp/segment.py`](app/nlp/segment.py)) packs
consecutive sentences into segments of roughly `seg_size` word tokens
(default 40), cutting at sentence boundaries (`. ! ? ; newline`). A single
sentence longer than `1.6 × seg_size` is hard-split into word chunks. This is
the Reinert "segment" / *unité de contexte élémentaire*.

### 1.4 Segment × form matrix

`build_segment_matrix` ([`app/analysis/matrix.py`](app/analysis/matrix.py))
produces the binary design matrix shared by CHD and similarity:

- Keep **active forms**: forms occurring at least `min_freq` times
  (default 3) across all segments; capped at `MAX_ACTIVE_FORMS = 3000` most
  frequent.
- Build `X ∈ {0,1}^(n_segments × n_forms)`: `X[s, f] = 1` iff form `f` occurs in
  segment `s` (**presence/absence, not counts**).
- Segments with no active form are dropped. At least 2 usable segments are
  required.

`form_freq` (total corpus occurrences per form) is kept alongside `X`.

### 1.5 Correspondence-analysis core (shared by CHD and AFC)

`correspondence_analysis(N, n_axes)` ([`app/analysis/ca.py`](app/analysis/ca.py))
factors any non-negative contingency table `N` (rows × columns) via the SVD of
**standardized residuals** — the classic CA of Benzécri:

```
P = N / N.sum()                 # correspondence matrix (relative frequencies)
r = P.sum(axis=1)               # row masses      (row marginals)
c = P.sum(axis=0)               # column masses   (column marginals)
E = r ⊗ c                       # expected under independence
S = (P − E) / sqrt(E)           # standardized (Pearson) residuals
S = U Σ Vᵀ                      # thin SVD
```

Null axes (`σ ≤ 1e-12`) are dropped; a table with no variance raises an error.
Keeping the top `k = n_axes` singular triples, the **principal coordinates** are

```
row_coords = (U Σ) / sqrt(r)     # rows in factor space
col_coords = (V Σ) / sqrt(c)     # columns in the same space
```

Derived quantities:

- **Eigenvalues (inertia per axis):** `λ = σ²`.
- **Total inertia:** `Σ S²` (equals the table's χ²/N).
- **Explained inertia** of axis `a`: `λ_a / Σ S²`.
- **Contributions** of a point to an axis:
  `mass · coord² / λ` (row: `r·row_coords²/λ`; column: `c·col_coords²/λ`).

Rows/columns that were all-zero are re-expanded with zero coordinates and zero
mass so indexing matches the input.

---

## 2. Text statistics (`stats`)

Source: [`app/analysis/stats.py`](app/analysis/stats.py). Operates on **whole
documents** (no segmentation).

For every document: `raw_tokens` → `normalize_tokens`. Then aggregate:

- `total_tokens` — sum of **raw** token counts (before form filtering), the
  corpus size in running words.
- `freq` — a `Counter` of form → total occurrences.
- `doc_presence` — form → number of documents containing it (counts each form
  once per document, via `set(forms)`).
- `unique_forms` = number of distinct forms; `hapax` = forms with frequency
  exactly 1; `hapax_count` its size.
- **Frequency table**: `[{form, freq, docs}]` sorted by descending frequency.
- **By variable**: for each corpus variable and each modality, the summed
  `tokens` and distinct `forms` of the documents carrying that modality.
- **Word-cloud data**: the `max_cloud_words` (default 150, cap 300) most
  frequent forms as `{form, freq}`.

No inferential statistics here — it is purely descriptive counting.

---

## 3. Reinert descending hierarchical classification (`chd`)

Source: [`app/analysis/chd.py`](app/analysis/chd.py). This is the Reinert
method: successive **bipartitions** of the segment × form matrix, each split
found through correspondence analysis and refined by reallocation, producing a
dendrogram of lexical **classes**.

Parameters: `seg_size` (default 40), `max_classes` (default 6, clamped 2–12).
Constant `MIN_LEAF = 5` (a class must keep ≥ 5 segments).

### 3.1 Partition χ²

The quality of splitting a segment group into two vocabulary profiles is the
χ² of the `2 × V` table of summed form counts (`_partition_chi2`). For groups
with column totals `c1, c2` (`ct = c1 + c2`, over columns present in either):

```
t1 = Σc1,  t2 = Σc2,  total = t1 + t2
e1 = ct · t1/total     e2 = ct · t2/total          # expected
χ² = Σ (c1 − e1)²/e1  +  Σ (c2 − e2)²/e2
```

### 3.2 Finding one split (`_best_split`)

For a group with matrix `X` (≥ `2·MIN_LEAF` rows, ≥ 2 non-empty columns):

1. Run CA (`n_axes = 3`) on the sub-matrix of non-empty columns.
2. **Candidate A — classic Reinert cut:** order segments by their **first CA
   axis** coordinate; scan every cut position `k` (from `MIN_LEAF` to
   `n − MIN_LEAF`, at most `MAX_CUT_CANDIDATES = 200` positions) and pick the
   `k` maximizing the partition χ² of `{first k}` vs `{rest}` (computed
   incrementally from the cumulative sums).
3. **Candidate B — 2-means:** k-means (`k=2`, `n_init=5`) on the CA factor
   coordinates, kept only if both sides have ≥ `MIN_LEAF` rows. This catches
   contrasts axis 1 alone can't order.
4. **Reallocation / consolidation** (`_refine_split`, ≤ 20 iterations) on each
   candidate: with `global_rate` = mean presence per form and group profiles
   `p1, p2` = mean presence within each side, compute log-ratio weights

   ```
   w1 = log((p1 + ε)/(global_rate + ε))
   w2 = log((p2 + ε)/(global_rate + ε))          ε = 1e-9
   ```

   and reassign every segment to group 1 iff `X·w1 > X·w2` (the profile it fits
   better). Iterate while the partition χ² keeps improving and both sides stay
   ≥ `MIN_LEAF`.
5. Choose the candidate with the highest refined χ²; on near-ties prefer the
   **more balanced** split.

Returns the boolean membership mask and its χ², or `None` if the group can't be
split.

### 3.3 Building the tree

Start with all segments as the root. Repeatedly take the **largest** terminal
cluster that can still be split, bipartition it, and replace it with its two
children — until `max_classes` terminal clusters exist or nothing splits
further (`run_chd`). Terminal clusters, ordered by descending size, become
classes `1..K`.

### 3.4 Profiling each class

For each class (membership mask `in_class`):

- **Characteristic words** (`_word_profile`): for every form, a `2×2` table
  (segments in/out of class × containing/not-containing the form) and its χ²
  via `scipy.stats.chi2_contingency` (no Yates correction). Only
  **over-represented** forms are kept (observed count in class > expected
  `(a+b)·n_in/n`), sorted by descending χ², top 40. Each entry reports
  `{form, chi2, p, freq_in, freq_total}`. The class **label** is the top 3
  forms joined by " / ".
- **Characteristic variables** (`_variable_profile`): same `2×2` χ² test for
  each corpus variable-modality vs class membership; kept if over-represented
  and `p < 0.05`; top 15.
- **Characteristic segments** (`_characteristic_segments`): each in-class
  segment scored by the sum of its distinct forms' class-χ²; top 10 with
  positive score — the most typical example sentences.

### 3.5 Output

`{n_segments, n_classified, pct_classified, tree, classes}` where `tree` is the
serialized dendrogram (nested `{id, size, class_id, children}`) and `classes`
carries the profiles above. `pct_classified` is the share of all segments that
ended up in a class (segments with no active form are unclassified).

---

## 4. Co-occurrence similarity network (`similarity`)

Source: [`app/analysis/similarity.py`](app/analysis/similarity.py). Builds a
graph of the most frequent forms linked by how often they **co-occur in the
same segment**.

Parameter: `max_terms` (default 60, clamped 5–200).

1. Segment the corpus and build `X` (§1.4). Keep the `max_terms` most frequent
   forms; `X` is restricted to those columns.
2. **Co-occurrence matrix** (segment level, from the binary matrix):

   ```
   seg_count = X.sum(axis=0)     # segments containing each form  (a_i)
   C = Xᵀ X                      # C[i,j] = segments containing both i and j
   ```

3. For every pair `i < j` with `cooc = C[i,j] ≥ 2` add an edge weighted by
   `cooc`, plus two normalized similarities:

   ```
   Jaccard(i,j) = cooc / (a_i + a_j − cooc)
   cosine(i,j)  = cooc / sqrt(a_i · a_j)
   ```

   (Pairs co-occurring only once are dropped as noise.)
4. **Communities**: greedy modularity maximization
   (`networkx.community.greedy_modularity_communities`, weighted by `cooc`).
   Each node gets a community id (or `-1` if isolated / graph has no edges).

Output: `{nodes: [{id, freq, community}], edges: [{source, target, cooc,
jaccard, cosine}], n_segments}`. Node size in the UI reflects corpus frequency;
edge weight reflects co-occurrence; colour reflects community.

---

## 5. Correspondence factor analysis (`afc`)

Source: [`app/analysis/afc.py`](app/analysis/afc.py). Projects **words** and
the **modalities of one corpus variable** into a shared factor plane, showing
which vocabulary is characteristic of which modality.

Parameters: `variable` (required — the corpus variable to analyse),
`max_words` (default 120, clamped 10–400).

1. Group documents by their value (**modality**) of the chosen `variable`;
   documents with no value are skipped. Tokenize each document (§1.1–1.2) and
   accumulate per-modality form counts and a global frequency. At least **2
   modalities** are required.
2. **Active vocabulary**: forms with global frequency ≥ `min_freq`, the top
   `max_words` of them (≥ 3 required).
3. **Contingency table** `N` of shape `(active_forms × modalities)`:
   `N[f, m]` = occurrences of form `f` in documents of modality `m`.
4. Run the CA core (§1.5) with `n_axes = 3` if there are > 3 modalities, else
   `2`.
5. Emit, for rows (words) and columns (modalities):
   `{label, x, y, z, mass, contrib_x, contrib_y, freq}` — `x,y,z` are principal
   coordinates on axes 1–3, `mass` the marginal weight, `contrib_*` the
   percentage contribution to each axis, `freq` the raw frequency. `explained`
   gives the percentage of inertia per axis.

The map reads like any CA biplot: words plotted near a modality are
over-represented in it; distance from the origin and `contrib_*` indicate how
strongly a point structures each axis.

---

## Progress reporting & errors

Every runner takes a `progress(fraction, stage)` callback (streamed to the UI
over SSE by [`app/jobs.py`](app/jobs.py)) and raises structured `AppError`s
([`app/errors.py`](app/errors.py)) with a plain-language message and a
suggested fix when the corpus is too small, too uniform, or the parameters
filter out all vocabulary.

## Determinism

All results are deterministic for a given corpus and parameter set: k-means
uses `random_state=0`, and every other step (SVD, χ² scans, counting) is exact.
