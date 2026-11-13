"use client";

import * as React from "react";
import { Download, Maximize2, Minimize2 } from "lucide-react";
import {
  buildExportClone,
  downloadBlob,
  svgBlob,
  svgToPngBlob,
  type ExportClone,
} from "@/lib/export";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* Download preview: shows exactly what will be saved (full drawing, zoom
   reset, UI artifacts stripped), with per-view controls and a format choice. */

// The format last picked in any Download preview, so a user who exports PNG
// picks it once. Stored by the backend (/api/settings) because the desktop
// webview forgets localStorage between launches; read once per launch.
let lastFormat: Promise<"svg" | "png"> | null = null;

function rememberedFormat(): Promise<"svg" | "png"> {
  if (!lastFormat) {
    lastFormat = api.getSettings().then(
      (s): "svg" | "png" => (s.export_format === "png" ? "png" : "svg"),
      (): "svg" | "png" => "svg"
    );
  }
  return lastFormat;
}

export function ExportDialog({
  open,
  onOpenChange,
  filename,
  getSvg,
  version,
  title = "Download preview",
  controls,
  overlay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  /** The SVG to export — called after every controls change. */
  getSvg: () => SVGSVGElement | null;
  /** Any value that changes when the drawing changes (rebuilds the preview). */
  version: React.Key;
  title?: string;
  /** A UI layer drawn over the preview in the figure's own coordinates
      (e.g. draggable label handles). It is never part of the saved file. */
  overlay?: React.ReactNode;
  /** View-specific controls (spread slider, colors, axes toggle…). */
  controls?: React.ReactNode;
}) {
  const [format, setFormat] = React.useState<"svg" | "png">("svg");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cloneRef = React.useRef<ExportClone | null>(null);
  // Fit shows the whole figure; full size shows it 1:1 in a scrolling box.
  const [fullSize, setFullSize] = React.useState(false);
  // The figure's viewBox, so an `overlay` lines up with the preview image.
  const [previewBox, setPreviewBox] = React.useState<number[] | null>(null);

  // Effects run after React commits the DOM, so the live drawing already
  // reflects the latest controls here — build the preview synchronously
  // (no requestAnimationFrame: it never fires in hidden/backgrounded pages).
  React.useEffect(() => {
    if (!open) return;
    const svg = getSvg();
    if (!svg) return;
    try {
      const clone = buildExportClone(svg);
      cloneRef.current = clone;
      const vb = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
      setPreviewBox(
        vb.length === 4 && vb.every(Number.isFinite)
          ? vb
          : [0, 0, clone.width, clone.height]
      );
      const url = URL.createObjectURL(svgBlob(clone.markup));
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Preview failed",
        description: "The drawing could not be prepared for export.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, version]);

  React.useEffect(() => {
    if (!open && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Each time the preview opens, start from the format picked last, unless
  // the user has already picked one since it opened.
  const picked = React.useRef(false);
  React.useEffect(() => {
    if (!open) return;
    picked.current = false;
    let cancelled = false;
    rememberedFormat().then((f) => {
      if (!cancelled && !picked.current) setFormat(f);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function pickFormat(f: "svg" | "png") {
    picked.current = true;
    setFormat(f);
    lastFormat = Promise.resolve(f);
    api.saveSettings({ export_format: f }).catch(() => {
      /* non-fatal: the choice still applies until ERI restarts */
    });
  }

  async function download() {
    const clone = cloneRef.current;
    if (!clone) return;
    setBusy(true);
    try {
      if (format === "svg") {
        downloadBlob(svgBlob(clone.markup), `${filename}.svg`);
      } else {
        const png = await svgToPngBlob(clone.markup, clone.width, clone.height, 2);
        downloadBlob(png, `${filename}.png`);
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: "The file could not be generated. Try the other format.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="flex-row items-center justify-between gap-2 pr-6">
          <DialogTitle>{title}</DialogTitle>
          {previewUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFullSize((v) => !v)}
            >
              {fullSize ? <Minimize2 /> : <Maximize2 />}
              {fullSize ? "Fit whole figure" : "Full size"}
            </Button>
          )}
        </DialogHeader>

        <div
          className={cn(
            "rounded-md border border-slate-200 bg-white p-2",
            fullSize && "max-h-[52vh] overflow-auto"
          )}
        >
          {previewUrl && overlay && previewBox ? (
            // The saved image plus the view's overlay in one coordinate
            // system; only the image part is saved.
            <svg
              viewBox={previewBox.join(" ")}
              role="group"
              aria-label="Export preview"
              className={cn(
                "mx-auto block",
                fullSize ? "max-w-none" : "max-h-[50vh] w-full"
              )}
              style={
                fullSize
                  ? { width: previewBox[2], height: previewBox[3] }
                  : undefined
              }
            >
              <image
                href={previewUrl}
                x={previewBox[0]}
                y={previewBox[1]}
                width={previewBox[2]}
                height={previewBox[3]}
              />
              {overlay}
            </svg>
          ) : previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Export preview"
              className={cn(
                "mx-auto block",
                fullSize ? "max-w-none" : "max-h-[50vh] max-w-full"
              )}
            />
          ) : (
            <p className="py-16 text-center text-sm text-slate-500">
              Preparing preview…
            </p>
          )}
        </div>

        {controls && (
          <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
            {controls}
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div
            role="group"
            aria-label="File format"
            className="inline-flex rounded-md border border-slate-200 p-0.5"
          >
            {(["svg", "png"] as const).map((f) => (
              <button
                key={f}
                onClick={() => pickFormat(f)}
                aria-pressed={format === f}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium uppercase text-slate-500",
                  format === f && "bg-slate-800 text-white"
                )}
              >
                {f === "svg" ? "SVG (vector)" : "PNG (image)"}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={download} disabled={busy || !previewUrl}>
              <Download /> {busy ? "Preparing…" : `Download ${format.toUpperCase()}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
