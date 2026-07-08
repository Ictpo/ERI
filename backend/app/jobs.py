"""In-process async job manager with SSE progress streaming.

Heavy computations run in a thread pool so the event loop (and the UI)
never blocks; progress updates are pushed to any number of SSE subscribers.
"""
from __future__ import annotations

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable

from . import storage
from .errors import translate_exception

_executor = ThreadPoolExecutor(max_workers=4)


@dataclass
class JobState:
    status: str = "queued"          # queued | running | done | error
    progress: float = 0.0
    stage: str = "Queued"
    message: str = ""
    version: int = 0                # bumped on every update
    event: asyncio.Event = field(default_factory=asyncio.Event)

    def snapshot(self) -> dict:
        return {"status": self.status, "progress": round(self.progress, 3),
                "stage": self.stage, "message": self.message}


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, JobState] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def _get(self, aid: str) -> JobState | None:
        return self._jobs.get(aid)

    def _update(self, aid: str, **kw) -> None:
        job = self._jobs.get(aid)
        if not job:
            return
        for k, v in kw.items():
            setattr(job, k, v)
        job.version += 1
        loop = self._loop
        if loop and loop.is_running():
            loop.call_soon_threadsafe(job.event.set)

    def start(self, aid: str, fn: Callable[..., dict], *args) -> None:
        """Run `fn(*args, progress=cb)` in the thread pool for analysis `aid`."""
        self._loop = asyncio.get_running_loop()
        self._jobs[aid] = JobState()

        def progress(frac: float, stage: str) -> None:
            self._update(aid, status="running", progress=max(0.0, min(1.0, frac)),
                         stage=stage, message=stage)

        def work() -> None:
            try:
                self._update(aid, status="running", stage="Starting", progress=0.01)
                storage.update_analysis(aid, "running")
                result = fn(*args, progress=progress)
                storage.update_analysis(aid, "done", result=result)
                self._update(aid, status="done", progress=1.0,
                             stage="Finished", message="Analysis complete")
            except Exception as exc:  # noqa: BLE001 — translated for the UI
                err = translate_exception(exc)
                storage.update_analysis(aid, "error", error=err.to_dict())
                self._update(aid, status="error", stage="Failed", message=err.message)

        self._loop.run_in_executor(_executor, work)

    async def sse(self, aid: str):
        """Async generator yielding SSE frames until the job is terminal."""
        job = self._get(aid)
        if job is None:
            # Job not in memory (e.g. server restarted) — emit the DB state once.
            a = storage.get_analysis(aid, include_result=False)
            state = {
                "status": a["status"] if a else "error",
                "progress": 1.0 if a and a["status"] == "done" else 0.0,
                "stage": "Finished" if a and a["status"] == "done" else "Unavailable",
                "message": (a["error"]["message"] if a and a["error"] else ""),
            }
            yield f"data: {json.dumps(state)}\n\n"
            return

        last_version = -1
        while True:
            if job.version != last_version:
                last_version = job.version
                yield f"data: {json.dumps(job.snapshot())}\n\n"
                if job.status in ("done", "error"):
                    return
            job.event.clear()
            try:
                await asyncio.wait_for(job.event.wait(), timeout=10.0)
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"


manager = JobManager()
