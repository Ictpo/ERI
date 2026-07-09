"""ERI desktop launcher: starts the bundled server and opens the browser.

This is the PyInstaller entry point. It picks a free port, stores the
database under %LOCALAPPDATA%\\ERI, launches uvicorn, and opens the UI.
"""
from __future__ import annotations

import os
import socket
import sys
import threading
import webbrowser


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    appdata = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    data_dir = os.path.join(appdata, "ERI")
    os.makedirs(data_dir, exist_ok=True)
    os.environ.setdefault("IRAMUTEQ_DB", os.path.join(data_dir, "eri.db"))

    port = _free_port()
    url = f"http://127.0.0.1:{port}/"

    print("=" * 56)
    print("  ERI: Engine for Reinert Insights")
    print(f"  Running at {url}")
    print(f"  Data stored in {data_dir}")
    print("  Keep this window open while you work.")
    print("  Press Ctrl+C to quit.")
    print("=" * 56, flush=True)

    threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    import uvicorn

    from app.main import app

    try:
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
    except KeyboardInterrupt:
        pass
    sys.exit(0)


if __name__ == "__main__":
    main()
