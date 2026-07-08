/**
 * Shared categorical palette (Okabe-Ito, colorblind-friendly).
 * Used consistently for CHD classes, network communities and AFC markers.
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
