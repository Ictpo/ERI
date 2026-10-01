import { ProjectList } from "@/components/projects/project-list";
import { MadeBy } from "@/components/made-by";
import { PlainModeToggle } from "@/components/ui/plain-mode-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-5">
          {/* alt="" — the name is spelled out next to it, so announcing the
              mark too would just repeat it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/eri-mark.png" alt="" className="h-10 w-10 rounded-lg" />
          <div>
            <h1 className="font-display text-lg font-semibold tracking-tight">
              ERI: Engine for Reinert Insights
            </h1>
            <p className="text-sm text-slate-500">
              Hear the pattern beneath the noise.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-5">
            <TooltipProvider delayDuration={200}>
              <PlainModeToggle />
            </TooltipProvider>
            <MadeBy />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <ProjectList />
      </div>
    </main>
  );
}
