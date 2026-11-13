"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** A label the user can move in the Download preview: a stable key, its text
    (for screen readers) and its box in the exported figure's own units. */
export type LabelHandle = {
  key: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Grab areas over a figure's labels, drawn as an ExportDialog `overlay` (so
 * never saved). Drag a label, or Tab to it and press the arrow keys (Shift
 * for bigger steps). `onMove` receives the shift in figure units; the view
 * moves the label in its own drawing, which rebuilds the preview, so what
 * the user places is exactly what is saved.
 */
export function LabelHandles({
  handles,
  onMove,
}: {
  handles: LabelHandle[];
  onMove: (key: string, dx: number, dy: number) => void;
}) {
  const [drag, setDrag] = React.useState<{
    key: string;
    x0: number;
    y0: number;
    dx: number;
    dy: number;
  } | null>(null);

  // Pointer position in the overlay's coordinates, which are the figure's.
  function toFigure(e: React.PointerEvent<SVGRectElement>) {
    const ctm = e.currentTarget.ownerSVGElement?.getScreenCTM();
    if (!ctm) return null;
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  }

  return (
    <g>
      {handles.map((h) => {
        const moving = drag?.key === h.key ? drag : null;
        return (
          <rect
            key={h.key}
            x={h.x + (moving?.dx ?? 0)}
            y={h.y + (moving?.dy ?? 0)}
            width={h.w}
            height={h.h}
            rx={2}
            tabIndex={0}
            role="button"
            aria-label={`Move label ${h.text}`}
            strokeWidth={1}
            strokeDasharray={moving ? "3 2" : undefined}
            vectorEffect="non-scaling-stroke"
            className={cn(
              "cursor-move fill-transparent outline-none hover:stroke-indigo-300 focus-visible:stroke-indigo-500",
              moving && "stroke-indigo-500"
            )}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              const p = toFigure(e);
              if (!p) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ key: h.key, x0: p.x, y0: p.y, dx: 0, dy: 0 });
            }}
            onPointerMove={(e) => {
              if (!moving) return;
              const p = toFigure(e);
              if (p) setDrag({ ...moving, dx: p.x - moving.x0, dy: p.y - moving.y0 });
            }}
            onPointerUp={() => {
              if (moving && (moving.dx || moving.dy)) {
                onMove(h.key, moving.dx, moving.dy);
              }
              setDrag(null);
            }}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={(e) => {
              const dir = ARROWS[e.key];
              if (!dir) return;
              e.preventDefault();
              const step = e.shiftKey ? 10 : 2;
              onMove(h.key, dir[0] * step, dir[1] * step);
            }}
          />
        );
      })}
    </g>
  );
}
