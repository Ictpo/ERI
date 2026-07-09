"use client";

import * as React from "react";
import * as d3 from "d3";
import { Download, Maximize2, RotateCw, X } from "lucide-react";
import type { SimilarityEdge, SimilarityResult } from "@/lib/types";
import { categoryColor } from "@/lib/palette";
import { downloadSvg } from "@/lib/export";
import { formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Metric = "cooc" | "jaccard" | "cosine";

const METRIC_LABEL: Record<Metric, string> = {
  cooc: "Co-occurrence",
  jaccard: "Jaccard",
  cosine: "Cosine",
};

const VIEW_W = 760;
const VIEW_H = 560;

type LaidNode = {
  id: string;
  freq: number;
  community: number;
  x: number;
  y: number;
  fontSize: number;
  halfWidth: number;
};

type LaidEdge = {
  source: string;
  target: string;
  weight: number;
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type Hull = { community: number; path: string };

/** Maximum spanning tree (Kruskal over descending weights) — the classic
    Iramuteq "arbre maximum" rendering of a similarity graph. */
function maxSpanningTree<E extends { source: string; target: string }>(
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

/** Pad a set of points and return a smooth closed contour around them. */
function communityContour(points: [number, number][], pad: number): string {
  const expanded: [number, number][] = [];
  const STEPS = 8;
  for (const [x, y] of points) {
    for (let i = 0; i < STEPS; i++) {
      const a = (i / STEPS) * 2 * Math.PI;
      expanded.push([x + pad * Math.cos(a), y + pad * Math.sin(a)]);
    }
  }
  const hull = d3.polygonHull(expanded);
  if (!hull) return "";
  const line = d3
    .line<[number, number]>()
    .curve(d3.curveCatmullRomClosed.alpha(0.8));
  return line(hull) ?? "";
}

/** Run the force simulation synchronously; returns positioned nodes. */
function computeLayout(
  nodes: { id: string; freq: number; community: number }[],
  edges: { source: string; target: string; weight: number }[],
  maxFreq: number,
  maxWeight: number,
  seed: number
): LaidNode[] {
  const rng = d3.randomLcg(seed || 0.42);
  const simNodes = nodes.map((n, i) => {
    const fontSize = 11 + 22 * Math.sqrt(n.freq / maxFreq);
    return {
      ...n,
      index: i,
      fontSize,
      halfWidth: Math.max(fontSize * 0.75, n.id.length * fontSize * 0.29),
      // Deterministic ring initialization (jittered by the seeded RNG).
      x: VIEW_W / 2 + 160 * Math.cos((i / nodes.length) * 2 * Math.PI) + 40 * (rng() - 0.5),
      y: VIEW_H / 2 + 160 * Math.sin((i / nodes.length) * 2 * Math.PI) + 40 * (rng() - 0.5),
    };
  });
  const byId = new Map(simNodes.map((n) => [n.id, n]));
  const simEdges = edges
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => ({ ...e }));

  // Spatially separate communities: each gets an anchor on a circle and its
  // members are gently pulled toward it, so contours don't pile up centrally.
  const communities = Array.from(new Set(nodes.map((n) => n.community))).sort(
    (a, b) => a - b
  );
  const anchor = new Map<number, { x: number; y: number }>();
  communities.forEach((c, i) => {
    const a = (i / Math.max(1, communities.length)) * 2 * Math.PI - Math.PI / 2;
    const r = communities.length > 1 ? 170 : 0;
    anchor.set(c, {
      x: VIEW_W / 2 + r * Math.cos(a),
      y: VIEW_H / 2 + r * Math.sin(a),
    });
  });

  const sim = d3
    .forceSimulation(simNodes as d3.SimulationNodeDatum[])
    .force(
      "link",
      d3
        .forceLink(simEdges as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
        .id((d) => (d as unknown as LaidNode).id)
        .distance(
          (l) => 60 + 90 * (1 - (l as unknown as { weight: number }).weight / (maxWeight || 1))
        )
        .strength(
          (l) => 0.2 + 0.6 * ((l as unknown as { weight: number }).weight / (maxWeight || 1))
        )
    )
    .force("charge", d3.forceManyBody().strength(-180))
    .force(
      "collide",
      d3
        .forceCollide<d3.SimulationNodeDatum>()
        .radius((d) => (d as unknown as LaidNode).halfWidth + 6)
        .iterations(2)
    )
    .force(
      "x",
      d3
        .forceX<d3.SimulationNodeDatum>((d) => {
          const c = (d as unknown as LaidNode).community;
          return anchor.get(c)?.x ?? VIEW_W / 2;
        })
        .strength(0.09)
    )
    .force(
      "y",
      d3
        .forceY<d3.SimulationNodeDatum>((d) => {
          const c = (d as unknown as LaidNode).community;
          return anchor.get(c)?.y ?? VIEW_H / 2;
        })
        .strength(0.11)
    )
    .stop();

  for (let i = 0; i < 300; i++) sim.tick();
  return simNodes as unknown as LaidNode[];
}

export function SimilarityView({ result }: { result: SimilarityResult }) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const zoomGroupRef = React.useRef<SVGGElement>(null);
  const [metric, setMetric] = React.useState<Metric>("cooc");
  const [minFreq, setMinFreq] = React.useState(0);
  const [minWeight, setMinWeight] = React.useState(0);
  const [showCommunities, setShowCommunities] = React.useState(true);
  const [treeOnly, setTreeOnly] = React.useState(true);
  const [selectedNode, setSelectedNode] = React.useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = React.useState<string | null>(null);
  const [layoutSeed, setLayoutSeed] = React.useState(1);

  const freqDomain = React.useMemo(() => {
    const freqs = result.nodes.map((n) => n.freq);
    return { min: Math.min(0, ...freqs), max: Math.max(1, ...freqs) };
  }, [result.nodes]);

  const weightDomain = React.useMemo(() => {
    const weights = result.edges.map((e) => e[metric]);
    const max = weights.length ? Math.max(...weights) : 1;
    return metric === "cooc"
      ? { min: 0, max: Math.ceil(max), step: 1 }
      : { min: 0, max: Math.max(0.01, Number(max.toFixed(2))), step: 0.01 };
  }, [result.edges, metric]);

  React.useEffect(() => {
    setMinWeight(0);
  }, [metric]);

  const visible = React.useMemo(() => {
    const keptNodes = result.nodes.filter((n) => n.freq >= minFreq);
    const nodeIds = new Set(keptNodes.map((n) => n.id));
    let keptEdges = result.edges.filter(
      (e) =>
        e[metric] >= minWeight && nodeIds.has(e.source) && nodeIds.has(e.target)
    );
    if (treeOnly) {
      keptEdges = maxSpanningTree(
        keptNodes.map((n) => n.id),
        keptEdges,
        (e) => e[metric]
      );
    }
    return { nodes: keptNodes, edges: keptEdges };
  }, [result, metric, minFreq, minWeight, treeOnly]);

  const maxFreq = React.useMemo(
    () => Math.max(1, ...result.nodes.map((n) => n.freq)),
    [result.nodes]
  );
  const maxWeight = React.useMemo(() => {
    const weights = result.edges.map((e) => e[metric]);
    return weights.length ? Math.max(...weights) : 1;
  }, [result.edges, metric]);

  // Synchronous force layout (recomputed on filter/metric/seed changes).
  const laidNodes = React.useMemo(
    () =>
      computeLayout(
        visible.nodes,
        visible.edges.map((e) => ({
          source: e.source,
          target: e.target,
          weight: e[metric],
        })),
        maxFreq,
        maxWeight,
        layoutSeed
      ),
    [visible, metric, maxFreq, maxWeight, layoutSeed]
  );

  const nodeById = React.useMemo(
    () => new Map(laidNodes.map((n) => [n.id, n])),
    [laidNodes]
  );

  const laidEdges: LaidEdge[] = React.useMemo(
    () =>
      visible.edges.flatMap((e) => {
        const s = nodeById.get(e.source);
        const t = nodeById.get(e.target);
        if (!s || !t) return [];
        return [
          {
            source: e.source,
            target: e.target,
            weight: e[metric],
            width: 0.6 + 4.5 * (maxWeight > 0 ? e[metric] / maxWeight : 0),
            x1: s.x,
            y1: s.y,
            x2: t.x,
            y2: t.y,
          },
        ];
      }),
    [visible.edges, nodeById, metric, maxWeight]
  );

  // Translucent contour per community, drawn beneath edges and labels.
  const hulls: Hull[] = React.useMemo(() => {
    if (!showCommunities) return [];
    const groups = d3.group(laidNodes, (n) => n.community);
    const out: Hull[] = [];
    groups.forEach((members, community) => {
      if (community < 0) return;
      const pts = members.map((m) => [m.x, m.y] as [number, number]);
      const pad = 14 + Math.max(...members.map((m) => m.halfWidth)) * 0.6;
      const path = communityContour(pts, pad);
      if (path) out.push({ community, path });
    });
    return out.sort((a, b) => a.community - b.community);
  }, [laidNodes, showCommunities]);

  // Fit the drawing into the viewBox with padding.
  const viewBox = React.useMemo(() => {
    if (laidNodes.length === 0) return `0 0 ${VIEW_W} ${VIEW_H}`;
    const xs = laidNodes.map((n) => n.x);
    const ys = laidNodes.map((n) => n.y);
    const padX = 70;
    const padY = 46;
    const minX = Math.min(...xs) - padX;
    const maxX = Math.max(...xs) + padX;
    const minY = Math.min(...ys) - padY;
    const maxY = Math.max(...ys) + padY;
    return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  }, [laidNodes]);

  // Pan / zoom.
  React.useEffect(() => {
    const svg = svgRef.current;
    const group = zoomGroupRef.current;
    if (!svg || !group) return;
    const sel = d3.select(svg);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 8])
      .on("zoom", (event) => {
        group.setAttribute("transform", event.transform.toString());
      });
    sel.call(zoom);
    sel.on("dblclick.zoom", null);
    return () => {
      sel.on(".zoom", null);
    };
  }, []);

  const resetView = React.useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    d3.select(svg)
      .transition()
      .duration(250)
      .call(
        d3.zoom<SVGSVGElement, unknown>().transform as never,
        d3.zoomIdentity
      );
    zoomGroupRef.current?.setAttribute("transform", "");
  }, []);

  const neighborhood = React.useMemo(() => {
    if (!hoveredNode) return null;
    const set = new Set<string>([hoveredNode]);
    for (const e of laidEdges) {
      if (e.source === hoveredNode) set.add(e.target);
      if (e.target === hoveredNode) set.add(e.source);
    }
    return set;
  }, [hoveredNode, laidEdges]);

  function exportSvg() {
    setHoveredNode(null);
    // Let React re-render without hover artifacts before serializing.
    requestAnimationFrame(() => {
      if (svgRef.current) downloadSvg(svgRef.current, "similarity-network");
    });
  }

  const selectedEdges: (SimilarityEdge & { other: string })[] =
    React.useMemo(() => {
      if (!selectedNode) return [];
      return result.edges
        .filter((e) => e.source === selectedNode || e.target === selectedNode)
        .map((e) => ({
          ...e,
          other: e.source === selectedNode ? e.target : e.source,
        }))
        .sort((a, b) => b[metric] - a[metric])
        .slice(0, 12);
    }, [selectedNode, result.edges, metric]);

  const selectedNodeData = selectedNode
    ? result.nodes.find((n) => n.id === selectedNode)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {formatNumber(result.n_segments)} segments
        </Badge>
        <Badge variant="secondary">
          {visible.nodes.length}/{result.nodes.length} nodes
        </Badge>
        <Badge variant="secondary">
          {visible.edges.length}/{result.edges.length} edges
        </Badge>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={exportSvg}>
            <Download /> SVG
          </Button>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-2">
            <Label>Edge weight metric</Label>
            <Select value={metric} onValueChange={(m) => setMetric(m as Metric)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METRIC_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>
              Min node freq: <span className="tabular-nums">{minFreq}</span>
            </Label>
            <Slider
              min={freqDomain.min}
              max={freqDomain.max}
              step={1}
              value={[minFreq]}
              onValueChange={([v]) => setMinFreq(v)}
            />
          </div>
          <div className="grid gap-2">
            <Label>
              Min edge weight:{" "}
              <span className="tabular-nums">
                {metric === "cooc" ? minWeight : minWeight.toFixed(2)}
              </span>
            </Label>
            <Slider
              min={weightDomain.min}
              max={weightDomain.max}
              step={weightDomain.step}
              value={[minWeight]}
              onValueChange={([v]) => setMinWeight(v)}
            />
          </div>
          <div className="flex items-end justify-between gap-2 pb-1">
            <div className="grid gap-1.5">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Switch checked={treeOnly} onCheckedChange={setTreeOnly} />
                Max spanning tree
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Switch
                  checked={showCommunities}
                  onCheckedChange={setShowCommunities}
                />
                Community areas
              </label>
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={resetView}
                aria-label="Reset view"
              >
                <Maximize2 />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setLayoutSeed((s) => s + 1)}
                aria-label="Re-run layout"
              >
                <RotateCw />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Graph + side card */}
      <div className="relative">
        <Card>
          <svg
            ref={svgRef}
            viewBox={viewBox}
            className="h-[520px] w-full cursor-grab rounded-lg active:cursor-grabbing"
            role="img"
            aria-label="Similarity network graph"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedNode(null);
            }}
          >
            <g ref={zoomGroupRef}>
              {/* Community contours */}
              {hulls.map((h) => (
                <path
                  key={h.community}
                  d={h.path}
                  fill={categoryColor(h.community)}
                  fillOpacity={0.16}
                  stroke={categoryColor(h.community)}
                  strokeOpacity={0.35}
                  strokeWidth={1.5}
                />
              ))}
              {/* Edges */}
              {laidEdges.map((e, i) => {
                const inHood =
                  neighborhood &&
                  (e.source === hoveredNode || e.target === hoveredNode);
                return (
                  <line
                    key={i}
                    x1={e.x1}
                    y1={e.y1}
                    x2={e.x2}
                    y2={e.y2}
                    stroke={inHood ? "#6366f1" : "#94a3b8"}
                    strokeWidth={e.width}
                    strokeOpacity={
                      neighborhood ? (inHood ? 0.9 : 0.06) : 0.35
                    }
                    strokeLinecap="round"
                  />
                );
              })}
              {/* Word labels */}
              {laidNodes.map((n) => {
                const dimmed = neighborhood ? !neighborhood.has(n.id) : false;
                const color = showCommunities
                  ? categoryColor(n.community)
                  : "#1e293b";
                return (
                  <text
                    key={n.id}
                    x={n.x}
                    y={n.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={n.fontSize}
                    fontWeight={n.freq / maxFreq > 0.45 ? 700 : 600}
                    fill={color}
                    opacity={dimmed ? 0.15 : 1}
                    stroke="#ffffff"
                    strokeWidth={Math.max(2, n.fontSize / 5)}
                    strokeOpacity={dimmed ? 0 : 0.85}
                    paintOrder="stroke"
                    className="cursor-pointer select-none"
                    textDecoration={
                      selectedNode === n.id ? "underline" : undefined
                    }
                    onMouseEnter={() => setHoveredNode(n.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(n.id);
                    }}
                  >
                    {n.id}
                  </text>
                );
              })}
            </g>
          </svg>
        </Card>
        {selectedNodeData && (
          <Card className="absolute right-3 top-3 w-60 shadow-lg">
            <CardContent className="p-3">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {selectedNodeData.id}
                  </p>
                  <p className="text-xs text-slate-500">
                    freq {formatNumber(selectedNodeData.freq)} · community{" "}
                    {selectedNodeData.community}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  aria-label="Close node details"
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Strongest edges ({METRIC_LABEL[metric]})
              </p>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
                {selectedEdges.map((e, i) => (
                  <li
                    key={i}
                    className="flex justify-between rounded px-1.5 py-1 hover:bg-slate-50"
                  >
                    <span className="truncate font-medium text-slate-700">
                      {e.other}
                    </span>
                    <span className="ml-2 tabular-nums text-slate-500">
                      {metric === "cooc" ? e[metric] : e[metric].toFixed(3)}
                    </span>
                  </li>
                ))}
                {selectedEdges.length === 0 && (
                  <li className="py-2 text-slate-400">No edges.</li>
                )}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
      <p className="text-xs text-slate-400">
        Scroll to zoom, drag to pan. Hover a word to highlight its
        neighborhood; click it to list its strongest edges. Export is clean
        vector SVG.
      </p>
    </div>
  );
}
