"""Corpus file parsing: legacy Iramuteq TXT format and CSV tables.

Legacy TXT: documents introduced by lines starting with `****`, with starred
variable tags in the form `*variable_modality` on the same line, e.g.:

    **** *sex_f *age_young
    Text of the first document...

TXT without `****` markers falls back to splitting on blank-line groups.
"""
from __future__ import annotations

import io
import re

import pandas as pd

_STAR_LINE = re.compile(r"^\s*\*{4}")
_TAG = re.compile(r"\*([^\s*]+)")


def _parse_tags(line: str) -> dict[str, str]:
    variables: dict[str, str] = {}
    for raw in _TAG.findall(line.replace("****", "", 1)):
        if "_" in raw:
            name, _, mod = raw.partition("_")
        else:
            name, mod = raw, "yes"
        if name:
            variables[name.strip()] = mod.strip() or "yes"
    return variables


def parse_txt(content: str) -> tuple[list[dict], list[str], list[str]]:
    """Returns (documents, detected_variables, warnings)."""
    warnings: list[str] = []
    lines = content.splitlines()
    has_markers = any(_STAR_LINE.match(l) for l in lines)
    documents: list[dict] = []

    if has_markers:
        current_vars: dict[str, str] | None = None
        current_text: list[str] = []

        def flush():
            nonlocal current_vars
            if current_vars is not None:
                text = "\n".join(current_text).strip()
                if text:
                    documents.append({"text": text, "variables": current_vars})
                else:
                    warnings.append("A '****' marker with no following text was skipped.")
            current_vars = None
            current_text.clear()

        preamble_seen = False
        for line in lines:
            if _STAR_LINE.match(line):
                flush()
                current_vars = _parse_tags(line)
            elif current_vars is not None:
                current_text.append(line)
            elif line.strip():
                preamble_seen = True
        flush()
        if preamble_seen:
            warnings.append("Text before the first '****' marker was ignored.")
    else:
        for block in re.split(r"\n\s*\n", content):
            text = block.strip()
            if text:
                documents.append({"text": text, "variables": {}})
        if len(documents) > 1:
            warnings.append(
                "No '****' document markers found; the file was split into "
                f"{len(documents)} documents at blank lines."
            )

    detected = sorted({v for d in documents for v in d["variables"]})
    if not documents:
        warnings.append("No documents could be extracted from the file.")
    return documents, detected, warnings


def parse_csv(content: bytes, text_column: str | None, encoding: str = "utf-8") -> tuple[list[dict], list[str], list[str]]:
    warnings: list[str] = []
    try:
        df = pd.read_csv(io.BytesIO(content), encoding=encoding, dtype=str, keep_default_na=False)
    except UnicodeDecodeError:
        df = pd.read_csv(io.BytesIO(content), encoding="latin-1", dtype=str, keep_default_na=False)
        warnings.append("File was not valid UTF-8; decoded as Latin-1 instead.")
    if df.empty or not len(df.columns):
        return [], [], ["The CSV file has no rows."]

    if text_column is None or text_column not in df.columns:
        # Heuristic: the column with the longest average cell content.
        text_column = max(df.columns, key=lambda c: df[c].astype(str).str.len().mean())
        warnings.append(f"No text column specified; using '{text_column}' (longest average content).")

    var_cols = [c for c in df.columns if c != text_column]
    documents = []
    skipped = 0
    for _, row in df.iterrows():
        text = str(row[text_column]).strip()
        if not text:
            skipped += 1
            continue
        documents.append({
            "text": text,
            "variables": {c: str(row[c]).strip() for c in var_cols if str(row[c]).strip()},
        })
    if skipped:
        warnings.append(f"{skipped} row(s) with an empty text cell were skipped.")
    return documents, var_cols, warnings
