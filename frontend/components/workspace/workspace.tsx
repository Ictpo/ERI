"use client";

import * as React from "react";
import { api } from "@/lib/api";
import type {
  Analysis,
  AnalysisEvent,
  AnalysisType,
  CorpusSummary,
  ProjectDetail,
} from "@/lib/types";
import { toastError } from "@/lib/toast-error";
import { toast } from "@/components/ui/use-toast";
import { Sidebar } from "./sidebar";
import { CorpusBuilder } from "./corpus-builder";
import { CorpusComposer } from "./corpus-composer";
import { AnalysisLauncher } from "./analysis-launcher";
import { ResultsPane } from "./results-pane";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListPlus, RefreshCw, Upload } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";

export type ProgressMap = Record<string, AnalysisEvent>;

export function Workspace({ projectId }: { projectId: string }) {
  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [analyses, setAnalyses] = React.useState<Analysis[]>([]);
  const [loadState, setLoadState] = React.useState<"loading" | "error" | "ready">(
    "loading"
  );
  const [openAnalysisId, setOpenAnalysisId] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<ProgressMap>({});
  // null = default view (launcher if corpus, chooser if not);
  // "choose" = pick upload vs compose; "upload" / "compose" = active builder.
  const [builderMode, setBuilderMode] = React.useState<
    "choose" | "upload" | "compose" | null
  >(null);
  const sourcesRef = React.useRef<Map<string, EventSource>>(new Map());

  const load = React.useCallback(async () => {
    setLoadState("loading");
    try {
      const [proj, hist] = await Promise.all([
        api.getProject(projectId),
        api.listAnalyses(projectId),
      ]);
      setProject(proj);
      setAnalyses(hist);
      setLoadState("ready");
    } catch (err) {
      setLoadState("error");
      toastError(err, "Could not load project");
    }
  }, [projectId]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Close all SSE streams on unmount.
  React.useEffect(() => {
    const sources = sourcesRef.current;
    return () => {
      sources.forEach((es) => es.close());
      sources.clear();
    };
  }, []);

  const refreshAnalysis = React.useCallback(async (analysisId: string) => {
    try {
      const full = await api.getAnalysis(analysisId);
      setAnalyses((prev) => prev.map((a) => (a.id === full.id ? full : a)));
      return full;
    } catch (err) {
      toastError(err, "Could not fetch analysis result");
      return null;
    }
  }, []);

  const subscribe = React.useCallback(
    (analysis: Analysis) => {
      if (sourcesRef.current.has(analysis.id)) return;
      const es = new EventSource(api.analysisEventsUrl(analysis.id));
      sourcesRef.current.set(analysis.id, es);

      const closeStream = () => {
        es.close();
        sourcesRef.current.delete(analysis.id);
      };

      es.onmessage = async (msg) => {
        let event: AnalysisEvent;
        try {
          event = JSON.parse(msg.data) as AnalysisEvent;
        } catch {
          return;
        }
        setProgress((prev) => ({ ...prev, [analysis.id]: event }));
        setAnalyses((prev) =>
          prev.map((a) =>
            a.id === analysis.id ? { ...a, status: event.status } : a
          )
        );
        if (event.status === "done") {
          closeStream();
          const full = await refreshAnalysis(analysis.id);
          if (full?.error) {
            toast({
              variant: "destructive",
              title: "Analysis failed",
              description: full.error.hint
                ? `${full.error.message} — ${full.error.hint}`
                : full.error.message,
            });
          }
        } else if (event.status === "error") {
          closeStream();
          const full = await refreshAnalysis(analysis.id);
          const message = full?.error?.message ?? event.message;
          const hint = full?.error?.hint ?? null;
          toast({
            variant: "destructive",
            title: "Analysis failed",
            description: hint ? `${message} — ${hint}` : message,
          });
        }
      };

      es.onerror = () => {
        // Stream dropped: stop listening and poll once for the final state.
        closeStream();
        refreshAnalysis(analysis.id);
      };
    },
    [refreshAnalysis]
  );

  // Resume progress streams for analyses still in flight after a reload.
  React.useEffect(() => {
    analyses
      .filter((a) => a.status === "queued" || a.status === "running")
      .forEach((a) => subscribe(a));
  }, [analyses, subscribe]);

  // History items arrive without their result payload — fetch it on open.
  React.useEffect(() => {
    if (!openAnalysisId) return;
    const open = analyses.find((a) => a.id === openAnalysisId);
    if (open && open.status === "done" && open.result === null) {
      refreshAnalysis(openAnalysisId);
    }
  }, [openAnalysisId, analyses, refreshAnalysis]);

  async function runAnalysis(type: AnalysisType, params: object) {
    try {
      const { analysis } = await api.createAnalysis(projectId, type, params);
      setAnalyses((prev) => [analysis, ...prev]);
      setOpenAnalysisId(analysis.id);
      setProgress((prev) => ({
        ...prev,
        [analysis.id]: {
          status: analysis.status,
          progress: 0,
          stage: "queued",
          message: "Waiting for worker…",
        },
      }));
      subscribe(analysis);
    } catch (err) {
      toastError(err, "Could not start analysis");
    }
  }

  async function deleteAnalysis(analysisId: string) {
    try {
      await api.deleteAnalysis(analysisId);
      sourcesRef.current.get(analysisId)?.close();
      sourcesRef.current.delete(analysisId);
      setAnalyses((prev) => prev.filter((a) => a.id !== analysisId));
      if (openAnalysisId === analysisId) setOpenAnalysisId(null);
    } catch (err) {
      toastError(err, "Could not delete analysis");
    }
  }

  function handleCorpusSaved(summary: CorpusSummary) {
    setProject((prev) => (prev ? { ...prev, corpus_summary: summary } : prev));
    setBuilderMode(null);
    toast({
      variant: "success",
      title: "Corpus saved",
      description: `${summary.n_documents} documents, ${summary.n_tokens} tokens.`,
    });
  }

  if (loadState === "loading") {
    return (
      <div className="flex h-screen">
        <div className="hidden w-[260px] shrink-0 border-r border-slate-200 bg-white p-4 md:block">
          <Skeleton className="mb-6 h-8 w-3/4" />
          <Skeleton className="mb-3 h-24" />
          <Skeleton className="h-40" />
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="mb-4 h-10 w-1/2" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  if (loadState === "error" || !project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-medium text-slate-700">
          Could not load this project
        </p>
        <p className="max-w-sm text-sm text-slate-500">
          The server did not respond or the project does not exist. Check that
          the backend is running, then retry.
        </p>
        <Button variant="outline" onClick={load}>
          <RefreshCw /> Retry
        </Button>
      </div>
    );
  }

  const hasCorpus = project.corpus_summary !== null && builderMode === null;
  const openAnalysis = analyses.find((a) => a.id === openAnalysisId) ?? null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen flex-col overflow-hidden md:flex-row">
        <Sidebar
          project={project}
          analyses={analyses}
          progress={progress}
          openAnalysisId={openAnalysisId}
          onOpenAnalysis={(id) => setOpenAnalysisId(id)}
          onDeleteAnalysis={deleteAnalysis}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* CENTER: configuration */}
          <section className="min-h-0 flex-1 overflow-y-auto p-6 lg:max-w-[55%]">
            {hasCorpus && project.corpus_summary ? (
              <AnalysisLauncher
                corpusSummary={project.corpus_summary}
                onRun={runAnalysis}
                onReplaceCorpus={() => setBuilderMode("choose")}
              />
            ) : builderMode === "upload" ? (
              <CorpusBuilder
                projectId={projectId}
                hasExistingCorpus={project.corpus_summary !== null}
                onSaved={handleCorpusSaved}
                onCancel={() => setBuilderMode(null)}
              />
            ) : builderMode === "compose" ? (
              <CorpusComposer
                projectId={projectId}
                hasExistingCorpus={project.corpus_summary !== null}
                onSaved={handleCorpusSaved}
                onCancel={() => setBuilderMode(null)}
              />
            ) : (
              <CorpusModeChooser
                hasCorpus={project.corpus_summary !== null}
                onPick={(mode) => setBuilderMode(mode)}
                onCancel={
                  project.corpus_summary !== null
                    ? () => setBuilderMode(null)
                    : undefined
                }
              />
            )}
          </section>
          {/* RIGHT: results viewer */}
          <section className="min-h-[50vh] flex-1 overflow-y-auto border-t border-slate-200 bg-white p-6 lg:min-h-0 lg:min-w-[45%] lg:border-l lg:border-t-0">
            <ResultsPane
              analysis={openAnalysis}
              event={openAnalysis ? progress[openAnalysis.id] : undefined}
              onRetryFetch={
                openAnalysis ? () => refreshAnalysis(openAnalysis.id) : undefined
              }
            />
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}

function CorpusModeChooser({
  hasCorpus,
  onPick,
  onCancel,
}: {
  hasCorpus: boolean;
  onPick: (mode: "upload" | "compose") => void;
  onCancel?: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-4 pt-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          {hasCorpus ? "Replace or edit the corpus" : "Build your corpus"}
        </h2>
        <p className="text-sm text-slate-500">
          Upload a prepared file, or compose it document by document.
        </p>
      </div>
      <button className="w-full text-left" onClick={() => onPick("upload")}>
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Upload a file</CardTitle>
              <CardDescription>
                A .txt (legacy &quot;****&quot; markers supported) or a .csv
                table — then review and edit variables.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </button>
      <button className="w-full text-left" onClick={() => onPick("compose")}>
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <ListPlus className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">
                Compose document by document
                {hasCorpus ? " (loads the current corpus)" : ""}
              </CardTitle>
              <CardDescription>
                Define variables once, then paste each interview and pick its
                values from dropdowns — no markers to write.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </button>
      {onCancel && (
        <div className="text-center">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
