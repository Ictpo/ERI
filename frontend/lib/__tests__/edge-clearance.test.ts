import * as d3 from "d3";
import { describe, expect, it } from "vitest";
import { countLabelEdgeCrossings, forceEdgeClearance, settleEdgeClearance, type Seg } from "../edge-clearance";

// A near-star like the default network of the 44-interview corpus: a hub
// tied to 52 terms of 2–25 characters, with the forces computeLayout uses.
describe("edge clearance", () => {
  it("leaves no label on an edge it is not an end of", () => {
    const words = ["pra", "atividade", "trabalho", "inteligência_artificial", "hoje", "conseguir", "aí"];
    const nodes = Array.from({ length: 53 }, (_, i) => {
      const id = i === 0 ? "ir" : `${words[i % words.length]}${i}`;
      const fontSize = i === 0 ? 33 : 11 + ((i * 7) % 15);
      const halfWidth = Math.max(fontSize * 0.75, id.length * fontSize * 0.29);
      return { id, fontSize, halfWidth, x: 380 + 160 * Math.cos(i), y: 280 + 160 * Math.sin(i) };
    });
    const links = nodes.slice(1).map((n, i) => ({ source: i % 6 === 5 ? nodes[i].id : "ir", target: n.id, w: 3 + ((i * 13) % 60) }));
    const segs = links as unknown as Seg[]; // forceLink swaps ids for nodes
    const sim = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force("link", d3.forceLink(links as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
        .id((d) => (d as unknown as { id: string }).id)
        .distance((l) => 60 + 90 * (1 - (l as unknown as { w: number }).w / 62)))
      .force("charge", d3.forceManyBody().strength(-180))
      .force("collide", d3.forceCollide<d3.SimulationNodeDatum>()
        .radius((d) => (d as unknown as { halfWidth: number }).halfWidth + 6).iterations(2))
      .force("edges", forceEdgeClearance(segs))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    settleEdgeClearance(sim, nodes, segs);
    expect(countLabelEdgeCrossings(nodes, segs)).toBe(0);
  });
});
