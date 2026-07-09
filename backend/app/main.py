"""ERI (Engine for Reinert Insights) API — FastAPI application and routes."""
from __future__ import annotations

import os
import sys
from collections import Counter
from pathlib import Path

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import storage
from .analysis.afc import run_afc
from .analysis.chd import run_chd
from .analysis.similarity import run_similarity
from .analysis.stats import run_stats
from .errors import AppError, translate_exception
from .jobs import manager
from .nlp.corpus_parse import parse_csv, parse_txt
from .nlp.tokenize import raw_tokens

VERSION = "1.0.0"


from contextlib import asynccontextmanager


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    storage.init_db()
    yield


app = FastAPI(title="ERI: Engine for Reinert Insights — API", version=VERSION, lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


RUNNERS = {"stats": run_stats, "chd": run_chd, "similarity": run_similarity, "afc": run_afc}


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
# The Next.js static export is served from / when present, so Docker and the
# desktop exe need only this one process. API routes above take precedence.

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
