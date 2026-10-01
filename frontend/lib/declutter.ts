/** AFC label declutter, moved unchanged from components/results/afc-view.tsx
    so it can be unit-tested (lib/__tests__/declutter.test.ts). */

const DISPLACED_EPS = 1.5; // px — below this, don't bother with a leader line

type LabelBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  baseline: number;
  kind: "word" | "modality";
  x0: number;
  y0: number;
};

/** Separate overlapping boxes within `group`, holding `fixed` boxes still.
    Movable boxes push apart 50/50; a movable box pushed against a fixed one
    absorbs the whole nudge. Returns true if anything still overlapped. */
function relax(
  group: LabelBox[],
  fixed: LabelBox[],
  minGap: number,
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
    cellW = Math.max(cellW, box.w + minGap);
    cellH = Math.max(cellH, box.h + minGap);
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
        const ox =
          Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + minGap;
        const oy =
          Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + minGap;
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

/**
 * Resolve label overlaps with minimal movement, in two phases that match
 * the requirement "variables are the most stable — they move only when they
 * collide with each other; words move around them":
 *   Phase 1 — settle variable-modality labels against each other only.
 *   Phase 2 — freeze the modalities and flow the word labels around them.
 * Markers never move; only the label text is repositioned.
 */
export function declutterLabels(
  items: { px: number; py: number; kind: "word" | "modality"; text: string }[],
  minGap: number,
  boundsW: number,
  boundsH: number
): { lx: number; ly: number; displaced: boolean }[] {
  const boxes: LabelBox[] = items.map((it) => {
    const fs = it.kind === "word" ? 9 : 11;
    const offX = it.kind === "word" ? 5 : 8;
    const baseline = it.kind === "word" ? 3 : 4;
    const h = fs * 1.2;
    return {
      x: it.px + offX,
      y: it.py + baseline - h * 0.75,
      w: Math.max(8, it.text.length * fs * (it.kind === "word" ? 0.55 : 0.62)),
      h,
      baseline: h * 0.75,
      kind: it.kind,
      x0: it.px + offX,
      y0: it.py + baseline,
    };
  });
  const clampBox = (box: LabelBox) => {
    box.x = Math.max(2, Math.min(boundsW - box.w - 2, box.x));
    box.y = Math.max(
      10 - box.baseline,
      Math.min(boundsH - 4 - box.baseline, box.y)
    );
  };
  const modalities = boxes.filter((b) => b.kind === "modality");
  const words = boxes.filter((b) => b.kind === "word");

  // Phase 1: modalities settle among themselves (nothing else moves).
  relax(modalities, [], minGap, clampBox, 400);
  // Phase 2: words flow around the now-fixed modalities and each other.
  relax(words, modalities, minGap, clampBox, 1200);

  return boxes.map((box) => {
    const lx = box.x;
    const ly = box.y + box.baseline;
    const displaced =
      Math.abs(lx - box.x0) > DISPLACED_EPS ||
      Math.abs(ly - box.y0) > DISPLACED_EPS;
    return { lx, ly, displaced };
  });
}
