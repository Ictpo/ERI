import { ProjectList } from "@/components/projects/project-list";
import { AboutEri } from "@/components/about-eri";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/eri-icon.png" alt="Eri" className="h-10 w-10 rounded-lg" />
          <div>
            <h1 className="font-display text-lg font-semibold tracking-tight">
              Eri
            </h1>
            <p className="text-sm text-slate-500">
              Hear the pattern beneath the noise.
            </p>
          </div>
          <div className="ml-auto">
            <AboutEri />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <ProjectList />
      </div>
    </main>
  );
}
