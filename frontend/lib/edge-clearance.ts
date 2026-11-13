/** Keeps similarity-network labels off edges they are not an end of
    (forceCollide only keeps labels off each other, so a hub's spokes ran
    through other words). Used by computeLayout in similarity-view.tsx. */
import type { Simulation, SimulationNodeDatum } from "d3";

export type ClearNode = { x: number; y: number; vx?: number; vy?: number; halfWidth: number; fontSize: number };
export type Seg = { source: ClearNode; target: ClearNode };

/** px a label keeps from any edge it is not an end of. */
export const EDGE_CLEARANCE = 6;
/** Label × edge pairs per tick: the default spanning tree is always under
    it; a dense full graph (where labels can't clear every edge) skips it. */
export const PAIR_BUDGET = 60_000;

/** Depth of n's padded label box across segment s–t, with the unit normal
    towards the label; null when apart (separating-axis test). */
function crossing(n: ClearNode, s: ClearNode, t: ClearNode, pad: number) {
  const hw = n.halfWidth + pad;
  const hh = n.fontSize * 0.6 + pad;
  if (Math.max(s.x, t.x) <= n.x - hw || Math.min(s.x, t.x) >= n.x + hw) return null;
  if (Math.max(s.y, t.y) <= n.y - hh || Math.min(s.y, t.y) >= n.y + hh) return null;
  const len = Math.hypot(t.x - s.x, t.y - s.y);
  if (len < 1e-6) return null;
  const nx = -(t.y - s.y) / len;
  const ny = (t.x - s.x) / len;
  const d = (n.x - s.x) * nx + (n.y - s.y) * ny;
  const reach = hw * Math.abs(nx) + hh * Math.abs(ny);
  if (Math.abs(d) >= reach) return null;
  const side = d < 0 ? -1 : 1;
  return { depth: reach - Math.abs(d), nx: nx * side, ny: ny * side };
}

/** How many labels an edge they are not an end of runs through. */
export function countLabelEdgeCrossings(nodes: ClearNode[], edges: Seg[], pad = 0) {
  return nodes.filter((n) =>
    edges.some((e) => e.source !== n && e.target !== n && crossing(n, e.source, e.target, pad))
  ).length;
}

/** d3 force: push each label off the edges it is not an end of. The push is
    shared: the label moves along the edge's normal while the edge's ends
    swing gently the other way (the end farther from the label moves more),
    so a spoke can give way instead of the label being trapped between
    neighbouring spokes. Not guaranteed to converge on a dense star;
    settleEdgeClearance finishes the job. */
export function forceEdgeClearance(edges: Seg[], pad = EDGE_CLEARANCE) {
  let nodes: ClearNode[] = [];
  const force = (alpha: number) => {
    for (const e of edges) {
      const s = e.source;
      const t = e.target;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) continue;
      for (const n of nodes) {
        if (n === s || n === t) continue;
        const c = crossing(n, s, t, pad);
        if (!c) continue;
        const k = c.depth * alpha;
        // where along the edge the label sits (0 = source end, 1 = target end)
        const u = Math.min(1, Math.max(0, ((n.x - s.x) * dx + (n.y - s.y) * dy) / len2));
        n.vx = (n.vx ?? 0) + c.nx * k;
        n.vy = (n.vy ?? 0) + c.ny * k;
        // the edge's ends swing the other way; the farther end moves more
        const ws = u * 0.1;
        const wt = (1 - u) * 0.1;
        s.vx = (s.vx ?? 0) - c.nx * k * ws;
        s.vy = (s.vy ?? 0) - c.ny * k * ws;
        t.vx = (t.vx ?? 0) - c.nx * k * wt;
        t.vy = (t.vy ?? 0) - c.ny * k * wt;
      }
    }
  };
  force.initialize = (ns: SimulationNodeDatum[]) => {
    nodes = ns as unknown as ClearNode[];
  };
  return force;
}

/** True when n's padded box overlaps another label's box. */
function overlapsLabel(n: ClearNode, nodes: ClearNode[], pad: number) {
  const hh = n.fontSize * 0.6 + pad;
  return nodes.some(
    (m) =>
      m !== n &&
      Math.abs(m.x - n.x) < m.halfWidth + n.halfWidth + pad &&
      Math.abs(m.y - n.y) < m.fontSize * 0.6 + hh
  );
}

/** Deterministic last resort for labels the forces could not free: move each
    to the nearest spot (searched on growing rings) that lowers the network's
    total crossing count, since moving a word also moves the edges it ends,
    preferring spots that also clear other labels. */
function freeStuckLabels(nodes: ClearNode[], edges: Seg[], pad: number) {
  const dirs = 24;
  let total = countLabelEdgeCrossings(nodes, edges, pad);
  for (let pass = 0; pass < 12 && total > 0; pass++) {
    let moved = false;
    // movers: each stuck word and the words at the ends of the edges on it
    const movers = new Set<ClearNode>();
    for (const n of nodes) {
      for (const e of edges) {
        if (e.source === n || e.target === n || !crossing(n, e.source, e.target, pad)) continue;
        movers.add(n).add(e.source).add(e.target);
      }
    }
    for (const n of Array.from(movers)) {
      if (total === 0) break;
      const x0 = n.x;
      const y0 = n.y;
      let fallback: { x: number; y: number; total: number } | null = null;
      let best: { x: number; y: number; total: number } | null = null;
      for (let r = 4; r <= 700 && !best; r += 10) {
        for (let k = 0; k < dirs; k++) {
          const a = (k / dirs) * Math.PI * 2;
          n.x = x0 + Math.cos(a) * r;
          n.y = y0 + Math.sin(a) * r;
          const c = countLabelEdgeCrossings(nodes, edges, pad);
          if (c >= total) continue;
          if (!overlapsLabel(n, nodes, 0)) {
            best = { x: n.x, y: n.y, total: c };
            break;
          }
          if (!fallback || c < fallback.total) fallback = { x: n.x, y: n.y, total: c };
        }
      }
      const to = best ?? fallback;
      n.x = to ? to.x : x0;
      n.y = to ? to.y : y0;
      if (to) {
        total = to.total;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** After the main run, drop every pull but collide and clearance and tick at
    full strength until no label is on a foreign edge (at most 300 ticks);
    any label still on an edge is then moved directly to the nearest free
    spot, so the result does not depend on the forces converging. */
export function settleEdgeClearance(
  sim: Simulation<SimulationNodeDatum, undefined>,
  nodes: ClearNode[],
  edges: Seg[]
) {
  sim.force("link", null).force("charge", null).force("x", null).force("y", null);
  sim.alpha(1).alphaDecay(0);
  for (let i = 0; i < 300 && countLabelEdgeCrossings(nodes, edges, EDGE_CLEARANCE) > 0; i++) sim.tick();
  if (countLabelEdgeCrossings(nodes, edges, EDGE_CLEARANCE) > 0) freeStuckLabels(nodes, edges, EDGE_CLEARANCE);
}
