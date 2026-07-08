"use client";

import * as React from "react";
import * as d3 from "d3";
import { Download, List, BarChartHorizontal } from "lucide-react";
import type { ChdClass, ChdNode, ChdResult } from "@/lib/types";
import { categoryColor } from "@/lib/palette";
import { downloadSvg } from "@/lib/export";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SVG_WIDTH = 720;
const LEAF_HEIGHT = 64;
const MARGIN = { top: 16, right: 220, bottom: 16, left: 16 };

type LeafPlacement = {
  cls: ChdClass | null;
  classId: number | null;
  x: number;
  y: number;
  size: number;
};

export function ChdView({ result }: { result: ChdResult }) {
  const [selectedClassId, setSelectedClassId] = React.useState<number | null>(
    result.classes[0]?.id ?? null
  );
  const svgRef = React.useRef<SVGSVGElement>(null);

  const classById = React.useMemo(() => {
    const map = new Map<number, ChdClass>();
    result.classes.forEach((c) => map.set(c.id, c));
    return map;
  }, [result.classes]);

  // Stable color per class: index in the classes array.
  const colorForClass = React.useCallback(
    (classId: number | null) => {
      if (classId === null) return "#94a3b8";
      const idx = result.classes.findIndex((c) => c.id === classId);
      return categoryColor(idx === -1 ? classId : idx);
    },
    [result.classes]
  );

  // Layout the binary tree horizontally with d3.
  const { links, leaves, innerNodes, svgHeight } = React.useMemo(() => {
    const root = d3.hierarchy<ChdNode>(result.tree, (d) => d.children ?? null);
    const nLeaves = root.leaves().length;
    const height = Math.max(nLeaves * LEAF_HEIGHT, 200);
    const layout = d3
      .cluster<ChdNode>()
      .size([height, SVG_WIDTH - MARGIN.left - MARGIN.right]);
    layout(root);

    const links: { path: string }[] = [];
    root.links().forEach((link) => {
      const sx = link.source.y ?? 0;
      const sy = link.source.x ?? 0;
      const tx = link.target.y ?? 0;
      const ty = link.target.x ?? 0;
      // elbow path
      links.push({ path: `M${sx},${sy} V${ty} H${tx}` });
    });

    const leaves: LeafPlacement[] = root.leaves().map((leaf) => ({
      cls: leaf.data.class_id !== null ? classById.get(leaf.data.class_id) ?? null : null,
      classId: leaf.data.class_id,
      x: leaf.y ?? 0,
      y: leaf.x ?? 0,
      size: leaf.data.size,
    }));

    const innerNodes = root
      .descendants()
      .filter((d) => d.children)
      .map((d) => ({ x: d.y ?? 0, y: d.x ?? 0, size: d.data.size }));

    return {
      links,
      leaves,
      innerNodes,
      svgHeight: height + MARGIN.top + MARGIN.bottom,
    };
  }, [result.tree, classById]);

  const selected = selectedClassId !== null ? classById.get(selectedClassId) : null;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {formatNumber(result.n_segments)} segments
        </Badge>
        <Badge variant="secondary">
          {formatNumber(result.n_classified)} classified (
          {result.pct_classified.toFixed(1)}%)
        </Badge>
        <Badge variant="secondary">{result.classes.length} classes</Badge>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              svgRef.current && downloadSvg(svgRef.current, "chd-dendrogram")
            }
          >
            <Download /> SVG
          </Button>
        </div>
      </div>

      {/* Dendrogram */}
      <Card>
        <CardContent className="overflow-x-auto p-2">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
            width={SVG_WIDTH}
            height={svgHeight}
            className="mx-auto block max-w-full"
            role="img"
            aria-label="CHD dendrogram"
          >
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {links.map((link, i) => (
                <path
                  key={i}
                  d={link.path}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth={1.5}
                />
              ))}
              {innerNodes.map((node, i) => (
                <circle key={i} cx={node.x} cy={node.y} r={3} fill="#94a3b8" />
              ))}
              {leaves.map((leaf, i) => {
                const color = colorForClass(leaf.classId);
                const isSelected =
                  leaf.classId !== null && leaf.classId === selectedClassId;
                const blockHeight = Math.max(
                  22,
                  Math.min(
                    LEAF_HEIGHT - 14,
                    22 +
                      (leaf.size /
                        Math.max(1, Math.max(...leaves.map((l) => l.size)))) *
                        26
                  )
                );
                const label = leaf.cls
                  ? `Class ${leaf.cls.id} — ${leaf.cls.label}`
                  : "Unclassified";
                const pct = leaf.cls ? `${leaf.cls.pct.toFixed(1)}%` : "";
                return (
                  <g
                    key={i}
                    transform={`translate(${leaf.x},${leaf.y})`}
                    className={leaf.classId !== null ? "cursor-pointer" : undefined}
                    onClick={() =>
                      leaf.classId !== null && setSelectedClassId(leaf.classId)
                    }
                  >
                    <rect
                      x={6}
                      y={-blockHeight / 2}
                      width={200}
                      height={blockHeight}
                      rx={5}
                      fill={color}
                      fillOpacity={isSelected ? 0.95 : 0.75}
                      stroke={isSelected ? "#0f172a" : "none"}
                      strokeWidth={isSelected ? 1.5 : 0}
                    />
                    <text
                      x={14}
                      y={-2}
                      fontSize={11}
                      fontWeight={600}
                      fill="#ffffff"
                      style={{ pointerEvents: "none" }}
                    >
                      {label.length > 32 ? label.slice(0, 31) + "…" : label}
                    </text>
                    <text
                      x={14}
                      y={11}
                      fontSize={10}
                      fill="#ffffff"
                      fillOpacity={0.9}
                      style={{ pointerEvents: "none" }}
                    >
                      {leaf.cls
                        ? `${formatNumber(leaf.size)} segments · ${pct}`
                        : `${formatNumber(leaf.size)} segments`}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </CardContent>
      </Card>

      {/* Class inspector */}
      {selected && (
        <ClassInspector
          cls={selected}
          color={colorForClass(selected.id)}
          allClasses={result.classes}
          onSelect={setSelectedClassId}
          selectedId={selectedClassId}
        />
      )}
    </div>
  );
}

function ClassInspector({
  cls,
  color,
  allClasses,
  onSelect,
  selectedId,
}: {
  cls: ChdClass;
  color: string;
  allClasses: ChdClass[];
  onSelect: (id: number) => void;
  selectedId: number | null;
}) {
  const [mode, setMode] = React.useState<"chart" | "table">("chart");
  const topWords = cls.words.slice(0, 25);
  const maxChi2 = Math.max(1, ...topWords.map((w) => w.chi2));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {allClasses.map((c, i) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                c.id === selectedId
                  ? "border-transparent text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              )}
              style={
                c.id === selectedId ? { backgroundColor: categoryColor(i) } : undefined
              }
            >
              Class {c.id} · {c.pct.toFixed(1)}%
            </button>
          ))}
        </div>
        <CardTitle className="mt-2 flex items-center gap-2 text-sm">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          Class {cls.id} — {cls.label}
          <span className="font-normal text-slate-400">
            ({formatNumber(cls.size)} segments, {cls.pct.toFixed(1)}%)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="words">
          <TabsList>
            <TabsTrigger value="words">Characteristic words</TabsTrigger>
            <TabsTrigger value="variables">Variables</TabsTrigger>
            <TabsTrigger value="segments">Segments</TabsTrigger>
          </TabsList>

          <TabsContent value="words" className="space-y-3">
            <div className="flex justify-end">
              <div className="inline-flex rounded-md border border-slate-200 p-0.5">
                <button
                  onClick={() => setMode("chart")}
                  aria-label="Bar chart view"
                  className={cn(
                    "rounded p-1.5 text-slate-500",
                    mode === "chart" && "bg-slate-100 text-slate-900"
                  )}
                >
                  <BarChartHorizontal className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setMode("table")}
                  aria-label="Table view"
                  className={cn(
                    "rounded p-1.5 text-slate-500",
                    mode === "table" && "bg-slate-100 text-slate-900"
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
            {mode === "chart" ? (
              <div className="space-y-1.5">
                {topWords.map((w) => (
                  <div key={w.form} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 truncate text-right font-medium text-slate-700">
                      {w.form}
                    </span>
                    <div className="h-4 flex-1 rounded-sm bg-slate-100">
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${(w.chi2 / maxChi2) * 100}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right tabular-nums text-slate-500">
                      {w.chi2.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2 font-medium">
                        Form
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-medium">
                        chi2
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-medium">
                        p
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-medium">
                        freq in / total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cls.words.map((w) => (
                      <tr key={w.form} className="hover:bg-slate-50/60">
                        <td className="border-b border-slate-100 px-3 py-1.5 font-medium text-slate-700">
                          {w.form}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums">
                          {w.chi2.toFixed(2)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums">
                          {w.p < 0.0001 ? "<0.0001" : w.p.toFixed(4)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums">
                          {formatNumber(w.freq_in)} / {formatNumber(w.freq_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="variables">
            {cls.variables.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                No over-represented variable modalities in this class.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {cls.variables.map((v, i) => (
                  <Badge key={i} variant="outline" className="py-1">
                    <span className="text-slate-400">{v.variable}:</span>
                    <span className="font-semibold">{v.modality}</span>
                    <span className="tabular-nums text-slate-400">
                      chi2 {v.chi2.toFixed(1)}
                    </span>
                  </Badge>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="segments">
            {cls.segments.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                No characteristic segments.
              </p>
            ) : (
              <ul className="space-y-2">
                {cls.segments.map((seg, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-700"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge variant="secondary" className="tabular-nums">
                        score {seg.score.toFixed(1)}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        document #{seg.doc_index + 1}
                      </span>
                    </div>
                    <p className="leading-relaxed">{seg.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
