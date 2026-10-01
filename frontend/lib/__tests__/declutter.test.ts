import { describe, expect, it } from "vitest";
import { declutterLabels } from "../declutter";

type Item = { px: number; py: number; kind: "word" | "modality"; text: string };

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
});
