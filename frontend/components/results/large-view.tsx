"use client";

import * as React from "react";
import { Shrink } from "lucide-react";
import { Button } from "@/components/ui/button";

/* Lifts a figure into a window-sized panel and back. The figure keeps its DOM
   node (zoom handlers and the export ref keep working); only the wrapper's
   classes change. Esc, the button or a click outside closes it. */
export function LargeView({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-slate-950/40" onClick={onClose} aria-hidden="true" />}
      <div className={open ? "fixed inset-4 z-50 flex flex-col gap-2 rounded-lg bg-white p-3 shadow-2xl" : "relative"}>
        {open && (
          <Button variant="outline" size="sm" className="self-start" onClick={onClose} autoFocus>
            <Shrink /> Close large view
          </Button>
        )}
        {children}
      </div>
    </>
  );
}
