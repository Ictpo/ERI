"""ERI (Engine for Reinert Insights) API — FastAPI application and routes."""
from __future__ import annotations

import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import storage
from .errors import AppError, translate_exception
from .jobs import manager
from .nlp.corpus_parse import parse_csv, parse_txt
from .nlp.tokenize import raw_tokens

VERSION = "3.0.0"  # keep equal to the release tag (CLAUDE.md step 7)


from contextlib import asynccontextmanager


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    storage.init_db()
    # Jobs live only in this process, so anything still queued/running was
    # cut off when ERI last stopped (window closed, crash, Ctrl+C). Close it
    # out so the UI shows an error instead of waiting forever.
    storage.fail_interrupted_analyses()
    yield


app = FastAPI(title="ERI: Engine for Reinert Insights — API", version=VERSION, lifespan=_lifespan)
# Only the dev UI (`next dev` on :3000) calls the API cross-origin. The desktop
# exe and the monolith serve UI and API from one origin and need no CORS, and
# a wildcard would let any web page open in the user's browser read or delete
# projects on this local server once it found the port.
DEV_UI_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_UI_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def _app_error(_req: Request, exc: AppError):
    return JSONResponse(status_code=exc.status, content={"error": exc.to_dict()})


@app.exception_handler(Exception)
async def _any_error(_req: Request, exc: Exception):
    err = translate_exception(exc)
    return JSONResponse(status_code=err.status, content={"error": err.to_dict()})


@app.exception_handler(RequestValidationError)
async def _invalid_request(_req: Request, exc: RequestValidationError):
    # FastAPI's default 422 body ({"detail": [...]}) is outside the contract
    # envelope; the UI could only show "Request failed (422)".
    errors = exc.errors()
    first = errors[0] if errors else {}
    field = ".".join(str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path"))
    reason = first.get("msg", "invalid value")
    err = AppError(
        "invalid_request",
        f"Invalid {field}: {reason}." if field else f"Invalid request: {reason}.",
        "Correct the value and try again.",
        422,
    )
    return JSONResponse(status_code=err.status, content={"error": err.to_dict()})


# ---------- schemas ----------

class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""


class DocumentIn(BaseModel):
    id: str | None = None
    text: str
    variables: dict[str, str] = Field(default_factory=dict)


class CorpusIn(BaseModel):
    documents: list[DocumentIn]


class AnalysisIn(BaseModel):
    type: str
    params: dict = Field(default_factory=dict)


class SettingsIn(BaseModel):
    # Every field is optional: a PUT changes only the fields it sends.
    plain_mode: bool | None = None
    export_format: Literal["svg", "png"] | None = None


# Analysis modules (and with them numpy, scipy and networkx) are imported on
# first use, in the worker thread, instead of while the window shows its
# splash. Plain import statements keep them visible to PyInstaller.
def _run_stats(*args, **kwargs):
    from .analysis.stats import run_stats
    return run_stats(*args, **kwargs)


def _run_chd(*args, **kwargs):
    from .analysis.chd import run_chd
    return run_chd(*args, **kwargs)


def _run_similarity(*args, **kwargs):
    from .analysis.similarity import run_similarity
    return run_similarity(*args, **kwargs)


def _run_afc(*args, **kwargs):
    from .analysis.afc import run_afc
    return run_afc(*args, **kwargs)


RUNNERS = {"stats": _run_stats, "chd": _run_chd, "similarity": _run_similarity, "afc": _run_afc}


# ---------- helpers ----------

def _project_or_404(pid: str) -> dict:
    p = storage.get_project(pid)
    if not p:
        raise AppError("not_found", "This project no longer exists.",
                       "It may have been deleted in another session.", 404)
    return p


def _summarize(documents: list[dict]) -> dict:
    n_tokens = 0
    forms: set[str] = set()
    variables: dict[str, set[str]] = {}
    for d in documents:
        toks = raw_tokens(d["text"])
        n_tokens += len(toks)
        forms.update(toks)
        for k, v in d.get("variables", {}).items():
            if v.strip():
                variables.setdefault(k, set()).add(v.strip())
    return {
        "n_documents": len(documents),
        "n_tokens": n_tokens,
        "n_forms": len(forms),
        "variables": [{"name": k, "modalities": sorted(v)} for k, v in sorted(variables.items())],
    }


# ---------- routes ----------

@app.get("/api/health")
def health():
    return {"ok": True, "version": VERSION}


def _settings() -> dict:
    return {
        "plain_mode": storage.get_setting("plain_mode") == "1",
        "export_format": "png" if storage.get_setting("export_format") == "png" else "svg",
    }


@app.get("/api/settings")
def settings_get():
    return _settings()


@app.put("/api/settings")
def settings_put(body: SettingsIn):
    if body.plain_mode is not None:
        storage.set_setting("plain_mode", "1" if body.plain_mode else "0")
    if body.export_format is not None:
        storage.set_setting("export_format", body.export_format)
    return _settings()


@app.get("/api/projects")
def projects_list():
    return storage.list_projects()


@app.post("/api/projects")
def projects_create(body: ProjectIn):
    return storage.create_project(body.name.strip(), body.description.strip())


@app.get("/api/projects/{pid}")
def project_get(pid: str):
    p = _project_or_404(pid)
    corpus = storage.get_corpus(pid)
    return {**p, "corpus_summary": corpus[1] if corpus else None}


@app.delete("/api/projects/{pid}")
def project_delete(pid: str):
    _project_or_404(pid)
    storage.delete_project(pid)
    return {"ok": True}


@app.post("/api/projects/{pid}/corpus/preview")
async def corpus_preview(
    pid: str,
    file: UploadFile = File(...),
    kind: str = Form("txt"),
    text_column: str | None = Form(None),
    encoding: str = Form("utf-8"),
):
    _project_or_404(pid)
    content = await file.read()
    if len(content) > 30 * 1024 * 1024:
        raise AppError("file_too_large", "The file exceeds the 30 MB limit.",
                       "Split the corpus into smaller files.")
    if kind == "csv":
        documents, detected, warnings = parse_csv(content, text_column, encoding)
    else:
        try:
            text = content.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            text = content.decode("latin-1", errors="replace")
        documents, detected, warnings = parse_txt(text)
    if not documents:
        raise AppError("empty_file", "No documents could be read from this file.",
                       "Check the file format: plain text (optionally with '****' markers) or CSV.")
    return {"documents": documents, "detected_variables": detected, "warnings": warnings}


@app.put("/api/projects/{pid}/corpus")
def corpus_save(pid: str, body: CorpusIn):
    _project_or_404(pid)
    documents = []
    for i, d in enumerate(body.documents):
        text = d.text.strip()
        if not text:
            continue
        documents.append({
            "id": d.id or f"doc_{i + 1}",
            "text": text,
            "variables": {k.strip(): v.strip() for k, v in d.variables.items() if k.strip() and v.strip()},
        })
    if not documents:
        raise AppError("empty_corpus", "The corpus contains no non-empty documents.",
                       "Add at least one document with text.")
    summary = _summarize(documents)
    # Lets the UI flag analyses that ran on an earlier version of the corpus.
    summary["saved_at"] = datetime.now(timezone.utc).isoformat()
    storage.save_corpus(pid, documents, summary)
    return summary


@app.get("/api/projects/{pid}/corpus")
def corpus_get(pid: str):
    _project_or_404(pid)
    corpus = storage.get_corpus(pid)
    if not corpus:
        raise AppError("no_corpus", "This project has no corpus yet.",
                       "Upload a corpus in the corpus builder.", 404)
    return {"documents": corpus[0], "summary": corpus[1]}


@app.post("/api/projects/{pid}/analyses")
async def analysis_start(pid: str, body: AnalysisIn):
    _project_or_404(pid)
    if body.type not in RUNNERS:
        raise AppError("unknown_analysis", f"Unknown analysis type '{body.type}'.",
                       f"Valid types: {', '.join(RUNNERS)}.")
    corpus = storage.get_corpus(pid)
    if not corpus:
        raise AppError("no_corpus", "This project has no corpus yet.",
                       "Upload and save a corpus before running an analysis.")
    documents, _ = corpus
    analysis = storage.create_analysis(pid, body.type, body.params)
    doc_texts = [d["text"] for d in documents]
    manager.start(analysis["id"], RUNNERS[body.type], doc_texts, documents, body.params)
    return {"analysis": analysis}


@app.get("/api/projects/{pid}/analyses")
def analyses_list(pid: str):
    _project_or_404(pid)
    return storage.list_analyses(pid)


@app.get("/api/analyses/{aid}")
def analysis_get(aid: str):
    a = storage.get_analysis(aid)
    if not a:
        raise AppError("not_found", "This analysis no longer exists.", None, 404)
    return a


@app.delete("/api/analyses/{aid}")
def analysis_delete(aid: str):
    storage.delete_analysis(aid)
    return {"ok": True}


@app.get("/api/analyses/{aid}/events")
async def analysis_events(aid: str):
    return StreamingResponse(
        manager.sse(aid),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------- static UI (single monolithic server) ----------
# The Next.js static export is served from / when present, so the desktop exe
# (and the monolith run mode) need only this one process. API routes above take precedence.

def _ui_dir() -> Path | None:
    candidates = []
    if os.environ.get("ERI_UI_DIR"):
        candidates.append(Path(os.environ["ERI_UI_DIR"]))
    if hasattr(sys, "_MEIPASS"):  # PyInstaller bundle
        candidates.append(Path(sys._MEIPASS) / "ui")  # type: ignore[attr-defined]
    candidates.append(Path(__file__).resolve().parents[2] / "frontend" / "out")
    for c in candidates:
        if (c / "index.html").is_file():
            return c
    return None


_ui = _ui_dir()
if _ui is not None:
    app.mount("/", StaticFiles(directory=str(_ui), html=True), name="ui")
