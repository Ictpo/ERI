"""Segment × active-form matrices used by all multivariate analyses."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import numpy as np
from scipy import sparse

from ..errors import AppError
from ..nlp.segment import Segment, segment_corpus
from ..nlp.tokenize import TextParams, normalize_tokens

MAX_ACTIVE_FORMS = 3000


@dataclass
class SegmentMatrix:
    X: sparse.csr_array         # (n_segments, n_forms) binary presence matrix (sparse CSR)
    forms: list[str]            # column labels
    form_freq: np.ndarray       # total occurrences per form (across corpus)
    segments: list[Segment]     # rows (only segments with >= 1 active form)
    seg_forms: list[list[str]]  # normalized forms per kept segment
    n_segments_total: int       # before dropping empty segments


def build_segment_matrix(doc_texts: list[str], p: TextParams, seg_size: int = 40) -> SegmentMatrix:
    if not doc_texts:
        raise AppError("empty_corpus", "The corpus has no documents.",
                       "Upload and save a corpus before running an analysis.")
    segments = segment_corpus(doc_texts, seg_size)
    if len(segments) < 2:
        raise AppError("corpus_too_small", "The corpus is too short to segment.",
                       "Provide more text, or reduce the segment size parameter.")

    seg_forms_all = [normalize_tokens(s.tokens, p) for s in segments]
    freq = Counter(f for forms in seg_forms_all for f in forms)
    active = [f for f, c in freq.items() if c >= p.min_freq]
    if not active:
        raise AppError(
            "no_active_forms",
            f"No word appears at least {p.min_freq} times after filtering.",
            "Lower the minimum frequency, disable stop-word removal, or provide more text.",
        )
    if len(active) > MAX_ACTIVE_FORMS:
        active = [f for f, _ in freq.most_common(MAX_ACTIVE_FORMS)]
    active_set = set(active)
    col = {f: j for j, f in enumerate(active)}

    kept_segments: list[Segment] = []
    kept_forms: list[list[str]] = []
    # Build the CSR arrays directly. The matrix is binary and almost all
    # zeros; a dense float64 copy is n_segments x 3000 x 8 bytes (gigabytes
    # for a corpus near the 30 MB upload limit).
    indices: list[int] = []
    indptr = [0]
    for seg, forms in zip(segments, seg_forms_all):
        present = sorted({col[f] for f in forms if f in active_set})
        if not present:
            continue
        indices.extend(present)
        indptr.append(len(indices))
        kept_segments.append(seg)
        kept_forms.append([f for f in forms if f in active_set])

    if len(kept_segments) < 2:
        raise AppError("corpus_too_small", "Fewer than two usable text segments were found.",
                       "Provide more text or lower the minimum frequency.")

    X = sparse.csr_array(
        (np.ones(len(indices)), np.array(indices, dtype=np.int64), np.array(indptr, dtype=np.int64)),
        shape=(len(kept_segments), len(active)),
    )
    form_freq = np.array([freq[f] for f in active], dtype=np.float64)
    return SegmentMatrix(X, active, form_freq, kept_segments, kept_forms, len(segments))
