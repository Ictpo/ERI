import { describe, expect, it } from "vitest";
import { declutterLabels } from "../declutter";

type Item = { px: number; py: number; kind: "word" | "modality"; text: string; priority?: number };

// A label's box as declutter.ts estimates it (no measure given).
function labelBox(item: Item, l: { lx: number; ly: number }) {
  const fs = item.kind === "word" ? 9 : 11;
  const h = fs * 1.2;
  const w = Math.max(8, item.text.length * fs * (item.kind === "word" ? 0.55 : 0.62));
  return { x: l.lx, y: l.ly - h * 0.75, w, h };
}

// A crowd round one modality, like the centre of the exported map.
const crowd = (n: number): Item[] => [
  { px: 300, py: 260, kind: "modality", text: "CRIAT" },
  ...Array.from({ length: n }, (_, i): Item => ({
    px: 285 + ((i * 7) % 30), py: 245 + ((i * 11) % 30), kind: "word", text: `palavra${i}`, priority: i,
  })),
];

// Shown labels closer than 5 px side by side and 2 px above/below.
function clashes(items: Item[], out: ReturnType<typeof declutterLabels>) {
  const shown = items.map((item, i) => ({ item, b: labelBox(item, out[i]) })).filter((_, i) => !out[i].hidden);
  return shown.flatMap((a, i) => shown.slice(i + 1).filter(({ b }) =>
    Math.min(a.b.x + a.b.w, b.x + b.w) - Math.max(a.b.x, b.x) + 5 > 1e-6 &&
    Math.min(a.b.y + a.b.h, b.y + b.h) - Math.max(a.b.y, b.y) + 2 > 1e-6
  ).map(({ item }) => `${a.item.text} / ${item.text}`));
}

describe("declutterLabels", () => {
  it("does not move labels that do not collide", () => {
    const items: Item[] = [
      { px: 100, py: 100, kind: "word", text: "sol" },
      { px: 500, py: 400, kind: "modality", text: "sexo_f" },
    ];
    const out = declutterLabels(items, 2, 720, 520);
    expect(out.map((l) => l.displaced)).toEqual([false, false]);
  });

  it("keeps a modality pinned and spreads the words stacked on it", () => {
    const items: Item[] = [
      { px: 300, py: 250, kind: "modality", text: "idade_jovem" },
      { px: 300, py: 250, kind: "word", text: "casa" },
      { px: 300, py: 250, kind: "word", text: "trabalho" },
      { px: 300, py: 250, kind: "word", text: "familia" },
    ];
    const out = declutterLabels(items, 2, 720, 520);
    expect(out[0].displaced).toBe(false);
    expect(out.slice(1).every((l) => l.displaced)).toBe(true);
    const spots = new Set(out.map((l) => `${l.lx.toFixed(1)},${l.ly.toFixed(1)}`));
    expect(spots.size).toBe(items.length);
    for (const l of out) {
      expect(l.lx).toBeGreaterThanOrEqual(0);
      expect(l.lx).toBeLessThanOrEqual(720);
      expect(l.ly).toBeGreaterThanOrEqual(0);
      expect(l.ly).toBeLessThanOrEqual(520);
    }
  });

  it("keeps word labels off every other point's marker", () => {
    // As in the exported map: "algum" over the ANALI diamond, "dificuldade" over three dots.
    const items: Item[] = [
      { px: 380, py: 343, kind: "word", text: "algum" },
      { px: 404.6, py: 340.9, kind: "modality", text: "ANALI" },
      { px: 262, py: 275, kind: "word", text: "dificuldade" },
      { px: 269, py: 272.7, kind: "word", text: "bastante" },
      { px: 283.2, py: 276.3, kind: "word", text: "acontecer" },
      { px: 301.7, py: 275.2, kind: "word", text: "tarefar" },
    ];
    const out = declutterLabels(items, 2, 720, 520);
    items.forEach((item, i) => {
      if (item.kind !== "word") return;
      const b = labelBox(item, out[i]);
      items.forEach((m, j) => {
        const r = m.kind === "word" ? 3 : 5.5;
        const covers = j !== i && b.x < m.px + r && b.x + b.w > m.px - r && b.y < m.py + r && b.y + b.h > m.py - r;
        expect(covers, `"${item.text}" covers "${m.text}"`).toBe(false);
      });
    });
  });

  it("never prints stacked or run-together labels", () => {
    for (const [w, h] of [[720, 520], [200, 120]]) { // 200 × 120: some must go
      const items = crowd(60);
      const out = declutterLabels(items, 2, w, h);
      expect(clashes(items, out)).toEqual([]);
      expect(out.some((l) => l.overlapping)).toBe(false);
    }
  });

  it("labels every word with keepAll, flagging the overlaps", () => {
    const out = declutterLabels(crowd(60), 2, 200, 120, { keepAll: true });
    expect(out.every((l) => !l.hidden) && out.some((l) => l.overlapping)).toBe(true);
  });

  it("keeps every shown word label within maxShift of its point", () => {
    const items = crowd(60);
    const out = declutterLabels(items, 2, 720, 520, { maxShift: 40 });
    items.forEach((item, i) => {
      if (item.kind !== "word" || out[i].hidden) return;
      const b = labelBox(item, out[i]);
      const dx = Math.min(Math.max(item.px, b.x), b.x + b.w) - item.px;
      const dy = Math.min(Math.max(item.py, b.y), b.y + b.h) - item.py;
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(40 + 1e-6);
    });
    expect(clashes(items, out)).toEqual([]);
  });

  it("keeps labels out of reserved areas (axis titles, the key)", () => {
    const items: Item[] = [{ px: 300, py: 478, kind: "word", text: "pesquisar" }];
    const out = declutterLabels(items, 2, 720, 520, { obstacles: [{ x: 0, y: 470, w: 720, h: 50 }] });
    const b = labelBox(items[0], out[0]);
    expect(out[0].hidden || b.y + b.h <= 470).toBe(true);
  });
});
