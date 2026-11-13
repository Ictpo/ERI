"use client";

import * as React from "react";
import * as d3 from "d3";
import { Download, Expand, Maximize2, RotateCcw, RotateCw, Undo2, X } from "lucide-react";
import type { SimilarityEdge, SimilarityResult } from "@/lib/types";
import { CHART_FONT } from "@/lib/export";
import { categoryColor, wordPaint } from "@/lib/palette";
import { cn, formatNumber } from "@/lib/utils";
import { maxSpanningTree } from "@/lib/mst";
import { EDGE_CLEARANCE, PAIR_BUDGET, forceEdgeClearance, settleEdgeClearance, type Seg } from "@/lib/edge-clearance";
import { ExportDialog } from "./export-dialog";
import { LargeView } from "./large-view";
import { LabelHandles, type LabelHandle } from "./label-handles";
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
  id: string; // raw form — identity for edges, keys and the simulation
  label: string; // display form — protection underscores stripped
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

/** Room (px) round a word in its community's area, and half the width of the
    band along a tie inside a community: narrower than the 6 px EDGE_CLEARANCE
    the layout keeps round foreign ties, so a band never reaches another word. */
const AREA_PAD = 4;
const AREA_BAND = 5;

type Area = {
  community: number;
  boxes: { x: number; y: number; w: number; h: number }[];
  bands: { x1: number; y1: number; x2: number; y2: number }[];
};

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
    const label = n.id.replace(/_+$/, "");
    return {
      ...n,
      label,
      index: i,
      fontSize,
      // Collision radius from the DISPLAYED string, not the raw id.
      halfWidth: Math.max(fontSize * 0.75, label.length * fontSize * 0.29),
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

  // Labels must clear foreign edges too (lib/edge-clearance). forceLink swaps
  // edge ids for node objects, so `segs` holds nodes once the run starts.
  const clear = simNodes.length * simEdges.length <= PAIR_BUDGET;
  const segs = simEdges as unknown as Seg[];
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
    .force("edges", clear ? forceEdgeClearance(segs, EDGE_CLEARANCE) : null)
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
  if (clear) settleEdgeClearance(sim, simNodes as unknown as LaidNode[], segs);
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
  const [exportOpen, setExportOpen] = React.useState(false);
  const [spread, setSpread] = React.useState(1);
  // Large view: the same drawing in a window-sized panel.
  const [large, setLarge] = React.useState(false);
  // Earlier layout seeds, so "Previous layout" can undo a re-run (the layout
  // is seeded, so an old seed redraws exactly the old layout).
  const [seedHistory, setSeedHistory] = React.useState<number[]>([]);
  const lastSeed = React.useRef(1);
  // Words moved by hand in the Download preview: offsets in figure units,
  // keyed by the layout they were made on, so a filter change or a re-run
  // never misplaces them and returning to that layout restores them.
  const [handMoved, setHandMoved] = React.useState<
    Record<string, { dx: number; dy: number }>
  >({});
  const [moveByHand, setMoveByHand] = React.useState(false);

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
  const rawLaidNodes = React.useMemo(
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

  // Word-spacing control: scale positions away from the centroid while
  // font sizes stay constant, so labels get room without re-layout.
  const spreadNodes = React.useMemo(() => {
    if (spread === 1 || rawLaidNodes.length === 0) return rawLaidNodes;
    const cx =
      rawLaidNodes.reduce((s, n) => s + n.x, 0) / rawLaidNodes.length;
    const cy =
      rawLaidNodes.reduce((s, n) => s + n.y, 0) / rawLaidNodes.length;
    return rawLaidNodes.map((n) => ({
      ...n,
      x: cx + (n.x - cx) * spread,
      y: cy + (n.y - cy) * spread,
    }));
  }, [rawLaidNodes, spread]);

  // Words moved by hand apply on top, for the layout they were made on.
  const layoutKey = `${metric}|${minFreq}|${minWeight}|${treeOnly}|${layoutSeed}|`;
  const laidNodes = React.useMemo(
    () =>
      spreadNodes.map((n) => {
        const m = handMoved[`${layoutKey}${n.id}`];
        return m ? { ...n, x: n.x + m.dx, y: n.y + m.dy } : n;
      }),
    [spreadNodes, handMoved, layoutKey]
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

  // Community areas hug their own words: a padded box round each member's
  // label, joined by bands along ties inside the community. Unlike a convex
  // hull round scattered members, they never take in another community's word.
  const areas: Area[] = React.useMemo(() => {
    if (!showCommunities) return [];
    const out: Area[] = [];
    d3.group(laidNodes, (n) => n.community).forEach((members, community) => {
      if (community < 0) return;
      const boxes = members.map((m) => ({
        x: m.x - m.halfWidth - AREA_PAD,
        y: m.y - m.fontSize * 0.6 - AREA_PAD,
        w: 2 * (m.halfWidth + AREA_PAD),
        h: m.fontSize * 1.2 + 2 * AREA_PAD,
      }));
      const bands = laidEdges
        .filter((e) => nodeById.get(e.source)?.community === community && nodeById.get(e.target)?.community === community)
        .map(({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 }));
      out.push({ community, boxes, bands });
    });
    return out.sort((a, b) => a.community - b.community);
  }, [laidNodes, laidEdges, nodeById, showCommunities]);

  // Fit the drawing into the viewBox: the old fixed pad around node centres
  // is the minimum, widened wherever a label (estimated half-width + white
  // halo) or its community area (AREA_PAD round the label) reaches further,
  // so exports, which are cropped to the viewBox, never cut words or areas.
  const viewBox = React.useMemo(() => {
    if (laidNodes.length === 0) return `0 0 ${VIEW_W} ${VIEW_H}`;
    const padX = 70;
    const padY = 46;
    const EDGE = 6;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of laidNodes) {
      const halo = Math.max(2, n.fontSize / 5) / 2;
      const rx = Math.max(padX, n.halfWidth + Math.max(halo, AREA_PAD) + EDGE);
      const ry = Math.max(
        padY,
        Math.max(n.fontSize / 2 + halo, n.fontSize * 0.6 + AREA_PAD) + EDGE
      );
      minX = Math.min(minX, n.x - rx);
      maxX = Math.max(maxX, n.x + rx);
      minY = Math.min(minY, n.y - ry);
      maxY = Math.max(maxY, n.y + ry);
    }
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

  function openExport() {
    setHoveredNode(null);
    setExportOpen(true);
  }

  function rerunLayout() {
    setSeedHistory((h) => [...h, layoutSeed]);
    lastSeed.current += 1;
    setLayoutSeed(lastSeed.current);
  }

  function previousLayout() {
    const prev = seedHistory[seedHistory.length - 1];
    if (prev === undefined) return;
    setSeedHistory((h) => h.slice(0, -1));
    setLayoutSeed(prev);
  }

  // Grab areas for the Download preview: each word's estimated box.
  const wordHandles: LabelHandle[] = laidNodes.map((n) => ({
    key: n.id,
    text: n.label,
    x: n.x - n.halfWidth,
    y: n.y - n.fontSize / 2,
    w: n.halfWidth * 2,
    h: n.fontSize,
  }));
  const layoutHasHandMoved = Object.keys(handMoved).some((k) =>
    k.startsWith(layoutKey)
  );

  function moveWord(id: string, dx: number, dy: number) {
    const key = `${layoutKey}${id}`;
    setHandMoved((prev) => {
      const m = prev[key] ?? { dx: 0, dy: 0 };
      return { ...prev, [key]: { dx: m.dx + dx, dy: m.dy + dy } };
    });
  }

  function resetHandMoved() {
    setHandMoved((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([k]) => !k.startsWith(layoutKey))
      )
    );
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

  // The strongest-edges list as one sentence, announced to screen readers
  // whenever a word is selected (Enter/Space or click).
  const selectedSummary = selectedNodeData
    ? `${selectedNodeData.id.replace(/_+$/, "")}, strongest edges (${METRIC_LABEL[metric]}): ${
        selectedEdges
          .map(
            (e) =>
              `${e.other.replace(/_+$/, "")} ${
                metric === "cooc" ? e[metric] : e[metric].toFixed(3)
              }`
          )
          .join(", ") || "none"
      }.`
    : "";

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
        <div className="ml-auto flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setLarge(true)}>
            <Expand /> Large view
          </Button>
          <Button variant="outline" size="sm" onClick={openExport}>
            <Download /> Download
          </Button>
        </div>
      </div>

      {/* Controls */}
      <Card>
        {/* Columns follow the card's own width, not the window's, so the
            controls never squeeze below a readable size in the results pane. */}
        <CardContent className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-4 p-4">
          <div className="grid gap-2">
            <Label id="sim-metric-label">Edge weight metric</Label>
            <Select value={metric} onValueChange={(m) => setMetric(m as Metric)}>
              <SelectTrigger aria-labelledby="sim-metric-label">
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
              aria-label="Min node freq"
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
              aria-label="Min edge weight"
              min={weightDomain.min}
              max={weightDomain.max}
              step={weightDomain.step}
              value={[minWeight]}
              onValueChange={([v]) => setMinWeight(v)}
            />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-2 pb-1">
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
                onClick={previousLayout}
                disabled={seedHistory.length === 0}
                aria-label="Previous layout"
              >
                <Undo2 />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={rerunLayout}
                aria-label="Re-run layout"
              >
                <RotateCw />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Graph + side card */}
      <LargeView open={large} onClose={() => setLarge(false)}>
        <Card className={large ? "min-h-0 flex-1" : undefined}>
          <svg
            ref={svgRef}
            viewBox={viewBox}
            className={cn("w-full cursor-grab rounded-lg active:cursor-grabbing", large ? "h-full" : "h-[520px]")}
            role="group"
            aria-label="Similarity network graph"
            fontFamily={CHART_FONT}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedNode(null);
            }}
          >
            <g ref={zoomGroupRef} data-zoom-group="true">
              {/* Community areas: one translucent layer per community, so a
                  member's box and its bands merge into one even tint. */}
              {areas.map((a) => (
                <g
                  key={a.community}
                  opacity={0.16}
                  fill={categoryColor(a.community)}
                  stroke={categoryColor(a.community)}
                >
                  {a.bands.map((b, i) => (
                    <line
                      key={`l${i}`}
                      x1={b.x1}
                      y1={b.y1}
                      x2={b.x2}
                      y2={b.y2}
                      strokeWidth={2 * AREA_BAND}
                      strokeLinecap="round"
                    />
                  ))}
                  {a.boxes.map((b, i) => (
                    <rect
                      key={`r${i}`}
                      x={b.x}
                      y={b.y}
                      width={b.w}
                      height={b.h}
                      rx={AREA_PAD + 2}
                      stroke="none"
                    />
                  ))}
                </g>
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
                    // The app's own indigo-500 (rose) and slate-600 (warm) from
                    // tailwind.config.ts, not stock Tailwind's blue-violet/slate.
                    stroke={inHood ? "#E23B80" : "#645047"}
                    strokeWidth={e.width}
                    strokeOpacity={
                      neighborhood ? (inHood ? 0.95 : 0.08) : 0.65
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
                  : "#312621";
                // Most palette hues fail AA as text on white (orange 2.25:1,
                // sky blue 2.31:1). wordPaint (lib/palette) keeps the community
                // hue on every word and puts at least 4.5:1 between the
                // letters and their edge.
                const paint = wordPaint(color, n.fontSize);
                return (
                  <text
                    key={n.id}
                    x={n.x}
                    y={n.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={n.fontSize}
                    fontWeight={n.freq / maxFreq > 0.45 ? 700 : 600}
                    fill={paint.fill}
                    opacity={dimmed ? 0.15 : 1}
                    stroke={paint.stroke}
                    strokeWidth={paint.strokeWidth}
                    strokeOpacity={dimmed ? 0 : paint.strokeOpacity}
                    paintOrder="stroke"
                    className="cursor-pointer select-none"
                    textDecoration={
                      selectedNode === n.id ? "underline" : undefined
                    }
                    // Keyboard path to the mouse reading: Tab to a word
                    // highlights its neighborhood (like hover), Enter or Space
                    // lists its strongest edges (like click), Escape closes it.
                    tabIndex={0}
                    role="button"
                    aria-pressed={selectedNode === n.id}
                    onMouseEnter={() => setHoveredNode(n.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onFocus={() => setHoveredNode(n.id)}
                    onBlur={() => setHoveredNode(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(n.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedNode(n.id);
                      } else if (e.key === "Escape") {
                        setSelectedNode(null);
                      }
                    }}
                  >
                    {n.label}
                  </text>
                );
              })}
            </g>
          </svg>
        </Card>
        <p className="sr-only" aria-live="polite">
          {selectedSummary}
        </p>
        {selectedNodeData && (
          <Card className="absolute right-3 top-3 w-60 shadow-lg">
            <CardContent className="p-3">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {selectedNodeData.id.replace(/_+$/, "")}
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
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Strongest edges ({METRIC_LABEL[metric]})
              </p>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
                {selectedEdges.map((e, i) => (
                  <li
                    key={i}
                    className="flex justify-between rounded px-1.5 py-1 hover:bg-slate-50"
                  >
                    <span className="truncate font-medium text-slate-700">
                      {e.other.replace(/_+$/, "")}
                    </span>
                    <span className="ml-2 tabular-nums text-slate-500">
                      {metric === "cooc" ? e[metric] : e[metric].toFixed(3)}
                    </span>
                  </li>
                ))}
                {selectedEdges.length === 0 && (
                  <li className="py-2 text-slate-500">No edges.</li>
                )}
              </ul>
            </CardContent>
          </Card>
        )}
      </LargeView>
      <p className="text-xs text-slate-500">
        Scroll to zoom, drag to pan. Hover a word, or Tab to it, to highlight
        its neighborhood; click it or press Enter to list its strongest edges
        (Esc closes the list). Download opens a preview with a spacing control
        (SVG or PNG).
      </p>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        filename="similarity-network"
        getSvg={() => svgRef.current}
        version={`${spread}|${metric}|${minFreq}|${minWeight}|${treeOnly}|${showCommunities}|${layoutSeed}|${JSON.stringify(handMoved)}`}
        overlay={
          moveByHand ? (
            <LabelHandles handles={wordHandles} onMove={moveWord} />
          ) : undefined
        }
        controls={
          <div className="grid gap-2 sm:col-span-2">
            <Label>
              Word spacing:{" "}
              <span className="tabular-nums">{spread.toFixed(2)}×</span>
            </Label>
            <Slider
              aria-label="Word spacing"
              min={1}
              max={2.5}
              step={0.25}
              value={[spread]}
              onValueChange={([v]) => setSpread(v)}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Switch checked={moveByHand} onCheckedChange={setMoveByHand} />
                Move words by hand
              </label>
              {layoutHasHandMoved && (
                <Button variant="ghost" size="sm" onClick={resetHandMoved}>
                  <RotateCcw /> Reset moved words
                </Button>
              )}
              {moveByHand && (
                <p className="w-full text-xs text-slate-600">
                  Drag a word in the preview, or Tab to it and use the arrow
                  keys (hold Shift for bigger steps). Its links follow it.
                </p>
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}
