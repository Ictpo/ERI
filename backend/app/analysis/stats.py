"""Classic text statistics: frequencies, hapax, word-cloud data."""
from __future__ import annotations

from collections import Counter

from ..errors import AppError
from ..nlp.tokenize import TextParams, raw_tokens, normalize_tokens


def run_stats(doc_texts: list[str], docs: list[dict], params: dict,
              progress=lambda f, s: None) -> dict:
    p = TextParams.from_dict(params)
    max_cloud = min(300, max(10, int(params.get("max_cloud_words", 150) or 150)))
    if not doc_texts:
        raise AppError("empty_corpus", "The corpus has no documents.",
                       "Upload and save a corpus first.")

    progress(0.1, "Tokenizing documents")
    freq: Counter = Counter()
    doc_presence: Counter = Counter()
    total_tokens = 0
    per_doc_forms: list[list[str]] = []
    for text in doc_texts:
        toks = raw_tokens(text)
        total_tokens += len(toks)
        forms = normalize_tokens(toks, p)
        per_doc_forms.append(forms)
        freq.update(forms)
        doc_presence.update(set(forms))

    if not freq:
        raise AppError("no_active_forms", "No words remain after filtering.",
                       "Disable stop-word removal or check the corpus language.")

    progress(0.6, "Computing frequency tables")
    freq_table = [
        {"form": f, "freq": c, "docs": doc_presence[f]}
        for f, c in freq.most_common()
    ]
    hapax = sorted([f for f, c in freq.items() if c == 1])

    by_variable = []
    var_names = sorted({v for d in docs for v in d.get("variables", {})})
    for var in var_names:
        agg: dict[str, Counter] = {}
        for d, forms in zip(docs, per_doc_forms):
            mod = d.get("variables", {}).get(var, "").strip()
            if mod:
                agg.setdefault(mod, Counter()).update(forms)
        for mod in sorted(agg):
            by_variable.append({
                "variable": var, "modality": mod,
                "tokens": sum(agg[mod].values()), "forms": len(agg[mod]),
            })

    progress(0.9, "Building word cloud data")
    cloud = [{"form": f, "freq": c} for f, c in freq.most_common(max_cloud)]
    return {
        "total_tokens": total_tokens,
        "unique_forms": len(freq),
        "hapax_count": len(hapax),
        "freq": freq_table,
        "hapax": hapax,
        "cloud": cloud,
        "by_variable": by_variable,
    }
