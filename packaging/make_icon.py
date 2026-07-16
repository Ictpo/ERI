"""Build packaging/eri.ico from ICON.png with the format Windows expects:
BMP (uncompressed BGRA + AND mask) for sizes up to 128, PNG only for 256.

Pillow writes every size as PNG, which some Windows shell surfaces (small
icon view, the details/preview pane) fail to decode and fall back to a
generic icon. Storing the small sizes as BMP fixes that across all Windows
versions and contexts.
"""
from __future__ import annotations

import io
import struct
import sys
from pathlib import Path

from PIL import Image

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"C:\Users\vrpra\Desktop\ICON.png")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).with_name("eri.ico")

BMP_SIZES = [16, 24, 32, 48, 64, 128]
PNG_SIZES = [256]


def bmp_blob(img: Image.Image, n: int) -> bytes:
    """BITMAPINFOHEADER + 32bpp bottom-up BGRA + 1bpp AND mask."""
    im = img.resize((n, n), Image.LANCZOS).convert("RGBA")
    px = im.load()
    header = struct.pack(
        "<IiiHHIIiiII",
        40,      # biSize
        n,       # biWidth
        n * 2,   # biHeight (colour + mask)
        1,       # biPlanes
        32,      # biBitCount
        0,       # biCompression BI_RGB
        0,       # biSizeImage
        0, 0,    # resolution
        0, 0,    # palette
    )
    # XOR (colour) data, bottom-up, BGRA
    xor = bytearray()
    for y in range(n - 1, -1, -1):
        for x in range(n):
            r, g, b, a = px[x, y]
            xor += bytes((b, g, r, a))
    # AND mask: 1bpp, rows padded to 32-bit; all opaque (alpha carries transparency)
    row_bytes = ((n + 31) // 32) * 4
    and_mask = bytes(row_bytes * n)
    return header + bytes(xor) + and_mask


def png_blob(img: Image.Image, n: int) -> bytes:
    buf = io.BytesIO()
    img.resize((n, n), Image.LANCZOS).convert("RGBA").save(buf, format="PNG")
    return buf.getvalue()


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    entries: list[tuple[int, bytes]] = []
    for n in BMP_SIZES:
        entries.append((n, bmp_blob(src, n)))
    for n in PNG_SIZES:
        entries.append((n, png_blob(src, n)))

    count = len(entries)
    header = struct.pack("<HHH", 0, 1, count)  # reserved, type=icon, count
    offset = 6 + 16 * count
    dir_entries = bytearray()
    data = bytearray()
    for n, blob in entries:
        b = n if n < 256 else 0
        dir_entries += struct.pack(
            "<BBBBHHII",
            b, b,          # width, height (0 == 256)
            0, 0,          # colours, reserved
            1, 32,         # planes, bitcount
            len(blob),     # bytes in resource
            offset,        # offset
        )
        data += blob
        offset += len(blob)

    OUT.write_bytes(header + bytes(dir_entries) + bytes(data))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes): "
          f"BMP {BMP_SIZES} + PNG {PNG_SIZES}")


if __name__ == "__main__":
    main()
