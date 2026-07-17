"""Obfuscate Erine's original painting so the raw artwork isn't a browsable
file in the public repo.

HONEST SCOPE: this is obfuscation, not real encryption. The About window must
display the image, so the running app necessarily holds the decoded bytes and
a determined person could extract them. What this DOES achieve, and all it
claims to: there is no `eri-fox.jpg` sitting in the repo for someone to
one-click download — only an opaque `eri-art.bin` that means nothing on its
own. The key lives in the frontend, by necessity.

Regenerate from the source painting:
  python packaging/encode_art.py <path-to-eri-fox.jpg>
"""
from __future__ import annotations

import sys
from pathlib import Path

# Keep in sync with frontend/lib/fox-art.ts
KEY = b"eri-fox-erine-chen-bi-ting-2026-mousing"

HERE = Path(__file__).resolve().parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / "eri-fox.jpg"
OUT = HERE.parent / "frontend" / "public" / "eri-art.bin"


def xor(data: bytes, key: bytes) -> bytes:
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


def main() -> None:
    raw = SRC.read_bytes()
    OUT.write_bytes(xor(raw, KEY))
    print(f"encoded {SRC.name} ({len(raw)} B) -> {OUT.relative_to(HERE.parent)} "
          f"({OUT.stat().st_size} B, obfuscated)")


if __name__ == "__main__":
    main()
