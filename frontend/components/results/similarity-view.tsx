"use client";

import * as React from "react";
import cytoscape, { type Core, type NodeSingular } from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";
import { Download, RotateCw, X } from "lucide-react";
import type { SimilarityEdge, SimilarityResult } from "@/lib/types";
import { categoryColor } from "@/lib/palette";
import { downloadDataUrl } from "@/lib/export";
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

let registered = false;
function ensureLayout() {
  if (!registered) {
    cytoscape.use(coseBilkent);
    registered = true;
  }
}

type Metric = "cooc" | "jaccard" | "cosine";

// cose-bilkent-specific options are not covered by the core cytoscape types.
const LAYOUT_OPTIONS = {
  name: "cose-bilkent",
  animate: false,
  idealEdgeLength: 90,
  nodeRepulsion: 6500,
} as unknown as cytoscape.LayoutOptions;

const METRIC_LABEL: Record<Metric, string> = {
  cooc: "Co-occurrence",
  jaccard: "Jaccard",
  cosine: "Cosine",
};

export function SimilarityView({ result }: { result: SimilarityResult }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cyRef = React.useRef<Core | null>(null);
  const [metric, setMetric] = React.useState<Metric>("cooc");
  const [minFreq, setMinFreq] = React.useState(0);
  const [minWeight, setMinWeight] = React.useState(0);
  const [colorByCommunity, setColorByCommunity] = React.useState(true);
  const [selectedNode, setSelectedNode] = React.useState<string | null>(null);

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

  // Clamp weight threshold when the metric changes.
  React.useEffect(() => {
    setMinWeight(0);
  }, [metric]);

  const visible = React.useMemo(() => {
    const keptNodes = result.nodes.filter((n) => n.freq >= minFreq);
    const nodeIds = new Set(keptNodes.map((n) => n.id));
    const keptEdges = result.edges.filter(
      (e) =>
        e[metric] >= minWeight && nodeIds.has(e.source) && nodeIds.has(e.target)
    );
    return { nodes: keptNodes, edges: keptEdges };
  }, [result, metric, minFreq, minWeight]);

  const maxFreq = React.useMemo(
    () => Math.max(1, ...result.nodes.map((n) => n.freq)),
    [result.nodes]
  );
  const maxWeight = React.useMemo(() => {
    const weights = result.edges.map((e) => e[metric]);
    return weights.length ? Math.max(...weights) : 1;
  }, [result.edges, metric]);

  const runLayout = React.useCallback(() => {
    const cy = cyRef.current;
    if (!cy || cy.nodes().length === 0) return;
    cy.layout(LAYOUT_OPTIONS).run();
    cy.fit(undefined, 30);
  }, []);

  // Build / rebuild graph when visible elements change.
  React.useEffect(() => {
    if (!containerRef.current) return;
    ensureLayout();

    const nodeDiameter = (freq: number) =>
      10 + 34 * Math.sqrt(freq / maxFreq);
    const edgeWidth = (w: number) =>
      0.75 + 5 * (maxWeight > 0 ? w / maxWeight : 0);

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...visible.nodes.map((n) => ({
          data: {
            id: n.id,
            label: n.id,
            freq: n.freq,
            community: n.community,
            diameter: nodeDiameter(n.freq),
          },
        })),
        ...visible.edges.map((e, i) => ({
          data: {
            id: `e${i}`,
            source: e.source,
            target: e.target,
            weight: e[metric],
            width: edgeWidth(e[metric]),
          },
        })),
      ],
      style: [
        {
          selector: "node",
          style: {
            width: "data(diameter)",
            height: "data(diameter)",
            label: "data(label)",
            "font-size": 10,
            "font-family": "Inter, system-ui, sans-serif",
            color: "#334155",
            "text-valign": "bottom",
            "text-margin-y": 4,
            "background-color": colorByCommunity
              ? (ele: NodeSingular) =>
                  categoryColor(Number(ele.data("community")))
              : "#4f46e5",
            "border-width": 1.5,
            "border-color": "#ffffff",
          },
        },
        {
          selector: "edge",
          style: {
            width: "data(width)",
            "line-color": "#cbd5e1",
            "curve-style": "haystack",
            opacity: 0.8,
          },
        },
        {
          selector: ".dimmed",
          style: { opacity: 0.12, "text-opacity": 0.1 },
        },
        {
          selector: ".highlighted",
          style: { "line-color": "#818cf8", opacity: 1 },
        },
      ],
      wheelSensitivity: 0.3,
    });

    cy.on("mouseover", "node", (evt) => {
      const node = evt.target as NodeSingular;
      const hood = node.closedNeighborhood();
      cy.elements().not(hood).addClass("dimmed");
      hood.edges().addClass("highlighted");
    });
    cy.on("mouseout", "node", () => {
      cy.elements().removeClass("dimmed").removeClass("highlighted");
    });
    cy.on("tap", "node", (evt) => {
      setSelectedNode((evt.target as NodeSingular).id());
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) setSelectedNode(null);
    });

    cyRef.current = cy;
    if (cy.nodes().length > 0) {
      cy.layout(LAYOUT_OPTIONS).run();
      cy.fit(undefined, 30);
    }

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [visible, colorByCommunity, metric, maxFreq, maxWeight]);

  function exportPng() {
    const cy = cyRef.current;
    if (!cy) return;
    const png = cy.png({ full: true, scale: 2, bg: "#ffffff" });
    downloadDataUrl(png, "similarity-network.png");
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
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {formatNumber(result.n_segments)} segments
        </Badge>
        <Badge variant="secondary">
          {visible.nodes.length}/{result.nodes.length} nodes
        </Badge>
        <Badge variant="secondary">
          {visible.edges.length}/{result.edges.length} edges
        </Badge>
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
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <Switch
                checked={colorByCommunity}
                onCheckedChange={setColorByCommunity}
              />
              Community colors
            </label>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={runLayout}
                aria-label="Re-run layout"
              >
                <RotateCw />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={exportPng}
                aria-label="Export PNG"
              >
                <Download />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Canvas + side card */}
      <div className="relative">
        <Card>
          <div
            ref={containerRef}
            className="h-[460px] w-full rounded-lg"
            role="img"
            aria-label="Similarity network graph"
          />
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
        Hover a node to highlight its neighborhood; click it to list its
        strongest edges. Export is PNG (vector export is not available for the
        canvas renderer).
      </p>
    </div>
  );
}
