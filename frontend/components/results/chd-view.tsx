"use client";

import * as React from "react";
import * as d3 from "d3";
import { Download, List, BarChartHorizontal } from "lucide-react";
import type { ChdClass, ChdNode, ChdResult } from "@/lib/types";
import { categoryColor, fillStroke, readableTextOn } from "@/lib/palette";
import { cn, formatNumber } from "@/lib/utils";
import { ExportDialog } from "./export-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* Classic academic vertical dendrogram:
   root at top, orthogonal connectors, terminal classes on a uniform
   baseline, and a word / freq / chi2 table stacked under each class. */

const COL_W = 168;
const TABLE_COL = { word: 78, freq: 34, chi2: 44 };
const HEADER_H = 40;
const ROW_H = 14.5;
const TABLE_HEAD_H = 15;
const MAX_WORDS = 18;
const MARGIN = { top: 14, right: 16, bottom: 14, left: 16 };

type Leaf = {
  classId: number | null;
  cls: ChdClass | null;
  cx: number; // column center x
  size: number;
};

type Junction = { barY: number; x1: number; x2: number; drops: { x: number; toY: number }[] };

export function ChdView({ result }: { result: ChdResult }) {
  const [selectedClassId, setSelectedClassId] = React.useState<number | null>(
    result.classes[0]?.id ?? null
  );
  const [exportOpen, setExportOpen] = React.useState(false);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const classById = React.useMemo(() => {
    const map = new Map<number, ChdClass>();
    result.classes.forEach((c) => map.set(c.id, c));
    return map;
  }, [result.classes]);

  const colorForClass = React.useCallback(
    (classId: number | null) => {
      if (classId === null) return "#94a3b8";
      const idx = result.classes.findIndex((c) => c.id === classId);
      return categoryColor(idx === -1 ? classId : idx);
    },
    [result.classes]
  );

  const { leaves, junctions, width, height, baselineY, tableRows } =
    React.useMemo(() => {
      const root = d3.hierarchy<ChdNode>(result.tree, (d) => d.children ?? null);
      const leafNodes = root.leaves();
      const nLeaves = leafNodes.length;
      const width = MARGIN.left + MARGIN.right + nLeaves * COL_W;

      const maxDepth = Math.max(1, ...leafNodes.map((l) => l.depth));
      const treeH = Math.max(90, Math.min(220, 46 * maxDepth));
      const levelH = treeH / maxDepth;
      const baselineY = MARGIN.top + treeH;

      // Leaf columns, in tree order.
      const leafX = new Map<d3.HierarchyNode<ChdNode>, number>();
      leafNodes.forEach((leaf, i) => {
        leafX.set(leaf, MARGIN.left + i * COL_W + COL_W / 2);
      });

      // Internal node x = midpoint of its children's x; computed bottom-up.
      const nodeX = new Map<d3.HierarchyNode<ChdNode>, number>();
      const computeX = (node: d3.HierarchyNode<ChdNode>): number => {
        if (!node.children || node.children.length === 0) {
          const x = leafX.get(node) ?? 0;
          nodeX.set(node, x);
          return x;
        }
        const xs = node.children.map(computeX);
        const x = (Math.min(...xs) + Math.max(...xs)) / 2;
        nodeX.set(node, x);
        return x;
      };
      computeX(root);

      // One junction (horizontal bar + vertical drops) per internal node.
      const junctions: Junction[] = [];
      root.descendants().forEach((node) => {
        if (!node.children) return;
        const barY = MARGIN.top + node.depth * levelH;
        const childXs = node.children.map((c) => nodeX.get(c) ?? 0);
        junctions.push({
          barY,
          x1: Math.min(...childXs),
          x2: Math.max(...childXs),
          drops: node.children.map((c) => ({
            x: nodeX.get(c) ?? 0,
            // Internal children drop to their own bar; leaves drop to baseline.
            toY: c.children ? MARGIN.top + c.depth * levelH : baselineY,
          })),
        });
      });

      const leaves: Leaf[] = leafNodes.map((leaf) => ({
        classId: leaf.data.class_id,
        cls:
          leaf.data.class_id !== null
            ? classById.get(leaf.data.class_id) ?? null
            : null,
        cx: leafX.get(leaf) ?? 0,
        size: leaf.data.size,
      }));

      const tableRows = Math.min(
        MAX_WORDS,
        Math.max(1, ...result.classes.map((c) => c.words.length))
      );
      const height =
        baselineY +
        HEADER_H +
        TABLE_HEAD_H +
        tableRows * ROW_H +
        MARGIN.bottom;

      return { leaves, junctions, width, height, baselineY, tableRows };
    }, [result.tree, result.classes, classById]);

  const selected =
    selectedClassId !== null ? classById.get(selectedClassId) : null;

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
            onClick={() => setExportOpen(true)}
          >
            <Download /> Download
          </Button>
        </div>
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        filename="chd-dendrogram"
        getSvg={() => svgRef.current}
        version={`${result.classes.length}|${selectedClassId}`}
      />

      {/* Dendrogram */}
      <Card>
        <CardContent className="overflow-x-auto p-2">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            className="mx-auto block"
            role="img"
            aria-label="CHD dendrogram"
            fontFamily="Inter, system-ui, sans-serif"
          >
            {/* Tree connectors */}
            {junctions.map((j, i) => (
              <g key={i} stroke="#64748b" strokeWidth={1.4} fill="none">
                <line x1={j.x1} y1={j.barY} x2={j.x2} y2={j.barY} />
                {j.drops.map((d, k) => (
                  <line key={k} x1={d.x} y1={j.barY} x2={d.x} y2={d.toY} />
                ))}
              </g>
            ))}

            {/* Terminal classes on the shared baseline */}
            {leaves.map((leaf, i) => {
              const color = colorForClass(leaf.classId);
              const isSelected =
                leaf.classId !== null && leaf.classId === selectedClassId;
              const x0 = leaf.cx - (COL_W - 12) / 2;
              const boxW = COL_W - 12;
              const words = leaf.cls ? leaf.cls.words.slice(0, MAX_WORDS) : [];
              const tableX = {
                word: x0 + 5,
                freq: x0 + TABLE_COL.word + TABLE_COL.freq,
                chi2: x0 + boxW - 5,
              };
              return (
                <g
                  key={i}
                  className={
                    leaf.classId !== null ? "cursor-pointer" : undefined
                  }
                  onClick={() =>
                    leaf.classId !== null && setSelectedClassId(leaf.classId)
                  }
                >
                  {/* Header */}
                  <rect
                    x={x0}
                    y={baselineY}
                    width={boxW}
                    height={HEADER_H}
                    fill={color}
                    stroke={fillStroke(color)}
                    strokeWidth={0.75}
                  />
                  {isSelected && (
                    <rect
                      data-export-ignore="true"
                      x={x0 - 2}
                      y={baselineY - 2}
                      width={boxW + 4}
                      height={HEADER_H + 4}
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth={2}
                    />
                  )}
                  <text
                    x={leaf.cx}
                    y={baselineY + 16}
                    textAnchor="middle"
                    fontSize={12.5}
                    fontWeight={700}
                    fill={readableTextOn(color)}
                  >
                    {leaf.cls ? `Class ${leaf.cls.id}` : "Unclassified"}
                    {leaf.cls ? ` — ${leaf.cls.pct.toFixed(1)}%` : ""}
                  </text>
                  <text
                    x={leaf.cx}
                    y={baselineY + 30}
                    textAnchor="middle"
                    fontSize={10}
                    fill={readableTextOn(color)}
                    fillOpacity={0.92}
                  >
                    {formatNumber(leaf.size)} segments
                  </text>

                  {/* Word table */}
                  {leaf.cls && (
                    <>
                      <text
                        x={tableX.word}
                        y={baselineY + HEADER_H + 11}
                        fontSize={8}
                        fontWeight={600}
                        fill="#94a3b8"
                        letterSpacing="0.04em"
                      >
                        WORD
                      </text>
                      <text
                        x={tableX.freq}
                        y={baselineY + HEADER_H + 11}
                        textAnchor="end"
                        fontSize={8}
                        fontWeight={600}
                        fill="#94a3b8"
                        letterSpacing="0.04em"
                      >
                        FREQ
                      </text>
                      <text
                        x={tableX.chi2}
                        y={baselineY + HEADER_H + 11}
                        textAnchor="end"
                        fontSize={8}
                        fontWeight={600}
                        fill="#94a3b8"
                        letterSpacing="0.04em"
                      >
                        χ²
                      </text>
                      {words.map((w, r) => {
                        const y =
                          baselineY +
                          HEADER_H +
                          TABLE_HEAD_H +
                          (r + 0.75) * ROW_H;
                        const display = w.form.replace(/_+$/, "");
                        const form =
                          display.length > 12
                            ? display.slice(0, 11) + "…"
                            : display;
                        return (
                          <g key={w.form} fontSize={9.5}>
                            <text x={tableX.word} y={y} fill="#1e293b" fontWeight={500}>
                              {form}
                            </text>
                            <text
                              x={tableX.freq}
                              y={y}
                              textAnchor="end"
                              fill="#64748b"
                            >
                              {w.freq_in}
                            </text>
                            <text
                              x={tableX.chi2}
                              y={y}
                              textAnchor="end"
                              fill="#475569"
                            >
                              {w.chi2.toFixed(1)}
                            </text>
                          </g>
                        );
                      })}
                      {/* Column rule under the header strip */}
                      <line
                        x1={x0}
                        y1={baselineY + HEADER_H + TABLE_HEAD_H}
                        x2={x0 + boxW}
                        y2={baselineY + HEADER_H + TABLE_HEAD_H}
                        stroke="#e2e8f0"
                        strokeWidth={1}
                      />
                      <rect
                        x={x0}
                        y={baselineY}
                        width={boxW}
                        height={
                          HEADER_H + TABLE_HEAD_H + tableRows * ROW_H + 6
                        }
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth={1}
                      />
                    </>
                  )}
                </g>
              );
            })}
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
          Class {cls.id} — {cls.label.replace(/_+(?= \/|$)/g, "")}
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
                      {w.form.replace(/_+$/, "")}
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
                          {w.form.replace(/_+$/, "")}
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
