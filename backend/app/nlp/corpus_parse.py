"""Corpus file parsing: legacy Iramuteq TXT format and CSV tables.

Legacy TXT: documents introduced by lines starting with `****`, with starred
variable tags in the form `*variable_modality` on the same line, e.g.:

    **** *sex_f *age_young
    Text of the first document...

TXT without `****` markers falls back to splitting on blank-line groups.
"""
from __future__ import annotations

import csv
import io
import re

from ..errors import AppError

_STAR_LINE = re.compile(r"^\s*\*{4}")
_TAG = re.compile(r"\*([^\s*]+)")
_CSV_SEPARATORS = (",", ";", "\t")


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
    # Strip a leading UTF-8 BOM: Windows editors (Notepad, Excel) often save it,
    # and it would push the first '****' marker off column 0, silently dropping
    # the first document.
    content = content.lstrip("\ufeff")
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


def _column_names(header: list[str]) -> list[str]:
    """Header cells as column names. Blank ones become 'Unnamed: i' and
    repeats get '.1', '.2' suffixes (the names pandas gave them), so two
    columns with one name no longer overwrite each other."""
    names: list[str] = []
    for i, cell in enumerate(header):
        base = cell or f"Unnamed: {i}"
        name, dup = base, 0
        while name in names:
            dup += 1
            name = f"{base}.{dup}"
        names.append(name)
    return names


def _detect_separator(text: str) -> str:
    """Pick the CSV separator (',', ';' or tab) from the header record.

    Excel in pt-BR (and fr/es) locales saves "CSV" with ';', because ',' is
    the decimal separator there. Column names rarely contain a separator, so
    the header row decides; a single-column file or a tie falls back to ','.
    """
    counts = dict.fromkeys(_CSV_SEPARATORS, 0)
    in_quotes = False
    for ch in text[:65536]:
        if ch == '"':
            in_quotes = not in_quotes
        elif not in_quotes:
            if ch in "\r\n":
                break
            if ch in counts:
                counts[ch] += 1
    best = max(_CSV_SEPARATORS, key=counts.__getitem__)
    return best if counts[best] else ","


def parse_csv(content: bytes, text_column: str | None, encoding: str = "utf-8") -> tuple[list[dict], list[str], list[str]]:
    warnings: list[str] = []
    # utf-8-sig transparently strips a UTF-8 BOM (common in Excel/Windows CSV
    # exports); without it the first column name gets a hidden BOM prefix.
    if encoding.lower().replace("-", "") in ("utf8", "utf8sig"):
        encoding = "utf-8-sig"
    try:
        decoded = content.decode(encoding)
    except UnicodeDecodeError:
        decoded = content.decode("latin-1")
        warnings.append("File was not valid UTF-8; decoded as Latin-1 instead.")
    # A whole interview in one cell can exceed csv's default 128 KB field limit.
    csv.field_size_limit(max(csv.field_size_limit(), len(decoded) + 1))
    sep = _detect_separator(decoded)
    try:
        rows = [row for row in csv.reader(io.StringIO(decoded, newline=""), delimiter=sep) if row]
    except csv.Error as exc:
        raise AppError("csv_unreadable", f"The CSV file could not be read ({exc}).",
                       "Save it again from your spreadsheet as CSV (comma- or semicolon-separated).") from exc
    if len(rows) < 2:
        return [], [], ["The CSV file has no rows."]
    columns = _column_names(rows[0])
    data: list[list[str]] = []
    for number, row in enumerate(rows[1:], start=1):
        if len(row) > len(columns):
            raise AppError(
                "csv_malformed",
                f"Row {number} of the CSV has {len(row)} fields but the header has {len(columns)}.",
                f"Check that every row uses the header's separator ({'tab' if sep == chr(9) else repr(sep)}) "
                "and that text containing it is in quotes.",
            )
        data.append(row + [""] * (len(columns) - len(row)))  # short rows: empty cells
    col = {c: i for i, c in enumerate(columns)}

    if text_column is None or text_column not in col:
        # Heuristic: the column with the longest average cell content.
        text_column = max(columns, key=lambda c: sum(len(r[col[c]]) for r in data) / len(data))
        warnings.append(f"No text column specified; using '{text_column}' (longest average content).")

    var_cols = [c for c in columns if c != text_column]
    documents = []
    skipped = 0
    for row in data:
        text = row[col[text_column]].strip()
        if not text:
            skipped += 1
            continue
        documents.append({
            "text": text,
            "variables": {c: row[col[c]].strip() for c in var_cols if row[col[c]].strip()},
        })
    if skipped:
        warnings.append(f"{skipped} row(s) with an empty text cell were skipped.")
    return documents, var_cols, warnings
