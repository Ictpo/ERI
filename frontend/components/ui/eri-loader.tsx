"use client";

import { Loader2 } from "lucide-react";
import { usePlainMode } from "@/lib/appearance";

/**
 * Brand loader (BRANDING.md Step 5) — purely decorative, shown while an
 * analysis runs. Honours plain mode: researchers who don't want the
 * animation get a plain indicator instead.
 */
export function EriLoader({
  label = "Listening to your corpus…",
}: {
  label?: string;
}) {
  const { plain } = usePlainMode();

  if (plain) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    );
  }

  const cols = ["6%", "26%", "72%", "90%"];
  return (
    <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-xl bg-[#0C0709] px-8 py-14">
      {cols.map((left, i) => (
        <div
          key={i}
          aria-hidden
          className="pointer-events-none absolute -top-[10%] font-mono text-sm text-[#F0704A]"
          style={{ left, animation: `eriFall ${2.6 + i * 0.3}s linear infinite` }}
        >
          {["E", "R", "I", "0", "1", "0"].map((c, j) => (
            <div key={j}>{c}</div>
          ))}
        </div>
      ))}
      <div className="relative flex h-[120px] w-[120px] items-center justify-center">
        <div
          className="absolute -inset-3 rounded-full opacity-70 blur-[7px]"
          style={{
            background:
              "conic-gradient(from 0deg,#F4A63F,#D6266F,#F0704A,#F4A63F)",
            animation: "eriRing 2.4s linear infinite",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/eri-icon.png"
          alt=""
          className="relative h-[120px] w-[120px] rounded-full"
        />
      </div>
      <p className="relative font-display text-xl text-[#F3E9E4]">{label}</p>
    </div>
  );
}
