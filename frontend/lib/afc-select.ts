/** Which words the printed AFC figure shows (pure; unit-tested in
    lib/__tests__/afc-select.test.ts).

    A correspondence-analysis word contributes to an axis by some share of that
    axis's inertia; the shares of all active words on one axis sum to 100%, so
    the average contribution is 100/n %. Le Roux & Rouanet's baseline rule keeps
    a word when it beats that average on either plotted axis. */

export type AfcSelectMode = "above-average" | "top-n" | "all";

/** The three contribution fields of an AFC word row (percent, 0..100). */
export type ContribRow = {
  contrib_x: number;
  contrib_y: number;
  contrib_z: number | null;
};

export type AfcSelection = {
  /** Indices (into `rows`) of the selected words. */
  ids: Set<number>;
  /** Plain-language rule for the figure's key. */
  rule: string;
  /** Average contribution per axis, in percent (100 / n). */
  average: number;
};

function axisContrib(r: ContribRow, axis: number): number {
  if (axis === 0) return r.contrib_x;
  if (axis === 1) return r.contrib_y;
  return r.contrib_z ?? 0;
}

/** Per-axis contributions as percentages that sum to 100 over all rows. The
    engine already stores percent; normalising by the sum makes that hold even
    after rounding, and also accepts shares that sum to 1. */
function percentages(rows: ContribRow[], axis: number): number[] {
  const raw = rows.map((r) => Math.max(0, axisContrib(r, axis)));
  const sum = raw.reduce((a, b) => a + b, 0);
  const scale = sum > 0 ? 100 / sum : 0;
  return raw.map((v) => v * scale);
}

/** Smallest and largest N the "top N" slider allows. */
export function topNRange(n: number): { min: number; max: number } {
  return { min: Math.min(10, n), max: Math.max(n, 1) };
}

export function defaultTopN(n: number): number {
  return Math.min(60, n);
}

export function selectWords(opts: {
  rows: ContribRow[];
  ax: number;
  ay: number;
  /** Explained inertia of the two plotted axes (any common unit). */
  inertiaX: number;
  inertiaY: number;
  mode: AfcSelectMode;
  topN?: number;
}): AfcSelection {
  const { rows, ax, ay, mode } = opts;
  const n = rows.length;
  const average = n > 0 ? 100 / n : 0;
  const cx = percentages(rows, ax);
  const cy = percentages(rows, ay);
  const ids = new Set<number>();
  const axes = `${ax + 1} or ${ay + 1}`;
  const plane = `${ax + 1} × ${ay + 1}`;

  if (mode === "all") {
    rows.forEach((_, i) => ids.add(i));
    return { ids, rule: `Words shown: all ${n}`, average };
  }
  if (mode === "above-average") {
    rows.forEach((_, i) => {
      if (cx[i] > average || cy[i] > average) ids.add(i);
    });
    return {
      ids,
      average,
      rule: `Words shown: ${ids.size} of ${n} — contribution above average (> ${average.toFixed(2)}%) on axis ${axes}`,
    };
  }
  // top-n: contribution to the plane, weighted by each axis's explained inertia.
  const wx = Math.max(0, opts.inertiaX);
  const wy = Math.max(0, opts.inertiaY);
  const wSum = wx + wy || 1;
  const score = rows.map((_, i) => (cx[i] * wx + cy[i] * wy) / wSum);
  const { min, max } = topNRange(n);
  const want = Math.max(min, Math.min(max, Math.round(opts.topN ?? defaultTopN(n))));
  const order = rows
    .map((_, i) => i)
    .sort((a, b) => score[b] - score[a] || a - b);
  order.slice(0, Math.min(want, n)).forEach((i) => ids.add(i));
  return {
    ids,
    average,
    rule: `Words shown: ${ids.size} of ${n} — highest contribution to the ${plane} plane`,
  };
}
