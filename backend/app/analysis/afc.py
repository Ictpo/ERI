"""Correspondence Factor Analysis: vocabulary x corpus-variable modalities."""
from __future__ import annotations

from collections import Counter

import numpy as np

from ..errors import AppError
from ..nlp.tokenize import TextParams, tokenize
from .ca import correspondence_analysis


def run_afc(doc_texts: list[str], docs: list[dict], params: dict,
            progress=lambda f, s: None) -> dict:
    p = TextParams.from_dict(params)
    variable = str(params.get("variable", "") or "")
    max_words = min(400, max(10, int(params.get("max_words", 120) or 120)))

    all_vars = sorted({v for d in docs for v in d.get("variables", {})})
    if not variable:
        raise AppError("afc_no_variable", "No corpus variable was selected for the analysis.",
                       f"Available variables: {', '.join(all_vars) or 'none — add variables in the corpus builder'}.")
    if variable not in all_vars:
        raise AppError("afc_unknown_variable", f"The corpus has no variable named '{variable}'.",
                       f"Available variables: {', '.join(all_vars)}.")

    progress(0.1, "Tokenizing documents by modality")
    counts_by_mod: dict[str, Counter] = {}
    global_freq: Counter = Counter()
    for d, text in zip(docs, doc_texts):
        mod = d.get("variables", {}).get(variable, "").strip()
        if not mod:
            continue
        forms = tokenize(text, p)
        counts_by_mod.setdefault(mod, Counter()).update(forms)
        global_freq.update(forms)

    mods = sorted(counts_by_mod)
    if len(mods) < 2:
        raise AppError(
            "afc_one_modality",
            f"Variable '{variable}' has {len(mods)} modality; at least 2 are required.",
            "Correspondence analysis needs documents spread across several modalities.",
        )

    active = [f for f, c in global_freq.most_common() if c >= p.min_freq][:max_words]
    if len(active) < 3:
        raise AppError("no_active_forms", "Fewer than 3 words pass the frequency filter.",
                       "Lower the minimum frequency or provide more text.")

    progress(0.4, "Building contingency table")
    N = np.array([[counts_by_mod[m][f] for m in mods] for f in active], dtype=float)

    progress(0.6, "Running factor decomposition")
    n_axes = 3 if len(mods) > 3 else 2
    ca = correspondence_analysis(N, n_axes=n_axes)
    k = ca.row_coords.shape[1]
    has_z = k >= 3

    def points(labels, coords, mass, contrib, freqs):
        out = []
        for i, label in enumerate(labels):
            out.append({
                "label": label,
                "x": round(float(coords[i, 0]), 4),
                "y": round(float(coords[i, 1]), 4) if k >= 2 else 0.0,
                "z": round(float(coords[i, 2]), 4) if has_z else None,
                "mass": round(float(mass[i]), 5),
                "contrib_x": round(100 * float(contrib[i, 0]), 2),
                "contrib_y": round(100 * float(contrib[i, 1]), 2) if k >= 2 else 0.0,
                "freq": int(freqs[i]),
            })
        return out

    progress(0.9, "Assembling factor map")
    explained = [round(100 * float(e), 2) for e in ca.explained[: max(2, k)]]
    while len(explained) < 2:
        explained.append(0.0)
    return {
        "explained": explained,
        "rows": points(active, ca.row_coords, ca.row_mass, ca.row_contrib,
                       [global_freq[f] for f in active]),
        "cols": points(mods, ca.col_coords, ca.col_mass, ca.col_contrib,
                       [sum(counts_by_mod[m].values()) for m in mods]),
    }
