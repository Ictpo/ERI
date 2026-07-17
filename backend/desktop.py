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


class SaveApi:
    """Native save bridge exposed to the page as ``window.pywebview.api``.

    WebView2's own blob download uses an "All files" Save dialog, so if the
    user retypes the name without an extension the file lands formatless.
    Routing exports through here lets us present a typed Save dialog AND
    re-append the correct extension if it's missing — the file can never be
    saved without its type.
    """

    def _ask_path(self, name: str, file_types: tuple[str, ...]) -> str | None:
        """Open the native Save dialog; return the chosen path or None.
        Split out so the extension logic can be tested without a GUI.

        The window is fetched live (never stored on this object): holding the
        pywebview Window as an attribute makes pywebview try to serialize the
        native window when it introspects the js_api, which recurses forever
        through the WinForms/WebView2 COM objects."""
        import webview

        win = webview.active_window() or (webview.windows[0] if webview.windows else None)
        if win is None:
            return None
        result = win.create_file_dialog(
            webview.SAVE_DIALOG, save_filename=name, file_types=file_types
        )
        if not result:
            return None
        return result[0] if isinstance(result, (list, tuple)) else result

    def save_file(self, name: str, data_b64: str, ext: str) -> bool:
        import base64

        ext = (ext or "").lstrip(".").lower()
        try:
            raw = base64.b64decode(data_b64)
        except Exception:
            return False
        if ext and not name.lower().endswith("." + ext):
            name = f"{name}.{ext}"
        file_types = []
        if ext:
            file_types.append(f"{ext.upper()} file (*.{ext})")
        file_types.append("All files (*.*)")

        path = self._ask_path(name, tuple(file_types))
        if not path:
            return False  # user cancelled
        if ext and not path.lower().endswith("." + ext):
            path = f"{path}.{ext}"  # enforce the extension no matter what
        try:
            with open(path, "wb") as f:
                f.write(raw)
        except Exception:
            return False
        return True


def main() -> None:
    data_dir = _data_dir()
    os.makedirs(data_dir, exist_ok=True)
    _ensure_streams(data_dir)
    os.environ.setdefault("IRAMUTEQ_DB", os.path.join(data_dir, "eri.db"))

    port = _free_port()
    url = f"http://127.0.0.1:{port}/"

    def _notify_port() -> None:
        port_file = os.environ.get("ERI_PORT_FILE")
        if port_file:
            with open(port_file, "w", encoding="utf-8") as f:
                f.write(str(port))

    if os.environ.get("ERI_HEADLESS") == "1":
        # CI / debug mode: no window, serve in the foreground.
        import uvicorn

        from app.main import app

        config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
        server = uvicorn.Server(config)
        threading.Timer(1.0, _notify_port).start()
        print(f"ERI (headless) running at {url}", flush=True)
        try:
            server.run()
        except KeyboardInterrupt:
            pass
        sys.exit(0)

    # Native-window mode. The window opens immediately on the animated "pounce"
    # splash (identity §09); a background worker does the slow work (importing
    # numpy/scipy, starting the server) WHILE that animation plays, then swaps
    # the window to the real app. There is no PyInstaller unpack splash, so the
    # first visible thing is always this animated window.
    import webview

    from app.splash import SPLASH_HTML

    # pywebview silently blocks file downloads unless this is enabled —
    # without it every SVG/PNG export button in the app does nothing.
    webview.settings["ALLOW_DOWNLOADS"] = True

    save_api = SaveApi()

    window = webview.create_window(
        "ERI — Hear the pattern beneath the noise",
        html=SPLASH_HTML,
        width=1200,
        height=800,
        min_size=(900, 600),
        js_api=save_api,
    )

    state: dict[str, object] = {}

    def _startup() -> None:
        # Runs after the GUI loop is up, so the animated splash is already
        # on screen; do the heavy lifting behind it.
        import uvicorn

        from app.main import app

        config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
        server = uvicorn.Server(config)
        state["server"] = server
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        state["thread"] = thread
        for _ in range(600):  # wait up to ~60 s for the server to come up
            if server.started:
                break
            time.sleep(0.1)
        _notify_port()
        # Let the pounce breathe for a beat so it never just flickers past.
        time.sleep(0.6)
        try:
            window.load_url(url)
        except Exception:
            pass

    webview.start(_startup)

    # Window closed: shut the server down gracefully so nothing lingers.
    server = state.get("server")
    if server is not None:
        server.should_exit = True  # type: ignore[attr-defined]
    thread = state.get("thread")
    if thread is not None:
        thread.join(timeout=5)  # type: ignore[union-attr]
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 — last-resort crash log for windowed builds
        import traceback

        traceback.print_exc()
        sys.exit(1)
