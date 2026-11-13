import { describe, expect, it } from "vitest";
import { selectWords, defaultTopN, topNRange, type ContribRow } from "../afc-select";

// 4 words; axis 1 contributions sum to 100, axis 2 too. Average = 25%.
const rows: ContribRow[] = [
  { contrib_x: 50, contrib_y: 5, contrib_z: null },  // above on axis 1
  { contrib_x: 20, contrib_y: 40, contrib_z: null }, // above on axis 2
  { contrib_x: 25, contrib_y: 25, contrib_z: null }, // exactly average: not above
  { contrib_x: 5, contrib_y: 30, contrib_z: null },  // above on axis 2
];

describe("selectWords", () => {
  it("above-average keeps words strictly above 100/n on either axis", () => {
    const s = selectWords({ rows, ax: 0, ay: 1, inertiaX: 60, inertiaY: 40, mode: "above-average" });
    expect(Array.from(s.ids).sort()).toEqual([0, 1, 3]);
    expect(s.average).toBe(25);
    expect(s.rule).toBe(
      "Words shown: 3 of 4 — contribution above average (> 25.00%) on axis 1 or 2"
    );
  });

  it("uses the plotted axes, including a third axis", () => {
    const r3: ContribRow[] = [
      { contrib_x: 0, contrib_y: 0, contrib_z: 90 },
      { contrib_x: 100, contrib_y: 100, contrib_z: 10 },
    ];
    const s = selectWords({ rows: r3, ax: 0, ay: 2, inertiaX: 1, inertiaY: 1, mode: "above-average" });
    expect(s.rule).toContain("axis 1 or 3");
    expect(Array.from(s.ids).sort()).toEqual([0, 1]);
  });

  it("accepts contributions stored as shares summing to 1", () => {
    const shares = rows.map((r) => ({ contrib_x: r.contrib_x / 100, contrib_y: r.contrib_y / 100, contrib_z: null }));
    const s = selectWords({ rows: shares, ax: 0, ay: 1, inertiaX: 1, inertiaY: 1, mode: "above-average" });
    expect(Array.from(s.ids).sort()).toEqual([0, 1, 3]);
  });

  it("top-n ranks by inertia-weighted contribution to the plane", () => {
    // 12 words. Word i has axis-1 share a_i and axis-2 share b_i (each sums to 100).
    // Words 0 and 1 are the weakest on the weighted plane; word 2 is strong
    // only on axis 2, which has little weight (10%), so it still ranks mid.
    const a = [0, 0, 0, 10, 10, 10, 10, 10, 10, 10, 10, 20];
    const b = [0, 0, 55, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    const sumB = b.reduce((x, y) => x + y, 0);
    expect(a.reduce((x, y) => x + y, 0)).toBe(100);
    expect(sumB).toBe(100);
    const big: ContribRow[] = a.map((x, i) => ({ contrib_x: x, contrib_y: b[i], contrib_z: null }));
    const s = selectWords({ rows: big, ax: 0, ay: 1, inertiaX: 90, inertiaY: 10, mode: "top-n", topN: 10 });
    expect(s.ids.size).toBe(10);
    // plane scores: w0=0, w1=0 (lowest two), w2=5.5, others >= 9.5
    expect(s.ids.has(0)).toBe(false);
    expect(s.ids.has(1)).toBe(false);
    expect(s.ids.has(2)).toBe(true);
    expect(s.rule).toBe("Words shown: 10 of 12 — highest contribution to the 1 × 2 plane");
  });

  it("all selects every word", () => {
    const s = selectWords({ rows, ax: 0, ay: 1, inertiaX: 1, inertiaY: 1, mode: "all" });
    expect(s.ids.size).toBe(4);
    expect(s.rule).toBe("Words shown: all 4");
  });

  it("slider helpers", () => {
    expect(defaultTopN(120)).toBe(60);
    expect(defaultTopN(30)).toBe(30);
    expect(topNRange(120)).toEqual({ min: 10, max: 120 });
  });
});
