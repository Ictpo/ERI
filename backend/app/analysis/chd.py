"""Descendent Hierarchical Classification (Reinert method).

Successive bipartitions of the segment x form binary matrix:
each cluster is ordered along its first correspondence-analysis axis, and the
cut maximizing the chi-square of the resulting 2 x vocabulary contingency
table is chosen. The largest terminal cluster is split next, until
`max_classes` classes exist or no cluster remains splittable.
"""
from __future__ import annotations

import numpy as np
from scipy.stats import chi2 as chi2_dist
from scipy.stats import chi2_contingency

from ..errors import AppError
from ..nlp.tokenize import TextParams
from .ca import correspondence_analysis
from .matrix import SegmentMatrix, build_segment_matrix

MIN_LEAF = 5          # a class must keep at least this many segments
MAX_CUT_CANDIDATES = 200


def _partition_chi2(counts1: np.ndarray, counts2: np.ndarray) -> float:
    """Chi-square of the 2 x V table of vocabulary counts of two groups."""
    t1, t2 = counts1.sum(), counts2.sum()
    if t1 == 0 or t2 == 0:
        return 0.0
    colt = counts1 + counts2
    keep = colt > 0
    c1, c2, ct = counts1[keep], counts2[keep], colt[keep]
    total = t1 + t2
    e1 = ct * (t1 / total)
    e2 = ct * (t2 / total)
    return float((((c1 - e1) ** 2) / e1).sum() + (((c2 - e2) ** 2) / e2).sum())


def _refine_split(sub: np.ndarray, mask: np.ndarray, max_iter: int = 20) -> tuple[np.ndarray, float]:
    """Reinert reallocation phase: reassign segments to the group whose
    lexical profile fits them best until the partition chi2 stabilizes."""
    n = sub.shape[0]
    global_rate = sub.mean(axis=0)
    best_mask = mask.copy()
    best_chi = _partition_chi2(sub[mask].sum(axis=0), sub[~mask].sum(axis=0))
    eps = 1e-9
    for _ in range(max_iter):
        n1 = mask.sum()
        if n1 < MIN_LEAF or n - n1 < MIN_LEAF:
            break
        p1 = sub[mask].mean(axis=0)
        p2 = sub[~mask].mean(axis=0)
        w1 = np.log((p1 + eps) / (global_rate + eps))
        w2 = np.log((p2 + eps) / (global_rate + eps))
        new_mask = (sub @ w1) > (sub @ w2)
        if new_mask.sum() < MIN_LEAF or n - new_mask.sum() < MIN_LEAF:
            break
        if (new_mask == mask).all():
            break
        mask = new_mask
        chi = _partition_chi2(sub[mask].sum(axis=0), sub[~mask].sum(axis=0))
        if chi > best_chi:
            best_chi, best_mask = chi, mask.copy()
        else:
            break
    return best_mask, best_chi


def _best_split(X: np.ndarray) -> tuple[np.ndarray, float] | None:
    """Split rows of X into two groups. Returns (bool mask of group 1, chi2)."""
    n = X.shape[0]
    if n < 2 * MIN_LEAF:
        return None
    sub = X[:, X.sum(axis=0) > 0]
    if sub.shape[1] < 2:
        return None
    try:
        ca = correspondence_analysis(sub, n_axes=3)
    except AppError:
        return None

    candidates: list[np.ndarray] = []

    # Candidate A: best chi2 cut along the first CA axis (classic Reinert).
    order = np.argsort(ca.row_coords[:, 0], kind="stable")
    cum = np.cumsum(sub[order], axis=0)
    total = cum[-1]
    cuts = np.arange(MIN_LEAF, n - MIN_LEAF + 1)
    if cuts.size:
        if cuts.size > MAX_CUT_CANDIDATES:
            cuts = cuts[np.linspace(0, cuts.size - 1, MAX_CUT_CANDIDATES).astype(int)]
        chi_by_cut = [_partition_chi2(cum[k - 1], total - cum[k - 1]) for k in cuts]
        k = int(cuts[int(np.argmax(chi_by_cut))])
        mask = np.zeros(n, dtype=bool)
        mask[order[:k]] = True
        candidates.append(mask)

    # Candidate B: 2-means in the CA factor space (catches contrasts that
    # axis 1 alone cannot order, e.g. when coordinates tie).
    try:
        from sklearn.cluster import KMeans

        labels = KMeans(n_clusters=2, n_init=5, random_state=0).fit_predict(ca.row_coords)
        mask = labels == 0
        if MIN_LEAF <= mask.sum() <= n - MIN_LEAF:
            candidates.append(mask)
    except Exception:
        pass

    def balance(m: np.ndarray) -> int:
        return int(min(m.sum(), n - m.sum()))

    best: tuple[np.ndarray, float] | None = None
    for mask in candidates:
        refined, chi = _refine_split(sub, mask.copy())
        if chi <= 0:
            continue
        # Prefer higher chi2; on (near-)ties prefer the more balanced split.
        if (best is None or chi > best[1] * (1 + 1e-9)
                or (chi >= best[1] * (1 - 1e-9) and balance(refined) > balance(best[0]))):
            best = (refined, chi)
    return best


def _word_profile(in_class: np.ndarray, sm: SegmentMatrix, max_words: int = 40) -> list[dict]:
    """Per-word chi2 association (segment presence in class vs. rest)."""
    n_in = int(in_class.sum())
    n_out = sm.X.shape[0] - n_in
    a = sm.X[in_class].sum(axis=0)           # segs in class containing word
    b = sm.X[~in_class].sum(axis=0)
    out = []
    for j, form in enumerate(sm.forms):
        table = np.array([[a[j], n_in - a[j]], [b[j], n_out - b[j]]], dtype=float)
        if table[0, 0] == 0 or table.min() < 0:
            continue
        # Only report over-represented words (observed > expected in class).
        expected = (a[j] + b[j]) * n_in / (n_in + n_out)
        if a[j] <= expected:
            continue
        try:
            chi, p, _, _ = chi2_contingency(table, correction=False)
        except ValueError:
            continue
        out.append({
            "form": form,
            "chi2": round(float(chi), 2),
            "p": float(f"{p:.3g}"),
            "freq_in": int(a[j]),
            "freq_total": int(a[j] + b[j]),
        })
    out.sort(key=lambda w: -w["chi2"])
    return out[:max_words]


def _variable_profile(in_class: np.ndarray, sm: SegmentMatrix, docs: list[dict]) -> list[dict]:
    seg_mods: dict[tuple[str, str], np.ndarray] = {}
    for var in sorted({v for d in docs for v in d.get("variables", {})}):
        values = np.array([docs[s.doc_index].get("variables", {}).get(var, "") for s in sm.segments])
        for mod in sorted(set(values) - {""}):
            seg_mods[(var, mod)] = values == mod
    n_in = int(in_class.sum())
    n = sm.X.shape[0]
    out = []
    for (var, mod), has in seg_mods.items():
        a = int((has & in_class).sum())
        expected = has.sum() * n_in / n
        if a <= expected or a == 0:
            continue
        table = np.array([[a, n_in - a], [has.sum() - a, n - n_in - (has.sum() - a)]], dtype=float)
        if table.min() < 0:
            continue
        try:
            chi, p, _, _ = chi2_contingency(table, correction=False)
        except ValueError:
            continue
        if p < 0.05:
            out.append({"variable": var, "modality": mod,
                        "chi2": round(float(chi), 2), "p": float(f"{p:.3g}")})
    out.sort(key=lambda w: -w["chi2"])
    return out[:15]


def _characteristic_segments(in_class: np.ndarray, sm: SegmentMatrix,
                             words: list[dict], n: int = 10) -> list[dict]:
    chi_by_form = {w["form"]: w["chi2"] for w in words}
    scored = []
    for i in np.flatnonzero(in_class):
        score = sum(chi_by_form.get(f, 0.0) for f in set(sm.seg_forms[i]))
        scored.append((score, i))
    scored.sort(key=lambda t: -t[0])
    return [
        {"text": sm.segments[i].text, "doc_index": sm.segments[i].doc_index,
         "score": round(s, 1)}
        for s, i in scored[:n] if s > 0
    ]


def run_chd(doc_texts: list[str], docs: list[dict], params: dict, progress=lambda f, s: None) -> dict:
    p = TextParams.from_dict(params)
    seg_size = max(10, int(params.get("seg_size", 40) or 40))
    max_classes = min(12, max(2, int(params.get("max_classes", 6) or 6)))

    progress(0.05, "Segmenting corpus into elementary context units")
    sm = build_segment_matrix(doc_texts, p, seg_size)
    n = sm.X.shape[0]
    if n < 2 * MIN_LEAF:
        raise AppError("corpus_too_small",
                       f"Only {n} usable segments were found; at least {2 * MIN_LEAF} are needed.",
                       "Provide more text, lower min_freq, or reduce the segment size.")

    progress(0.2, "Running successive bipartitions")
    # Tree of splits. Terminal clusters become classes.
    next_id = [0]

    def new_node(idx: np.ndarray) -> dict:
        node = {"id": next_id[0], "size": int(idx.size), "class_id": None,
                "children": None, "_idx": idx}
        next_id[0] += 1
        return node

    root = new_node(np.arange(n))
    terminals = [root]
    while len(terminals) < max_classes:
        terminals.sort(key=lambda nd: -nd["_idx"].size)
        split_done = False
        for node in terminals:
            res = _best_split(sm.X[node["_idx"]])
            if res is None:
                continue
            mask, _ = res
            left = new_node(node["_idx"][mask])
            right = new_node(node["_idx"][~mask])
            node["children"] = [left, right]
            terminals.remove(node)
            terminals.extend([left, right])
            split_done = True
            progress(0.2 + 0.5 * len(terminals) / max_classes,
                     f"Split cluster into {len(terminals)} classes")
            break
        if not split_done:
            break

    if len(terminals) < 2:
        raise AppError("chd_no_split",
                       "The corpus could not be partitioned into distinct lexical classes.",
                       "The vocabulary may be too uniform; try more text or a lower min_freq.")

    progress(0.75, "Profiling classes (chi-square word associations)")
    classes = []
    for ci, node in enumerate(sorted(terminals, key=lambda nd: -nd["_idx"].size), start=1):
        node["class_id"] = ci
        in_class = np.zeros(n, dtype=bool)
        in_class[node["_idx"]] = True
        words = _word_profile(in_class, sm)
        classes.append({
            "id": ci,
            "label": " / ".join(w["form"] for w in words[:3]) or f"class {ci}",
            "size": int(in_class.sum()),
            "pct": round(100.0 * in_class.sum() / n, 1),
            "words": words,
            "variables": _variable_profile(in_class, sm, docs),
            "segments": _characteristic_segments(in_class, sm, words),
        })

    def serialize(node: dict) -> dict:
        return {
            "id": node["id"], "size": node["size"], "class_id": node["class_id"],
            "children": [serialize(c) for c in node["children"]] if node["children"] else None,
        }

    progress(0.95, "Assembling dendrogram")
    return {
        "n_segments": sm.n_segments_total,
        "n_classified": n,
        "pct_classified": round(100.0 * n / sm.n_segments_total, 1),
        "tree": serialize(root),
        "classes": classes,
    }
