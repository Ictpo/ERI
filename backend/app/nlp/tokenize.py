"""Tokenization + lemmatization.

Lemmatization uses simplemma (pure-Python, dictionary-based) which covers
en/pt/fr/es without heavyweight model downloads. If simplemma is unavailable
for a token, the surface form is kept.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .stopwords import stopwords_for

try:
    import simplemma

    def _lemma(token: str, lang: str) -> str:
        try:
            return simplemma.lemmatize(token, lang=lang)
        except Exception:
            return token
except ImportError:  # pragma: no cover
    def _lemma(token: str, lang: str) -> str:
        return token

SUPPORTED_LANGS = ("en", "pt", "fr", "es")

# Words: letter/underscore sequences (incl. accented), allowing internal
# apostrophes/hyphens. Underscores are preserved so users can protect
# compound forms ("dia_a_dia") and lemma-locked words ("havaianas_"),
# matching the classic Iramuteq convention.
_WORD_RE = re.compile(r"[^\W\d]+(?:['’_-][^\W\d]+)*", re.UNICODE)


@dataclass
class TextParams:
    lang: str = "en"
    lemmatize: bool = True
    remove_stopwords: bool = True
    custom_stopwords: list[str] = field(default_factory=list)
    min_freq: int = 3

    @classmethod
    def from_dict(cls, d: dict) -> "TextParams":
        lang = str(d.get("lang", "en")).lower()
        if lang not in SUPPORTED_LANGS:
            lang = "en"
        return cls(
            lang=lang,
            lemmatize=bool(d.get("lemmatize", True)),
            remove_stopwords=bool(d.get("remove_stopwords", True)),
            custom_stopwords=[str(w) for w in d.get("custom_stopwords", []) or []],
            min_freq=max(1, int(d.get("min_freq", 3) or 1)),
        )


def raw_tokens(text: str) -> list[str]:
    return [m.group(0).lower().replace("’", "'") for m in _WORD_RE.finditer(text)]


def normalize_tokens(tokens: list[str], p: TextParams) -> list[str]:
    """Lowercased word tokens -> analysis forms (lemmas, stopwords removed)."""
    sw = stopwords_for(p.lang, p.custom_stopwords) if p.remove_stopwords else stopwords_for("", p.custom_stopwords)
    out = []
    for t in tokens:
        if t in sw:
            continue
        # Underscored tokens are user-protected: never lemmatized.
        form = t if "_" in t else (_lemma(t, p.lang) if p.lemmatize else t)
        form = form.lower()
        if form in sw or len(form) < 2:
            continue
        out.append(form)
    return out


def tokenize(text: str, p: TextParams) -> list[str]:
    return normalize_tokens(raw_tokens(text), p)
