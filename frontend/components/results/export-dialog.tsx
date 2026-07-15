"use client";

import * as React from "react";
import { Download } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* Download preview: shows exactly what will be saved (full drawing, zoom
   reset, UI artifacts stripped), with per-view controls and a format choice. */

export function ExportDialog({
  open,
  onOpenChange,
  filename,
  getSvg,
  version,
  title = "Download preview",
  controls,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  /** The SVG to export — called after every controls change. */
  getSvg: () => SVGSVGElement | null;
  /** Any value that changes when the drawing changes (rebuilds the preview). */
  version: React.Key;
  title?: string;
  /** View-specific controls (spread slider, colors, axes toggle…). */
  controls?: React.ReactNode;
}) {
  const [format, setFormat] = React.useState<"svg" | "png">("svg");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cloneRef = React.useRef<ExportClone | null>(null);

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
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[52vh] overflow-auto rounded-md border border-slate-200 bg-white p-2">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Export preview"
              className="mx-auto block max-w-full"
            />
          ) : (
            <p className="py-16 text-center text-sm text-slate-400">
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
          <div className="inline-flex rounded-md border border-slate-200 p-0.5">
            {(["svg", "png"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium uppercase text-slate-500",
                  format === f && "bg-slate-100 text-slate-900"
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
