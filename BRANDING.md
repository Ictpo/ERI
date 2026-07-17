# Eri — Brand Implementation Guide

> Hand this file to Claude Code. It re-skins the ERI app from its current indigo
> theme to the "Eri" fox identity. Follow the standing workflow in `CLAUDE.md`
> to verify and ship (edit → `tsc --noEmit` + `npm run build` → drive the real
> UI → rebuild export/exe → commit/tag). **Do Step 1 first and ship it alone —
> it's the biggest visual change at the lowest risk.**

## Identity summary

- **Name:** Eri (Engine for Reinert Insights). Slogan: *Hear the pattern beneath the noise.*
- **Primary color (rose):** `#D6266F`, hover `#A81A57`.
- **Signature gradient ("the Pounce"), brand moments only:** `linear-gradient(150deg, #D6266F 0%, #F0704A 55%, #F4A63F 100%)`.
- **Type:** Inter for UI, **Newsreader** (serif) for headings/wordmark.
- **Charts:** keep the existing Okabe–Ito palette in `lib/palette.ts` — it's already colorblind-safe. Brand color must NOT be used to encode categorical data.

---

## Step 1 — Re-theme from one file (the big win)

The UI hard-codes `indigo-*` (~40 places). Override the `indigo` scale itself in
`frontend/tailwind.config.ts` so every existing class becomes rose — no
component edits. Replace the `colors` block:

```ts
colors: {
  // Brand rose ramp. Overrides Tailwind's built-in indigo, so every
  // existing `indigo-*` class becomes Eri rose — zero component edits.
  indigo: {
    50:  "#FCF0F6",
    100: "#FBE0EE",
    200: "#F6C6DD",
    300: "#EF9EC3",
    400: "#E76AA1",
    500: "#E23B80", // focus rings
    600: "#D6266F", // primary — buttons, active
    700: "#A81A57", // hover
    800: "#851445",
    900: "#611033", // text on soft bg
  },
  accent: {
    DEFAULT: "#D6266F",
    hover:   "#A81A57",
    soft:    "#FCF0F6",
  },
},
```

Slate neutrals and emerald/amber/red status colors stay unchanged.

## Step 2 — Add the display serif

In `frontend/app/layout.tsx`:

```tsx
import { Inter, Newsreader } from "next/font/google";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  style: ["normal", "italic"],
});

// on <body>:
<body className={`${inter.variable} ${newsreader.variable} font-sans`}>
```

In `frontend/tailwind.config.ts` → `theme.extend.fontFamily`:

```ts
fontFamily: {
  sans:    ["var(--font-inter)", "system-ui", "sans-serif"],
  display: ["var(--font-newsreader)", "Georgia", "serif"],
},
```

Apply `font-display` to the app title and result headings (e.g. the `<h1>` in
`app/page.tsx`). Keep body/tables/controls on Inter.

## Step 3 — Charts

- `components/results/afc-view.tsx`: change `DEFAULT_MODALITY_COLOR = "#4f46e5"`
  to `"#D6266F"`. (Single series — words are slate, modalities one color — so
  brand rose is safe here.)
- `lib/palette.ts`: already Okabe–Ito, leave as-is. Note `#F0E442` (yellow) is
  low-contrast as a fill on white; if a class/community renders as a light
  patch, add a thin darker stroke around fills (keep the hex).
- Rigor backlog (not blocking): cap categorical color at ~6 groups, then use
  small multiples / filtering instead of more hues. Surface the correspondence
  **normalization** choice in the UI (label/tooltip) since it changes how
  distances are read.

## Step 4 — Mark & favicon

Replace the generic `ScatterChart` glyph in `app/page.tsx` and
`components/workspace/workspace.tsx` headers:

```tsx
// eri-mark.png goes in frontend/public/ (ERI is an acronym — wordmark is all-caps)
<img src="/eri-mark.png" alt="ERI" className="h-10 w-10 rounded-lg" />
<div>
  <h1 className="font-display text-lg font-semibold tracking-tight">ERI</h1>
  <p className="text-sm text-slate-500">Hear the pattern beneath the noise.</p>
</div>
```

Favicons: copy the generated PNGs (16/32/48/180/256) into `frontend/public/`,
replace `app/favicon.ico`, rename the 180 to `apple-touch-icon.png`.
Desktop: regenerate `packaging/eri.ico` via `make_icon.py` from the 256 PNG
(sub-256 frames MUST be BMP, per CLAUDE.md).

## Step 5 — Binary-rain loader

> **Shipped state:** the loader evolved from the sketch below into a Matrix-style
> binary rain. Each column is the **ASCII-binary of E / ER / ERI** (so the
> acronym is literally encoded in the rain, and column lengths vary by
> construction — 8 / 16 / 24 bits). Streams fall at a steady speed decoupled
> from length, with a bright leading "head" and a mask-faded tail, in mixed
> coral/amber/rose, and start above the frame so it opens empty and fills in.
> The same motif drives the animated startup splash (see Step 7). Source of
> truth: `frontend/components/ui/eri-loader.tsx`.

New file `frontend/components/ui/eri-loader.tsx`:

```tsx
"use client";

export function EriLoader({ label = "Listening to your corpus…" }: { label?: string }) {
  const cols = ["6%", "26%", "72%", "90%"];
  return (
    <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-xl bg-[#0C0709] px-8 py-14">
      {cols.map((left, i) => (
        <div key={i} aria-hidden
          className="pointer-events-none absolute -top-[10%] font-mono text-sm text-[#F0704A]"
          style={{ left, animation: `eriFall ${2.6 + i * 0.3}s linear infinite` }}>
          {["E", "R", "I", "0", "1", "0"].map((c, j) => <div key={j}>{c}</div>)}
        </div>
      ))}
      <div className="relative flex h-[120px] w-[120px] items-center justify-center">
        <div className="absolute -inset-3 rounded-full opacity-70 blur-[7px]"
          style={{ background: "conic-gradient(from 0deg,#F4A63F,#D6266F,#F0704A,#F4A63F)",
                   animation: "eriRing 2.4s linear infinite" }} />
        <img src="/eri-mark.png" alt="" className="relative h-[120px] w-[120px] rounded-full" />
      </div>
      <p className="relative font-display text-xl text-[#F3E9E4]">{label}</p>
    </div>
  );
}
```

Add keyframes to `app/globals.css`:

```css
@keyframes eriFall { from { transform: translateY(-130%); } to { transform: translateY(130%); } }
@keyframes eriRing { to { transform: rotate(360deg); } }
```

Render `<EriLoader />` in the loading branch of
`components/workspace/results-pane.tsx` (replacing the `Loader2` + progress
block, or alongside it).

## Step 6 — "About ERI" custom window

> **Shipped state:** the fox painting is no longer a plain file in the repo.
> It is XOR-obfuscated to `frontend/public/eri-art.bin` (build step:
> `packaging/encode_art.py`) and decoded to a Blob URL at runtime, only when the
> dialog opens (`frontend/lib/fox-art.ts`). The raw `eri-fox.jpg` stays out of
> git. The snippet below shows the original plain-`<img>` shape.

Reuses the existing `Dialog` so it's a styled branded card, not a rough box.
New file `frontend/components/about-eri.tsx`:

```tsx
"use client";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export function AboutEri() {
  return (
    <Dialog>
      <DialogTrigger className="text-sm text-slate-500 hover:text-indigo-600 transition-colors">
        About ERI
      </DialogTrigger>
      {/* overflow-hidden + p-0 lets our card fill the dialog edge-to-edge */}
      <DialogContent className="max-w-xl overflow-hidden border-0 bg-[#0C0709] p-0">
        <div className="grid grid-cols-[0.75fr_1.25fr]">
          <div className="relative min-h-[230px]">
            <img src="/eri-fox.jpg" alt="Eri" className="h-full w-full object-cover" />
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(90deg,transparent 55%,#0C0709)" }} />
          </div>
          <div className="p-7">
            <div className="mb-3 flex items-center gap-2">
              <img src="/eri-mark.png" className="h-7 w-7 rounded-full" />
              <span className="font-display text-xl font-semibold text-[#F3E9E4]">About ERI</span>
            </div>
            <p className="text-sm leading-relaxed text-[#C9B8B0]">
              Eri is a friendlier successor to iramuteq — text analysis anyone can
              follow. Inspired by a dear friend, whose warmth shapes the identity;
              she also drew the fox.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#241519] pt-3">
              <Credit label="Design & build" name="Victor R Prados" />
              <Credit label="Inspiration & art" name="Erine Chen Bi Ting" />
            </div>
            <div className="mt-4 h-1 rounded-full"
              style={{ background: "linear-gradient(90deg,#D6266F,#F0704A,#F4A63F)" }} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Credit({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#7E6C64]">{label}</div>
      <div className="text-sm font-semibold text-[#F3E9E4]">{name}</div>
    </div>
  );
}
```

Place `<AboutEri />` on the right side of the header in `app/page.tsx` and in
the workspace header. The fox art ships obfuscated as `eri-art.bin` and is
decoded at runtime (Step 6) — the plain snippet above predates that. The
close "✕" and backdrop-dismiss come with `DialogContent` — no extra wiring.

---

## Step 7 — Animated startup splash

The desktop app takes a beat to unpack + boot, so it opens on an animated
splash instead of a blank window. Two phases:

- **Unpack (Windows/Linux only):** PyInstaller `--splash` shows the static
  `packaging/eri-splash.png` (generated by `make_splash.py`) while the onefile
  bundle unpacks. macOS has no PyInstaller splash.
- **Server-start (all platforms):** the pywebview window opens directly on the
  animated "pounce" — `SPLASH_HTML` in `backend/app/splash.py`, generated by
  `packaging/make_splash_html.py` (self-contained HTML+CSS, fox mark inlined as
  a data URI). A background worker imports the analysis stack and starts the
  server; when `/api/health` is up it swaps the window to the app URL. Wiring
  lives in `backend/desktop.py`.

Regenerate both after changing the mark or the animation:
`python packaging/make_splash.py && python packaging/make_splash_html.py`.

## Assets to place in `frontend/public/`

- `eri-mark.png` — the round fox mark (use the 256 source, or 32/48 where small).
- `eri-art.bin` — the About-window painting, XOR-obfuscated (see Step 6). The
  raw `eri-fox.jpg` is intentionally **not** committed.
- `favicon.ico`, `apple-touch-icon.png` — from the generated favicon set.

## Suggested commit sequence

1. `feat(brand): rose theme via indigo override` (Step 1) — ship & eyeball.
2. `feat(brand): Newsreader display font` (Step 2).
3. `feat(brand): fox mark, favicons, About ERI dialog` (Steps 4 + 6 + assets).
4. `feat(brand): AFC default color + Snowfall loader` (Steps 3 + 5).
