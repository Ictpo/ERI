"use client";

import * as React from "react";
import * as d3 from "d3";
import { Download, Maximize } from "lucide-react";
import type { AfcPoint, AfcResult } from "@/lib/types";
import { downloadSvg } from "@/lib/export";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const WIDTH = 720;
const HEIGHT = 520;
const MARGIN = { top: 24, right: 24, bottom: 40, left: 48 };

type AxisPair = [number, number]; // 0-based axis indices

const WORD_COLOR = "#64748b";
const MODALITY_COLOR = "#4f46e5";

function axisValue(p: AfcPoint, axis: number): number | null {
  if (axis === 0) return p.x;
  if (axis === 1) return p.y;
  return p.z;
}

type Hover = {
  point: AfcPoint;
  kind: "word" | "modality";
  px: number;
  py: number;
};

export function AfcView({ result }: { result: AfcResult }) {
  const hasZ =
    result.explained.length >= 3 &&
    (result.rows.some((r) => r.z !== null) ||
      result.cols.some((c) => c.z !== null));
  const [axes, setAxes] = React.useState<AxisPair>([0, 1]);
  const [showWords, setShowWords] = React.useState(true);
  const [showModalities, setShowModalities] = React.useState(true);
  const [hover, setHover] = React.useState<Hover | null>(null);
  const [transform, setTransform] = React.useState(d3.zoomIdentity);

  const svgRef = React.useRef<SVGSVGElement>(null);
  const zoomRef = React.useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(
    null
  );

  const [ax, ay] = axes;

  const points = React.useMemo(() => {
    const mk = (p: AfcPoint, kind: "word" | "modality") => {
      const vx = axisValue(p, ax);
      const vy = axisValue(p, ay);
      if (vx === null || vy === null) return null;
      return { point: p, kind, vx, vy };
    };
    const all: { point: AfcPoint; kind: "word" | "modality"; vx: number; vy: number }[] =
      [];
    result.rows.forEach((p) => {
      const item = mk(p, "word");
      if (item) all.push(item);
    });
    result.cols.forEach((p) => {
      const item = mk(p, "modality");
      if (item) all.push(item);
    });
    return all;
  }, [result, ax, ay]);

  const { xScale, yScale } = React.useMemo(() => {
    const xs = points.map((p) => p.vx);
    const ys = points.map((p) => p.vy);
    const xExtent = xs.length ? [Math.min(...xs), Math.max(...xs)] : [-1, 1];
    const yExtent = ys.length ? [Math.min(...ys), Math.max(...ys)] : [-1, 1];
    const padX = (xExtent[1] - xExtent[0] || 1) * 0.08;
    const padY = (yExtent[1] - yExtent[0] || 1) * 0.08;
    return {
      xScale: d3
        .scaleLinear()
        .domain([xExtent[0] - padX, xExtent[1] + padX])
        .range([MARGIN.left, WIDTH - MARGIN.right]),
      yScale: d3
        .scaleLinear()
        .domain([yExtent[0] - padY, yExtent[1] + padY])
        .range([HEIGHT - MARGIN.bottom, MARGIN.top]),
    };
  }, [points]);

  // Attach d3.zoom to the svg.
  React.useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 12])
      .on("zoom", (event) => setTransform(event.transform));
    svg.call(zoom);
    zoomRef.current = zoom;
    return () => {
      svg.on(".zoom", null);
    };
  }, []);

  function resetView() {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(250)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  }

  const zx = transform.rescaleX(xScale);
  const zy = transform.rescaleY(yScale);

  const explainedX = result.explained[ax]?.toFixed(1) ?? "?";
  const explainedY = result.explained[ay]?.toFixed(1) ?? "?";

  const axisPairs: { label: string; pair: AxisPair }[] = hasZ
    ? [
        { label: "1 × 2", pair: [0, 1] },
        { label: "1 × 3", pair: [0, 2] },
        { label: "2 × 3", pair: [1, 2] },
      ]
    : [{ label: "1 × 2", pair: [0, 1] }];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Show/hide chips */}
        <button
          onClick={() => setShowWords((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            showWords
              ? "border-transparent bg-slate-600 text-white"
              : "border-slate-300 bg-white text-slate-500"
          )}
        >
          Words ({result.rows.length})
        </button>
        <button
          onClick={() => setShowModalities((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            showModalities
              ? "border-transparent bg-indigo-600 text-white"
              : "border-slate-300 bg-white text-slate-500"
          )}
        >
          Variables ({result.cols.length})
        </button>

        {/* Axis pair switcher */}
        {hasZ && (
          <div className="ml-2 inline-flex rounded-md border border-slate-200 p-0.5">
            {axisPairs.map(({ label, pair }) => (
              <button
                key={label}
                onClick={() => setAxes(pair)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium text-slate-500",
                  pair[0] === ax && pair[1] === ay && "bg-slate-100 text-slate-900"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex gap-1.5">
          <Button variant="outline" size="sm" onClick={resetView}>
            <Maximize /> Reset view
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              svgRef.current && downloadSvg(svgRef.current, "afc-scatter")
            }
          >
            <Download /> SVG
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="relative p-2">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full cursor-grab active:cursor-grabbing"
            role="img"
            aria-label="Correspondence analysis scatter plot"
          >
            {/* Axis lines through origin */}
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={zy(0)}
              y2={zy(0)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <line
              x1={zx(0)}
              x2={zx(0)}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
              stroke="#e2e8f0"
              strokeWidth={1}
            />

            {/* Axis labels */}
            <text
              x={WIDTH - MARGIN.right}
              y={HEIGHT - 12}
              textAnchor="end"
              fontSize={12}
              fill="#64748b"
              fontFamily="Inter, system-ui, sans-serif"
            >
              Axis {ax + 1} ({explainedX}%)
            </text>
            <text
              x={16}
              y={MARGIN.top}
              fontSize={12}
              fill="#64748b"
              fontFamily="Inter, system-ui, sans-serif"
              transform={`rotate(-90 16 ${MARGIN.top})`}
              textAnchor="end"
            >
              Axis {ay + 1} ({explainedY}%)
            </text>

            {/* Points */}
            <g clipPath="url(#afc-clip)">
              <clipPath id="afc-clip">
                <rect
                  x={MARGIN.left}
                  y={MARGIN.top}
                  width={WIDTH - MARGIN.left - MARGIN.right}
                  height={HEIGHT - MARGIN.top - MARGIN.bottom}
                />
              </clipPath>
              {points.map(({ point, kind, vx, vy }, i) => {
                if (kind === "word" && !showWords) return null;
                if (kind === "modality" && !showModalities) return null;
                const px = zx(vx);
                const py = zy(vy);
                const onEnter = () => setHover({ point, kind, px, py });
                const onLeave = () => setHover(null);
                if (kind === "word") {
                  return (
                    <g key={`w${i}`}>
                      <circle
                        cx={px}
                        cy={py}
                        r={3}
                        fill={WORD_COLOR}
                        fillOpacity={0.7}
                        onMouseEnter={onEnter}
                        onMouseLeave={onLeave}
                      />
                      <text
                        x={px + 5}
                        y={py + 3}
                        fontSize={9}
                        fill={WORD_COLOR}
                        fontFamily="Inter, system-ui, sans-serif"
                        pointerEvents="none"
                      >
                        {point.label.replace(/_+$/, "")}
                      </text>
                    </g>
                  );
                }
                // modality: diamond marker with bolder label
                const s = 5.5;
                return (
                  <g key={`m${i}`}>
                    <path
                      d={`M${px},${py - s} L${px + s},${py} L${px},${py + s} L${px - s},${py} Z`}
                      fill={MODALITY_COLOR}
                      onMouseEnter={onEnter}
                      onMouseLeave={onLeave}
                    />
                    <text
                      x={px + 8}
                      y={py + 4}
                      fontSize={11}
                      fontWeight={700}
                      fill={MODALITY_COLOR}
                      fontFamily="Inter, system-ui, sans-serif"
                      pointerEvents="none"
                    >
                      {point.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Tooltip */}
          {hover && (
            <div
              className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
              style={{
                left: `${(hover.px / WIDTH) * 100}%`,
                top: `${(hover.py / HEIGHT) * 100}%`,
                transform: "translate(10px, -50%)",
              }}
            >
              <p className="font-semibold text-slate-800">
                {hover.point.label.replace(/_+$/, "")}{" "}
                <span className="font-normal text-slate-400">
                  ({hover.kind === "word" ? "word" : "modality"})
                </span>
              </p>
              <p className="tabular-nums text-slate-500">
                x {hover.point.x.toFixed(3)} · y {hover.point.y.toFixed(3)}
                {hover.point.z !== null && <> · z {hover.point.z.toFixed(3)}</>}
              </p>
              <p className="tabular-nums text-slate-500">
                contrib x {hover.point.contrib_x.toFixed(1)}% · y{" "}
                {hover.point.contrib_y.toFixed(1)}%
              </p>
              <p className="tabular-nums text-slate-500">
                freq {hover.point.freq}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-slate-400">
        Scroll to zoom, drag to pan. Circles are words; diamonds are variable
        modalities.
      </p>
    </div>
  );
}
