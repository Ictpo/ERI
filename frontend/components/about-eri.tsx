"use client";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

/**
 * The one place Erine's original painting appears — the credits.
 * Everything else in the app uses the derived round mark (eri-icon.png).
 */
export function AboutEri() {
  return (
    <Dialog>
      <DialogTrigger className="text-sm text-slate-500 transition-colors hover:text-indigo-600">
        About Eri
      </DialogTrigger>
      {/* overflow-hidden + p-0 lets the card fill the dialog edge-to-edge */}
      <DialogContent className="max-w-xl overflow-hidden border-0 bg-[#0C0709] p-0">
        <div className="grid grid-cols-[0.75fr_1.25fr]">
          <div className="relative min-h-[230px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/eri-fox.jpg"
              alt="Fox painting by Erine Chen Bi Ting, the origin of Eri's identity"
              className="h-full w-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(90deg,transparent 55%,#0C0709)",
              }}
            />
          </div>
          <div className="p-7">
            <div className="mb-3 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/eri-icon.png" alt="" className="h-7 w-7 rounded-full" />
              <span className="font-display text-xl font-semibold text-[#F3E9E4]">
                About Eri
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[#C9B8B0]">
              Eri is a friendlier successor to Iramuteq — text analysis anyone
              can follow. Inspired by a dear friend, whose warmth shapes the
              identity; she also drew the fox.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#241519] pt-3">
              <Credit label="Design & build" name="Victor R Prados" />
              <Credit label="Inspiration & art" name="Erine Chen Bi Ting" />
            </div>
            <div
              className="mt-4 h-1 rounded-full"
              style={{
                background: "linear-gradient(90deg,#D6266F,#F0704A,#F4A63F)",
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Credit({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-[#7E6C64]">
        {label}
      </div>
      <div className="text-sm font-semibold text-[#F3E9E4]">{name}</div>
    </div>
  );
}
