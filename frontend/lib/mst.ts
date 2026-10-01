/** Maximum spanning tree (Kruskal over descending weights) — the classic
    Iramuteq "arbre maximum" rendering of a similarity graph. On a
    disconnected graph this is a maximum spanning forest. */
export function maxSpanningTree<E extends { source: string; target: string }>(
  nodeIds: string[],
  edges: E[],
  weight: (e: E) => number
): E[] {
  const parent = new Map<string, string>(nodeIds.map((id) => [id, id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const kept: E[] = [];
  const sorted = [...edges].sort((a, b) => weight(b) - weight(a));
  for (const e of sorted) {
    const rs = find(e.source);
    const rt = find(e.target);
    if (rs !== rt) {
      parent.set(rs, rt);
      kept.push(e);
      if (kept.length === nodeIds.length - 1) break;
    }
  }
  return kept;
}
