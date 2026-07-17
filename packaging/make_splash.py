"""Build packaging/eri-splash.png — the image PyInstaller shows while the
onefile bundle unpacks (10-30 s with no feedback otherwise).

Dark ink base + the fox mark + wordmark, per the identity's "neon on dark"
rule. Regenerate with:  python packaging/make_splash.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ICON = HERE / "brand" / "eri-icon-256.png"
OUT = HERE / "eri-splash.png"

W, H = 460, 260
INK = (12, 7, 9)          # #0C0709 identity Ink Black
TEXT = (243, 233, 228)    # #F3E9E4
MUTED = (140, 122, 114)   # #8C7A72
ROSE = (214, 38, 111)     # #D6266F
CORAL = (240, 112, 74)    # #F0704A
AMBER = (244, 166, 63)    # #F4A63F


def font(size: int, bold: bool = False):
    for name in (
        "seguisb.ttf" if bold else "segoeui.ttf",
        "arialbd.ttf" if bold else "arial.ttf",
    ):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    img = Image.new("RGBA", (W, H), INK + (255,))
    d = ImageDraw.Draw(img)

    icon = Image.open(ICON).convert("RGBA").resize((104, 104), Image.LANCZOS)
    img.paste(icon, (40, 60), icon)

    d.text((168, 74), "Eri", font=font(44, True), fill=TEXT)
    d.text((170, 128), "Hear the pattern beneath the noise.",
           font=font(13), fill=MUTED)
    d.text((170, 152), "Starting…", font=font(13), fill=TEXT)

    # "The Pounce" gradient rule — a moment, not a wallpaper.
    y0, y1, x0, x1 = 196, 200, 40, W - 40
    span = x1 - x0
    for i in range(span):
        t = i / max(1, span - 1)
        if t < 0.55:
            u = t / 0.55
            c = tuple(round(a + (b - a) * u) for a, b in zip(ROSE, CORAL))
        else:
            u = (t - 0.55) / 0.45
            c = tuple(round(a + (b - a) * u) for a, b in zip(CORAL, AMBER))
        d.rectangle([x0 + i, y0, x0 + i + 1, y1], fill=c + (255,))

    d.text((40, 216), "This first run unpacks the app — it can take a few seconds.",
           font=font(11), fill=MUTED)

    img.convert("RGB").save(OUT)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {W}x{H})")


if __name__ == "__main__":
    main()
