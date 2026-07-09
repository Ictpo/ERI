import { ProjectList } from "@/components/projects/project-list";
import { ScatterChart } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <ScatterChart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              ERI: Engine for Reinert Insights
            </h1>
            <p className="text-sm text-slate-500">
              Statistical text analysis in the browser — word statistics, Reinert
              classification, similarity networks and correspondence analysis.
            </p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <ProjectList />
      </div>
    </main>
  );
}
