"""Generate backend/app/splash.py — the animated 'pounce' loading screen shown
in the pywebview window while the server starts (BRANDING.md / identity §09).

Self-contained HTML+CSS (fox mark embedded as a data URI), so it needs no
files at runtime. Regenerate after changing the mark or the animation:
  python packaging/make_splash_html.py
"""
from __future__ import annotations

import base64
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
MARK = HERE / "brand" / "eri-mark-256.png"
OUT = HERE.parent / "backend" / "app" / "splash.py"

mark_b64 = base64.b64encode(MARK.read_bytes()).decode()

# Matrix-style "binary rain": each column is the ASCII-binary of E, ER, or ERI,
# chosen at random — so the acronym is literally encoded in the rain, and the
# lengths vary by construction (8 / 16 / 24 bits). Each stream falls at its own
# steady speed (decoupled from length, so tall columns don't race), with a
# bright leading "head" and a fading tail. Columns start ABOVE the viewport
# (fill-mode:backwards) so the screen opens empty and fills as they fall.
# Deterministic seed keeps the generated file stable (nod to the 2:20 launch).
_rng = random.Random(0x2B20)
_FRAG = ["E", "ER", "ERI"]
_COLORS = ["#F0704A", "#F4A63F", "#EA5E86"]  # coral / amber / rose
_VH = 800  # pywebview window height, for constant-velocity timing


def _bits(text: str) -> list[str]:
    return list("".join(format(ord(c), "08b") for c in text))


_N = 16
_cols = []
for _i in range(_N):
    _b = _bits(_FRAG[_rng.randint(0, 2)])
    _size = _rng.choice([14, 15, 16, 17])
    _height = len(_b) * _size * 1.6  # approx pixel height of the stream
    _velocity = _rng.uniform(150, 235)  # px/s, independent of length
    _dur = round((_VH + _height) / _velocity, 2)
    _cols.append(
        {
            "left": round(1 + _i * (98 / (_N - 1)), 1),
            "dur": _dur,
            "delay": round(_rng.uniform(0, 4.5), 2),
            "size": _size,
            "color": _COLORS[_rng.randint(0, 2)],
            "bits": _b,
        }
    )


def _render_col(col: dict) -> str:
    spans = "".join(f"<span>{b}</span>" for b in col["bits"])
    return (
        f'<div class="col" style="left:{col["left"]}%;font-size:{col["size"]}px;'
        f'color:{col["color"]};'
        f'animation:fall {col["dur"]}s linear infinite {col["delay"]}s backwards">'
        f"{spans}</div>"
    )


snow = "".join(_render_col(c) for c in _cols)

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html,body {{ height:100%; overflow:hidden; background:#0C0709;
    font-family:'Segoe UI',system-ui,sans-serif; }}
  .wrap {{ position:relative; height:100vh; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:26px; }}
  .snow {{ position:absolute; inset:0; pointer-events:none; overflow:hidden; }}
  .col {{ position:absolute; top:0; font-family:'Consolas',monospace;
    line-height:1.6; font-weight:600;
    -webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 42%,#000 100%);
    mask-image:linear-gradient(180deg,transparent 0%,#000 42%,#000 100%); }}
  .col span {{ display:block; text-shadow:0 0 7px currentColor; }}
  .col span:last-child {{ color:#FFEAD9; text-shadow:0 0 12px #F4A63F,0 0 4px #fff; }}
  .mark {{ position:relative; width:132px; height:132px;
    display:flex; align-items:center; justify-content:center; }}
  .ring {{ position:absolute; inset:-12px; border-radius:50%; filter:blur(9px);
    opacity:.8; background:conic-gradient(from 0deg,#F4A63F,#D6266F,#F0704A,#F4A63F);
    animation:spin 2.4s linear infinite; }}
  .fox {{ position:relative; width:132px; height:132px; border-radius:50%;
    animation:breathe 2.8s ease-in-out infinite; }}
  .title {{ position:relative; font-family:Georgia,'Times New Roman',serif;
    font-size:30px; color:#F3E9E4; letter-spacing:3px; }}
  .sub {{ position:relative; color:#C9B8B0; font-size:14px; }}
  .bar {{ position:relative; width:220px; height:3px; border-radius:2px; overflow:hidden;
    background:rgba(255,255,255,.08); }}
  .bar i {{ position:absolute; inset:0; width:40%; border-radius:2px;
    background:linear-gradient(90deg,#D6266F,#F0704A,#F4A63F);
    animation:slide 1.5s ease-in-out infinite; }}
  @keyframes spin {{ to {{ transform:rotate(360deg); }} }}
  @keyframes breathe {{ 0%,100% {{ transform:scale(1); }} 50% {{ transform:scale(1.04); }} }}
  @keyframes slide {{ 0% {{ left:-40%; }} 50% {{ left:60%; }} 100% {{ left:100%; }} }}
  @keyframes fall {{ from {{ transform:translateY(-100%); }} to {{ transform:translateY(100vh); }} }}
</style></head><body><div class="wrap">
  <div class="snow">{snow}</div>
  <div class="mark"><div class="ring"></div>
    <img class="fox" src="data:image/png;base64,{mark_b64}" alt=""></div>
  <div class="title">ERI</div>
  <div class="sub">Listening to your corpus…</div>
  <div class="bar"><i></i></div>
</div></body></html>"""

OUT.write_text(
    '"""Animated pounce splash HTML (generated by packaging/make_splash_html.py).\n'
    'Do not hand-edit — regenerate from the source instead."""\n\n'
    f"SPLASH_HTML = {html!r}\n",
    encoding="utf-8",
)
print(f"wrote {OUT.relative_to(HERE.parent)} ({OUT.stat().st_size} B; html {len(html)} B)")
