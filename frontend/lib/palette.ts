/**
 * Shared categorical palette (Okabe-Ito, colorblind-friendly).
 * Used for CHD classes, similarity-network communities and word-cloud words.
 * AFC markers do NOT use it: they have their own colours in afc-view.tsx.
 */
export const PALETTE = [
  "#E69F00", // orange
  "#56B4E9", // sky blue
  "#009E73", // bluish green
  "#F0E442", // yellow
  "#0072B2", // blue
  "#D55E00", // vermillion
  "#CC79A7", // reddish purple
  "#000000", // black
] as const;

export function categoryColor(index: number): string {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

/** Relative luminance (WCAG 2.x) of a #rrggbb colour. */
function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/**
 * Legible text colour for a filled swatch. Needed because the palette spans
 * very dark (#000000) to very light (#F0E442 — only 1.32:1 against white):
 * hardcoding white text made the yellow class label unreadable.
 */
export function readableTextOn(hex: string): string {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onInk = (l + 0.05) / 0.06;
  return onWhite >= onInk ? "#ffffff" : "#0f172a";
}

/**
 * Stroke for a filled swatch — keeps light fills (yellow) from washing out
 * against white while leaving the encoded hue itself untouched.
 */
export function fillStroke(hex: string): string {
  return luminance(hex) > 0.45 ? "#0f172a" : hex;
}

/** WCAG 2.x contrast of a #rrggbb colour against the white export ground. */
export function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/**
 * Palette hues readable as small text on white (AA, 4.5:1): blue and black.
 * For words whose colour encodes nothing (the word cloud).
 */
export const TEXT_HUES: readonly string[] = PALETTE.filter(
  (c) => contrastOnWhite(c) >= 4.5
);

export type WordPaint = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeOpacity: number;
};

/**
 * Paint for a word whose colour IS a category (network communities). A hue
 * at AA on white (blue, black) is the letters, with the usual white halo.
 * A lighter hue (orange 2.25:1, sky blue 2.31:1, ...) becomes the halo and
 * the letters take readableTextOn(hue): the community stays on every word,
 * the Okabe-Ito hue is unchanged, and letters and halo are >= 4.5:1 apart.
 */
export function wordPaint(hue: string, fontSize: number): WordPaint {
  if (contrastOnWhite(hue) >= 4.5) {
    return { fill: hue, stroke: "#ffffff", strokeWidth: Math.max(2, fontSize / 5), strokeOpacity: 0.85 };
  }
  return { fill: readableTextOn(hue), stroke: hue, strokeWidth: Math.max(3, fontSize / 4), strokeOpacity: 1 };
}
