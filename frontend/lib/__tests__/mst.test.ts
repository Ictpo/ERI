import { describe, expect, it } from "vitest";
import { maxSpanningTree } from "../mst";

type E = { source: string; target: string; w: number };
const w = (e: E) => e.w;

describe("maxSpanningTree", () => {
  it("keeps the heaviest acyclic edges (Kruskal, descending)", () => {
    // Square a-b-c-d plus the diagonal a-c: the maximum tree is 5 + 4 + 3.
    const edges: E[] = [
      { source: "a", target: "b", w: 5 },
      { source: "b", target: "c", w: 4 },
      { source: "c", target: "d", w: 1 },
      { source: "d", target: "a", w: 3 },
      { source: "a", target: "c", w: 2 },
    ];
    const tree = maxSpanningTree(["a", "b", "c", "d"], edges, w);
    expect(tree.map(w).sort((x, y) => y - x)).toEqual([5, 4, 3]);
  });

  it("returns a maximum spanning forest on a disconnected graph", () => {
    const edges: E[] = [
      { source: "a", target: "b", w: 2 },
      { source: "a", target: "b", w: 9 },
      { source: "c", target: "d", w: 7 },
    ];
    const tree = maxSpanningTree(["a", "b", "c", "d", "e"], edges, w);
    expect(tree.map(w).sort((x, y) => y - x)).toEqual([9, 7]);
  });
});
