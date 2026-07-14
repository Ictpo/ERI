"""ERI desktop launcher: native window (pywebview) over a local FastAPI server.

This is the PyInstaller entry point. It picks a free port, stores the
database under the per-OS app-data directory, starts uvicorn on a background
thread, and opens the UI in a native desktop window. Closing the window
shuts the server down and exits — no hidden processes remain.

Environment switches (used by CI and debugging):
  ERI_HEADLESS=1   run the server without a window (blocks until Ctrl+C)
  ERI_PORT_FILE=p  write the chosen port number to file `p` once listening
"""
from __future__ import annotations

import os
import socket
import sys
import threading
import time


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _data_dir() -> str:
    home = os.path.expanduser("~")
    if os.name == "nt":
        return os.path.join(os.environ.get("LOCALAPPDATA") or home, "ERI")
    if sys.platform == "darwin":
        return os.path.join(home, "Library", "Application Support", "ERI")
    return os.path.join(
        os.environ.get("XDG_DATA_HOME") or os.path.join(home, ".local", "share"),
        "ERI",
    )


def _ensure_streams(data_dir: str) -> None:
    """In windowed (no-console) builds sys.stdout/stderr are None, which
    crashes uvicorn's logging and swallows tracebacks. Route them to a
    log file next to the database instead."""
    if sys.stdout is not None and sys.stderr is not None:
        return
    log = open(
        os.path.join(data_dir, "eri.log"),
        "a",
        buffering=1,
        encoding="utf-8",
        errors="replace",
    )
    if sys.stdout is None:
        sys.stdout = log
    if sys.stderr is None:
        sys.stderr = log


def main() -> None:
    data_dir = _data_dir()
    os.makedirs(data_dir, exist_ok=True)
    _ensure_streams(data_dir)
    os.environ.setdefault("IRAMUTEQ_DB", os.path.join(data_dir, "eri.db"))

    port = _free_port()
    url = f"http://127.0.0.1:{port}/"

    import uvicorn

    from app.main import app

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)

    def _notify_port() -> None:
        port_file = os.environ.get("ERI_PORT_FILE")
        if port_file:
            with open(port_file, "w", encoding="utf-8") as f:
                f.write(str(port))

    if os.environ.get("ERI_HEADLESS") == "1":
        # CI / debug mode: no window, serve in the foreground.
        threading.Timer(1.0, _notify_port).start()
        print(f"ERI (headless) running at {url}", flush=True)
        try:
            server.run()
        except KeyboardInterrupt:
            pass
        sys.exit(0)

    # Native-window mode: server on a daemon thread, window on the main thread.
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(200):  # wait up to ~20 s for the server to come up
        if server.started:
            break
        time.sleep(0.1)
    _notify_port()

    import webview

    webview.create_window(
        "ERI: Engine for Reinert Insights",
        url,
        width=1200,
        height=800,
        min_size=(900, 600),
    )
    webview.start()

    # Window closed: shut the server down gracefully so nothing lingers.
    server.should_exit = True
    thread.join(timeout=5)
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 — last-resort crash log for windowed builds
        import traceback

        traceback.print_exc()
        sys.exit(1)
