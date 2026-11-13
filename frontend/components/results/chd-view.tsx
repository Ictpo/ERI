"use client";

import * as React from "react";
import * as d3 from "d3";
import { Download, Expand, List, BarChartHorizontal, Shrink } from "lucide-react";
import type { ChdClass, ChdNode, ChdResult } from "@/lib/types";
import { categoryColor, fillStroke, readableTextOn } from "@/lib/palette";
import { CHART_FONT } from "@/lib/export";
import { cn, formatNumber } from "@/lib/utils";
import { ExportDialog } from "./export-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

/* Classic academic vertical dendrogram: root at top, orthogonal connectors,
   classes on a uniform baseline. Under it, one word / freq / chi2 table per
   class (tree order, headed by its class colour), wrapped into rows so the
   figure stays ~760 wide and its type readable on a page. Forms are never cut. */

const COL_W = 84; // one leaf: a box with "Class N" and its %
const HEADER_H = 36;
const WORD_FS = 11;
const ROW_H = 16;
const STRIP_H = 22; // class strip heading each table
const TABLE_HEAD_H = 17;
const TABLE_COL = { pad: 6, gap: 10, freq: 34, chi2: 46 };
const GAP = 16; // below the class boxes, and between tables
const TARGET_W = 760; // tables wrap to fit this width
const MAX_WORDS = 18;
const MARGIN = { top: 14, right: 16, bottom: 14, left: 16 };

type Leaf = {
  classId: number | null;
  cls: ChdClass | null;
  cx: number; // column center x
  size: number;
  slot: number; // position of its table in the grid; -1 when none
};
const stripText = (cls: ChdClass, size: number) =>
  `Class ${cls.id} · ${cls.pct.toFixed(1)}% · ${formatNumber(size)} segments`;

type Junction = { barY: number; x1: number; x2: number; drops: { x: number; toY: number }[] };

export function ChdView({ result }: { result: ChdResult }) {
  const [selectedClassId, setSelectedClassId] = React.useState<number | null>(
    result.classes[0]?.id ?? null
  );
  const [exportOpen, setExportOpen] = React.useState(false);
  const [maxWords, setMaxWords] = React.useState(MAX_WORDS);
  // Fit the tree to the pane by default so every class shows; "Actual size" scrolls.
  const [fitWidth, setFitWidth] = React.useState(true);
  const svgRef = React.useRef<SVGSVGElement>(null);
  // Text width in the chart font, so tables fit their longest form.
  const measure = React.useMemo(() => {
    const ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    return (text: string, size: number, weight: number) => {
      if (!ctx) return text.length * size * 0.62;
      ctx.font = `${weight} ${size}px ${CHART_FONT}`;
      return ctx.measureText(text).width;
    };
  }, []);

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

  const { leaves, junctions, width, height, baselineY, tableRows, tableW, wordW, tableAt } =
    React.useMemo(() => {
      const root = d3.hierarchy<ChdNode>(result.tree, (d) => d.children ?? null);
      const leafNodes = root.leaves();
      const nLeaves = leafNodes.length;
      const leafCls = leafNodes.map((leaf) =>
        leaf.data.class_id !== null ? classById.get(leaf.data.class_id) ?? null : null
      );
      const nTables = leafCls.filter((c) => c !== null).length;

      const maxDepth = Math.max(1, ...leafNodes.map((l) => l.depth));
      const treeH = Math.max(90, Math.min(220, 46 * maxDepth));
      const levelH = treeH / maxDepth;
      const baselineY = MARGIN.top + treeH;
      // Tables: as wide as the longest form shown (and the strip text) needs.
      const tableRows = Math.min(maxWords, Math.max(1, ...result.classes.map((c) => c.words.length)));
      const wordW = Math.max(60, ...result.classes.flatMap((c) =>
        c.words.slice(0, maxWords).map((w) => measure(w.form.replace(/_+$/, ""), WORD_FS, 500) + 4)));
      const stripW = Math.max(0, ...leafNodes.map((leaf, i) => {
        const cls = leafCls[i];
        return cls ? measure(stripText(cls, leaf.data.size), 11, 700) + 4 : 0;
      }));
      const tableW = Math.max(
        2 * TABLE_COL.pad + wordW + 2 * TABLE_COL.gap + TABLE_COL.freq + TABLE_COL.chi2,
        2 * TABLE_COL.pad + stripW
      );
      // As many tables to a row as fit TARGET_W (or the tree, if wider).
      const treeW = nLeaves * COL_W;
      const perRow = Math.max(1, Math.min(Math.max(1, nTables),
        Math.floor((Math.max(TARGET_W - MARGIN.left - MARGIN.right, treeW) + GAP) / (tableW + GAP))));
      const tablesW = perRow * tableW + (perRow - 1) * GAP;
      const innerW = Math.max(treeW, tablesW);
      const width = MARGIN.left + MARGIN.right + innerW;
      const treeX = MARGIN.left + (innerW - treeW) / 2;
      const tablesX = MARGIN.left + (innerW - tablesW) / 2;

      // Leaf columns, in tree order.
      const leafX = new Map<d3.HierarchyNode<ChdNode>, number>();
      leafNodes.forEach((leaf, i) => {
        leafX.set(leaf, treeX + i * COL_W + COL_W / 2);
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

      let slot = 0;
      const leaves: Leaf[] = leafNodes.map((leaf, i) => ({
        classId: leaf.data.class_id,
        cls: leafCls[i],
        cx: leafX.get(leaf) ?? 0,
        size: leaf.data.size,
        slot: leafCls[i] ? slot++ : -1,
      }));

      // Tables in tree order, perRow to a row, under the class boxes.
      const tableH = STRIP_H + TABLE_HEAD_H + tableRows * ROW_H + 6;
      const tablesTop = baselineY + HEADER_H + GAP;
      const nRows = Math.max(1, Math.ceil(nTables / perRow));
      const tableAt = (s: number) => ({
        x: tablesX + (s % perRow) * (tableW + GAP),
        y: tablesTop + Math.floor(s / perRow) * (tableH + GAP),
      });
      const height = tablesTop + nRows * tableH + (nRows - 1) * GAP + MARGIN.bottom;

      return { leaves, junctions, width, height, baselineY, tableRows, tableW, wordW, tableAt };
    }, [result.tree, result.classes, classById, maxWords, measure]);

  const selected =
    selectedClassId !== null ? classById.get(selectedClassId) : null;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {formatNumber(result.n_segments)} segments
        </Badge>
        <Badge
          variant="secondary"
          title="Segments with at least one active word. ERI puts every one of them in a class, so this is NOT Iramuteq's '% classified' retention rate."
        >
          {formatNumber(result.n_classified)} usable (
          {result.pct_classified.toFixed(1)}%)
        </Badge>
        <Badge variant="secondary">{result.classes.length} classes</Badge>
        <div className="ml-auto flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setFitWidth((v) => !v)}>
            {fitWidth ? <Expand /> : <Shrink />}
            {fitWidth ? "Actual size" : "Fit to pane"}
          </Button>
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
        version={`${result.classes.length}|${selectedClassId}|${maxWords}`}
        controls={
          <div className="grid gap-2 sm:col-span-2">
            <Label>Words per class: <span className="tabular-nums">{maxWords}</span></Label>
            <Slider aria-label="Words per class" min={5} max={30} step={1} value={[maxWords]} onValueChange={([v]) => setMaxWords(v)} />
          </div>
        }
      />

      {/* Dendrogram */}
      <Card>
        <CardContent className={cn("p-2", !fitWidth && "overflow-x-auto")}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            width={fitWidth ? undefined : width}
            height={fitWidth ? undefined : height}
            className={cn("mx-auto block", fitWidth && "h-auto w-full")}
            style={fitWidth ? { maxWidth: width } : undefined}
            role="img"
            aria-label="CHD dendrogram"
            fontFamily={CHART_FONT}
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
              const boxW = COL_W - 8;
              const x0 = leaf.cx - boxW / 2;
              const words = leaf.cls ? leaf.cls.words.slice(0, maxWords) : [];
              const t = tableAt(Math.max(0, leaf.slot)); // this class's table
              const ruleY = t.y + STRIP_H + TABLE_HEAD_H;
              const tableX = {
                word: t.x + TABLE_COL.pad,
                freq: t.x + TABLE_COL.pad + wordW + TABLE_COL.gap + TABLE_COL.freq,
                chi2: t.x + tableW - TABLE_COL.pad,
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
                    y={baselineY + 15}
                    textAnchor="middle"
                    fontSize={leaf.cls ? 12 : 9.5}
                    fontWeight={700}
                    fill={readableTextOn(color)}
                  >
                    {leaf.cls ? `Class ${leaf.cls.id}` : "Unclassified"}
                  </text>
                  <text
                    x={leaf.cx}
                    y={baselineY + 29}
                    textAnchor="middle"
                    fontSize={leaf.cls ? 10.5 : 8.5}
                    fill={readableTextOn(color)}
                    fillOpacity={0.92}
                  >
                    {leaf.cls
                      ? `${leaf.cls.pct.toFixed(1)}%`
                      : `${formatNumber(leaf.size)} segments`}
                  </text>

                  {/* Word table */}
                  {leaf.cls && (
                    <>
                      <rect x={t.x} y={t.y} width={tableW} height={STRIP_H} fill={color}
                        stroke={fillStroke(color)} strokeWidth={0.75} />
                      <text x={t.x + TABLE_COL.pad} y={t.y + 15} fontSize={11} fontWeight={700} fill={readableTextOn(color)}>
                        {stripText(leaf.cls, leaf.size)}
                      </text>
                      <text
                        x={tableX.word}
                        y={ruleY - 5}
                        fontSize={9}
                        fontWeight={600}
                        fill="#64748b"
                        letterSpacing="0.04em"
                      >
                        WORD
                      </text>
                      <text
                        x={tableX.freq}
                        y={ruleY - 5}
                        textAnchor="end"
                        fontSize={9}
                        fontWeight={600}
                        fill="#64748b"
                        letterSpacing="0.04em"
                      >
                        FREQ
                      </text>
                      <text
                        x={tableX.chi2}
                        y={ruleY - 5}
                        textAnchor="end"
                        fontSize={9}
                        fontWeight={600}
                        fill="#64748b"
                        letterSpacing="0.04em"
                      >
                        χ²
                      </text>
                      {words.map((w, r) => {
                        const y = ruleY + (r + 0.75) * ROW_H;
                        const form = w.form.replace(/_+$/, ""); // never cut
                        return (
                          <g key={w.form} fontSize={WORD_FS}>
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
                        x1={t.x}
                        y1={ruleY}
                        x2={t.x + tableW}
                        y2={ruleY}
                        stroke="#e2e8f0"
                        strokeWidth={1}
                      />
                      <rect
                        x={t.x}
                        y={t.y}
                        width={tableW}
                        height={STRIP_H + TABLE_HEAD_H + tableRows * ROW_H + 6}
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
                  ? "border-transparent"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              )}
              style={
                c.id === selectedId
                  ? { backgroundColor: categoryColor(i), color: readableTextOn(categoryColor(i)) }
                  : undefined
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
          <span className="font-normal text-slate-500">
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
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-slate-500">
                Words most typical of this class, strongest first. The number is
                χ² (chi-square): how far above chance the word turns up in this
                class&apos;s segments. Higher means more typical. In the table, p
                is how likely a link this strong would be by chance alone.
              </p>
              <div className="inline-flex rounded-md border border-slate-200 p-0.5">
                <button
                  onClick={() => setMode("chart")}
                  aria-pressed={mode === "chart"}
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
                  aria-pressed={mode === "table"}
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
                        Word
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-medium">
                        <span className="normal-case">χ²</span>
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-medium">
                        <span className="normal-case">p</span>
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right font-medium">
                        Segments in class / corpus
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

          <TabsContent value="variables" className="space-y-3">
            <p className="text-xs text-slate-500">
              Variable values that turn up more in this class than in the rest
              of the corpus, strongest first (χ², all with p &lt; 0.05).
            </p>
            {cls.variables.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No over-represented variable modalities in this class.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {cls.variables.map((v, i) => (
                  <Badge key={i} variant="outline" className="py-1">
                    <span className="text-slate-500">{v.variable}:</span>
                    <span className="font-semibold">{v.modality}</span>
                    <span className="tabular-nums text-slate-500">
                      χ² {v.chi2.toFixed(1)}
                    </span>
                  </Badge>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="segments" className="space-y-3">
            <p className="text-xs text-slate-500">
              The segments most typical of this class. Each score adds up the
              χ² of this class&apos;s words that the segment contains.
            </p>
            {cls.segments.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
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
                      <span className="text-xs text-slate-500">
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
