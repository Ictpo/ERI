"""Segmentation of documents into Elementary Context Units (UCE / text segments).

Sentences are packed into segments of roughly `seg_size` word tokens, always
cutting at sentence boundaries when possible (Reinert-style segments).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .tokenize import raw_tokens

_SENT_RE = re.compile(r"[^.!?\n;]+[.!?\n;]*", re.UNICODE)


@dataclass
class Segment:
    doc_index: int
    text: str
    tokens: list[str]  # raw lowercase word tokens (pre-normalization)


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENT_RE.findall(text) if s.strip()]


def segment_document(text: str, doc_index: int, seg_size: int = 40) -> list[Segment]:
    segments: list[Segment] = []
    buf_texts: list[str] = []
    buf_tokens: list[str] = []

    def flush():
        if buf_tokens:
            segments.append(Segment(doc_index, " ".join(buf_texts), list(buf_tokens)))
            buf_texts.clear()
            buf_tokens.clear()

    for sent in split_sentences(text):
        toks = raw_tokens(sent)
        if not toks:
            continue
        # A single very long sentence gets hard-split.
        if len(toks) > int(seg_size * 1.6):
            flush()
            words = sent.split()
            step = max(1, len(words) * seg_size // max(1, len(toks)))
            for i in range(0, len(words), step):
                chunk = " ".join(words[i : i + step])
                ctoks = raw_tokens(chunk)
                if ctoks:
                    segments.append(Segment(doc_index, chunk, ctoks))
            continue
        if buf_tokens and len(buf_tokens) + len(toks) > seg_size:
            flush()
        buf_texts.append(sent)
        buf_tokens.extend(toks)
        if len(buf_tokens) >= seg_size:
            flush()
    flush()
    return segments


def segment_corpus(doc_texts: list[str], seg_size: int = 40) -> list[Segment]:
    out: list[Segment] = []
    for i, text in enumerate(doc_texts):
        out.extend(segment_document(text, i, seg_size))
    return out
