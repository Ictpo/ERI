"use client";

import { Loader2 } from "lucide-react";
import { usePlainMode } from "@/lib/appearance";

/**
 * Brand loader (BRANDING.md Step 5) — purely decorative, shown while an
 * analysis runs. Honours plain mode: researchers who don't want the
 * animation get a plain indicator instead.
 */

type Column = { left: number; dur: number; delay: number; color: string; bits: string[] };

// Matrix-style "binary rain": each column is the ASCII-binary of E, ER, or ERI,
// so the acronym is encoded in the rain and lengths vary by construction
// (8 / 16 / 24 bits). Each stream falls at its own steady speed (decoupled from
// length) with a bright head + fading tail, and starts above the box so it
// begins empty. Built once from a seeded PRNG so SSR and client markup match.
const BOX = 360; // fall distance in px (box is clipped by overflow-hidden)
const COLUMNS: Column[] = (() => {
  let s = 0x2b20; // deterministic seed (the 2:20 launch)
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const frags = ["E", "ER", "ERI"];
  const colors = ["#F0704A", "#F4A63F", "#EA5E86"];
  const toBits = (t: string) =>
    t
      .split("")
      .map((c) => c.charCodeAt(0).toString(2).padStart(8, "0"))
      .join("")
      .split("");
  const n = 9;
  const cols: Column[] = [];
  for (let i = 0; i < n; i++) {
    const bits = toBits(frags[Math.floor(rnd() * 3)]);
    const height = bits.length * 15 * 1.6;
    const velocity = 150 + rnd() * 85; // px/s, independent of length
    cols.push({
      left: 2 + i * (96 / (n - 1)),
      dur: (BOX + height) / velocity,
      delay: rnd() * 3.5,
      color: colors[Math.floor(rnd() * 3)],
      bits,
    });
  }
  return cols;
})();

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

  return (
    <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-xl bg-[#0C0709] px-8 py-14">
      {COLUMNS.map((col, i) => (
        <div
          key={i}
          aria-hidden
          className="pointer-events-none absolute top-0 font-mono text-sm font-semibold leading-[1.6]"
          style={{
            left: `${col.left}%`,
            color: col.color,
            WebkitMaskImage:
              "linear-gradient(180deg,transparent 0%,#000 42%,#000 100%)",
            maskImage:
              "linear-gradient(180deg,transparent 0%,#000 42%,#000 100%)",
            animation: `eriFall ${col.dur}s linear ${col.delay}s infinite backwards`,
          }}
        >
          {col.bits.map((b, j) => (
            <div
              key={j}
              style={
                j === col.bits.length - 1
                  ? { color: "#FFEAD9", textShadow: "0 0 12px #F4A63F,0 0 4px #fff" }
                  : { textShadow: "0 0 7px currentColor" }
              }
            >
              {b}
            </div>
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
          src="/eri-mark.png"
          alt=""
          className="relative h-[120px] w-[120px] rounded-full"
        />
      </div>
      <p className="relative font-display text-xl text-[#F3E9E4]">{label}</p>
    </div>
  );
}
