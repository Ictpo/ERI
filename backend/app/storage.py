"""SQLite persistence for projects, corpora and analyses (multi-user ready:
all state is server-side; any number of browsers can work concurrently)."""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone

DB_PATH = os.environ.get("IRAMUTEQ_DB", os.path.join(os.path.dirname(__file__), "..", "data", "iramuteq.db"))


_initialized: set[str] = set()


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    if DB_PATH not in _initialized:
        _initialized.add(DB_PATH)
        _create_tables(con)
    return con


def init_db() -> None:
    with _connect() as con:
        _create_tables(con)


def _create_tables(con: sqlite3.Connection) -> None:
    con.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS corpora (
            project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
            documents TEXT NOT NULL, summary TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS analyses (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            type TEXT NOT NULL, params TEXT NOT NULL,
            status TEXT NOT NULL, error TEXT, result TEXT,
            created_at TEXT NOT NULL, finished_at TEXT
        );
        """)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


# ---- projects ----

def create_project(name: str, description: str = "") -> dict:
    row = {"id": _new_id(), "name": name, "description": description, "created_at": _now()}
    with _connect() as con:
        con.execute("INSERT INTO projects VALUES (:id,:name,:description,:created_at)", row)
    return row


def list_projects() -> list[dict]:
    with _connect() as con:
        return [dict(r) for r in con.execute("SELECT * FROM projects ORDER BY created_at DESC")]


def get_project(pid: str) -> dict | None:
    with _connect() as con:
        r = con.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        return dict(r) if r else None


def delete_project(pid: str) -> None:
    with _connect() as con:
        con.execute("PRAGMA foreign_keys=ON")
        con.execute("DELETE FROM projects WHERE id=?", (pid,))


# ---- corpus ----

def save_corpus(pid: str, documents: list[dict], summary: dict) -> None:
    with _connect() as con:
        con.execute(
            "INSERT INTO corpora (project_id, documents, summary) VALUES (?,?,?) "
            "ON CONFLICT(project_id) DO UPDATE SET documents=excluded.documents, summary=excluded.summary",
            (pid, json.dumps(documents, ensure_ascii=False), json.dumps(summary, ensure_ascii=False)),
        )


def get_corpus(pid: str) -> tuple[list[dict], dict] | None:
    with _connect() as con:
        r = con.execute("SELECT documents, summary FROM corpora WHERE project_id=?", (pid,)).fetchone()
        return (json.loads(r["documents"]), json.loads(r["summary"])) if r else None


# ---- analyses ----

def create_analysis(pid: str, atype: str, params: dict) -> dict:
    a = {
        "id": _new_id(), "project_id": pid, "type": atype,
        "params": params, "status": "queued", "error": None, "result": None,
        "created_at": _now(), "finished_at": None,
    }
    with _connect() as con:
        con.execute(
            "INSERT INTO analyses (id,project_id,type,params,status,created_at) VALUES (?,?,?,?,?,?)",
            (a["id"], pid, atype, json.dumps(params, ensure_ascii=False), "queued", a["created_at"]),
        )
    return a


def update_analysis(aid: str, status: str, error: dict | None = None, result: dict | None = None) -> None:
    finished = _now() if status in ("done", "error") else None
    with _connect() as con:
        con.execute(
            "UPDATE analyses SET status=?, error=?, result=?, finished_at=COALESCE(?, finished_at) WHERE id=?",
            (status,
             json.dumps(error, ensure_ascii=False) if error else None,
             json.dumps(result, ensure_ascii=False) if result else None,
             finished, aid),
        )


def get_analysis(aid: str, include_result: bool = True) -> dict | None:
    with _connect() as con:
        r = con.execute("SELECT * FROM analyses WHERE id=?", (aid,)).fetchone()
    if not r:
        return None
    d = dict(r)
    d["params"] = json.loads(d["params"])
    d["error"] = json.loads(d["error"]) if d["error"] else None
    d["result"] = json.loads(d["result"]) if (include_result and d["result"]) else None
    return d


def list_analyses(pid: str) -> list[dict]:
    with _connect() as con:
        rows = con.execute(
            "SELECT id,project_id,type,params,status,error,created_at,finished_at "
            "FROM analyses WHERE project_id=? ORDER BY created_at DESC", (pid,)
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["params"] = json.loads(d["params"])
        d["error"] = json.loads(d["error"]) if d["error"] else None
        d["result"] = None
        out.append(d)
    return out


def delete_analysis(aid: str) -> None:
    with _connect() as con:
        con.execute("DELETE FROM analyses WHERE id=?", (aid,))
