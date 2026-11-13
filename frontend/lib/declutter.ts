/** AFC label declutter, moved unchanged from components/results/afc-view.tsx
    so it can be unit-tested (lib/__tests__/declutter.test.ts). */

const DISPLACED_EPS = 1.5; // px — below this, don't bother with a leader line
// Least room between labels side by side: a 9 px word space is ~2.5 px.
const MIN_GAP_X = 5;

type LabelBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  baseline: number;
  kind: "word" | "modality";
  x0: number;
  y0: number;
  /** Item the box belongs to: a label never avoids its own marker. */
  id: number;
  /** The item's point: a word label stays within maxShift of it. */
  px: number;
  py: number;
  /** Higher keeps its label first when not every label fits. */
  priority: number;
  /** Left out: no room near its point (the marker stays). */
  hidden: boolean;
};

/** a and b (not a label and its own marker) closer than the gaps on both axes. */
function clash(a: LabelBox, b: LabelBox, gapX: number, gapY: number) {
  return a.id !== b.id &&
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + gapX > 0 &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + gapY > 0;
}

/** Separate overlapping boxes within `group`, holding `fixed` boxes still.
    Movable boxes push apart 50/50; a movable box pushed against a fixed one
    absorbs the whole nudge. Returns true if anything still overlapped. */
function relax(
  group: LabelBox[],
  fixed: LabelBox[],
  gapX: number,
  gapY: number,
  clamp: (b: LabelBox) => void,
  iterations: number
) {
  const all = [...group, ...fixed];
  const movable = new Set(group);
  // Broad phase: with a grid cell as large as the largest box plus the gap,
  // two boxes can only overlap if their cells are neighbours, so each pass
  // compares a box with its 3x3 neighbourhood instead of with every box.
  let cellW = 1;
  let cellH = 1;
  for (const box of all) {
    cellW = Math.max(cellW, box.w + gapX);
    cellH = Math.max(cellH, box.h + gapY);
  }
  const cellKey = (cx: number, cy: number) => cx * 65536 + cy;
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    const grid = new Map<number, number[]>();
    all.forEach((box, idx) => {
      const key = cellKey(Math.floor(box.x / cellW), Math.floor(box.y / cellH));
      const bucket = grid.get(key);
      if (bucket) bucket.push(idx);
      else grid.set(key, [idx]);
    });
    for (let i = 0; i < all.length; i++) {
      const cx = Math.floor(all[i].x / cellW);
      const cy = Math.floor(all[i].y / cellH);
      const near: number[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const j of grid.get(cellKey(cx + dx, cy + dy)) ?? []) {
            if (j > i) near.push(j);
          }
        }
      }
      near.sort((p, q) => p - q);
      for (const j of near) {
        const a = all[i];
        const b = all[j];
        const aMov = movable.has(a);
        const bMov = movable.has(b);
        if (!aMov && !bMov) continue;
        if (a.id === b.id) continue; // a label and its own marker
        const ox =
          Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + gapX;
        const oy =
          Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + gapY;
        if (ox <= 0 || oy <= 0) continue;
        const share = aMov && bMov ? 0.5 : 1;
        const moveA = aMov ? share : 0;
        const moveB = bMov ? share : 0;
        moved = true;
        if (ox < oy) {
          let dir = a.x + a.w / 2 < b.x + b.w / 2 ? -1 : 1;
          if (Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) < 0.5)
            dir = (i + j) % 2 ? 1 : -1; // coincident centers: deterministic split
          a.x += dir * ox * moveA;
          b.x -= dir * ox * moveB;
        } else {
          let dir = a.y + a.h / 2 < b.y + b.h / 2 ? -1 : 1;
          if (Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < 0.5)
            dir = (i + j) % 2 ? 1 : -1;
          a.y += dir * oy * moveA;
          b.y -= dir * oy * moveB;
        }
      }
    }
    for (const box of group) clamp(box);
    if (!moved) return false;
  }
  return true;
}

export type DeclutterOptions = {
  /** Label width as drawn (px); default: estimated from the character count. */
  measure?: (text: string, kind: "word" | "modality") => number;
  /** Label every word even where no room is left (leftovers overlap and
      come back flagged `overlapping`) instead of leaving them out. */
  keepAll?: boolean;
  /** Furthest (px) a word label may sit from its point; farther ones are left out. */
  maxShift?: number;
  /** Areas no label may enter (axis titles, a key), in px. */
  obstacles?: { x: number; y: number; w: number; h: number }[];
};

/**
 * Resolve label overlaps with minimal movement, in two phases that match
 * the requirement "variables are the most stable — they move only when they
 * collide with each other; words move around them":
 *   Phase 1 — settle variable-modality labels against each other only.
 *   Phase 2 — freeze the modalities and flow the word labels around them.
 * Markers never move; only the label text is repositioned.
 */
export function declutterLabels(
  items: {
    px: number; py: number; kind: "word" | "modality"; text: string;
    priority?: number; // higher keeps its label first (afc-view: contribution)
  }[],
  minGap: number,
  boundsW: number,
  boundsH: number,
  opts: DeclutterOptions = {}
): { lx: number; ly: number; displaced: boolean; hidden: boolean; overlapping: boolean; ax: number; ay: number }[] {
  const gapX = Math.max(minGap, MIN_GAP_X); // side by side; minGap above/below
  const boxes: LabelBox[] = items.map((it, id) => {
    const fs = it.kind === "word" ? 9 : 11;
    const offX = it.kind === "word" ? 5 : 8;
    const baseline = it.kind === "word" ? 3 : 4;
    const h = fs * 1.2;
    return {
      x: it.px + offX,
      y: it.py + baseline - h * 0.75,
      w: opts.measure
        ? Math.max(8, opts.measure(it.text, it.kind))
        : Math.max(8, it.text.length * fs * (it.kind === "word" ? 0.55 : 0.62)),
      h,
      baseline: h * 0.75,
      kind: it.kind,
      x0: it.px + offX,
      y0: it.py + baseline,
      id,
      px: it.px,
      py: it.py,
      priority: it.priority ?? 0,
      hidden: false,
    };
  });
  // Markers as drawn (dot r 3, diamond 5.5): fixed obstacles for word labels.
  const markers: LabelBox[] = items.map((it, id) => {
    const r = it.kind === "word" ? 3 : 5.5;
    const x = it.px - r;
    const y = it.py - r;
    return { x, y, w: 2 * r, h: 2 * r, baseline: 0, kind: it.kind, x0: x, y0: y, id, px: it.px, py: it.py, priority: 0, hidden: false };
  });
  // Areas the caller reserves: fixed, like markers.
  const reserved = (opts.obstacles ?? []).map((o, k): LabelBox => ({
    ...o, baseline: 0, kind: "modality", x0: o.x, y0: o.y,
    id: -1 - k, px: o.x, py: o.y, priority: 0, hidden: false,
  }));
  const maxShift = opts.maxShift ?? Infinity;
  const clampBox = (box: LabelBox) => {
    // A word label stays within maxShift of its point (to its nearest edge);
    // what can't fit that close is left out in phase 3.
    if (box.kind === "word" && maxShift < Infinity) {
      const dx = Math.min(Math.max(box.px, box.x), box.x + box.w) - box.px;
      const dy = Math.min(Math.max(box.py, box.y), box.y + box.h) - box.py;
      const d = Math.hypot(dx, dy);
      if (d > maxShift) {
        box.x -= dx * (1 - maxShift / d);
        box.y -= dy * (1 - maxShift / d);
      }
    }
    box.x = Math.max(2, Math.min(boundsW - box.w - 2, box.x));
    box.y = Math.max(
      10 - box.baseline,
      Math.min(boundsH - 4 - box.baseline, box.y)
    );
  };
  const modalities = boxes.filter((b) => b.kind === "modality");
  const words = boxes.filter((b) => b.kind === "word");

  // Phase 1: modalities settle among themselves (nothing else moves).
  relax(modalities, reserved, gapX, minGap, clampBox, 400);
  // Phase 2: words flow round the fixed modalities, every marker and each other.
  const fixed = [...modalities, ...markers, ...reserved];
  relax(words, fixed, gapX, minGap, clampBox, 1200);

  // Phase 3: a word label still clashing has no room near its point: leave
  // out the lower-priority label of each clash (one against a fixed box
  // loses), re-flow the rest, repeat. Checks boxes, not relax()'s result.
  const isWordLabel = new Set(words);
  const clashes = () => {
    const shown = words.filter((b) => !b.hidden);
    const pairs: [LabelBox, LabelBox][] = [];
    shown.forEach((a, i) => {
      for (const b of [...shown.slice(i + 1), ...fixed])
        if (clash(a, b, gapX, minGap)) pairs.push([a, b]);
    });
    return pairs;
  };
  for (let round = 0; round < 40 && !opts.keepAll; round++) {
    const pairs = clashes();
    if (pairs.length === 0) break;
    for (const [a, b] of pairs) {
      if (a.hidden || b.hidden) continue;
      (isWordLabel.has(b) && b.priority < a.priority ? b : a).hidden = true;
    }
    relax(words.filter((b) => !b.hidden), fixed, gapX, minGap, clampBox, 300);
  }
  const overlapping = new Set(clashes().flat());

  return boxes.map((box) => {
    const lx = box.x;
    const ly = box.y + box.baseline;
    const displaced =
      Math.abs(lx - box.x0) > DISPLACED_EPS ||
      Math.abs(ly - box.y0) > DISPLACED_EPS;
    return {
      lx, ly, displaced,
      hidden: box.hidden,
      overlapping: overlapping.has(box),
      // Leader-line end: the label's nearest point to its marker.
      ax: Math.min(Math.max(box.px, box.x), box.x + box.w),
      ay: Math.min(Math.max(box.py, box.y), box.y + box.h),
    };
  });
}
