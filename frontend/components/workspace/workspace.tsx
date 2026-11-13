"use client";

import * as React from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type {
  Analysis,
  AnalysisEvent,
  AnalysisType,
  CorpusSummary,
  ProjectDetail,
} from "@/lib/types";
import { toastError } from "@/lib/toast-error";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { Sidebar } from "./sidebar";
import { CorpusBuilder } from "./corpus-builder";
import { CorpusComposer } from "./corpus-composer";
import { ConfirmDialog } from "./confirm-dialog";
import { AnalysisLauncher } from "./analysis-launcher";
import { ResultsPane } from "./results-pane";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListPlus, RefreshCw, Upload } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";

export type ProgressMap = Record<string, AnalysisEvent>;

// Reconnects allowed after a progress stream drops without a final event.
const MAX_STREAM_RETRIES = 5;

export function Workspace({ projectId }: { projectId: string }) {
  const [project, setProject] = React.useState<ProjectDetail | null>(null);
  const [analyses, setAnalyses] = React.useState<Analysis[]>([]);
  const [loadState, setLoadState] = React.useState<
    "loading" | "error" | "missing" | "ready"
  >("loading");
  const [openAnalysisId, setOpenAnalysisId] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<ProgressMap>({});
  // null = default view (launcher if corpus, chooser if not);
  // "choose" = pick upload vs compose; "upload" / "compose" = active builder.
  const [builderMode, setBuilderMode] = React.useState<
    "choose" | "upload" | "compose" | null
  >(null);
  // True while the corpus builder/composer holds unsaved work.
  const [unsavedWork, setUnsavedWork] = React.useState(false);
  // Analysis awaiting delete confirmation.
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const sourcesRef = React.useRef<Map<string, EventSource>>(new Map());
  // Dropped streams per analysis, to cap reconnects (see onerror below).
  const dropsRef = React.useRef<Map<string, number>>(new Map());

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
      // A 404 means the project is gone (deleted), not that ERI is broken.
      setLoadState(
        err instanceof ApiError && err.status === 404 ? "missing" : "error"
      );
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

  // One result request per analysis at a time: the "done" event and the
  // open-result effect both ask for the same result.
  const inflightRef = React.useRef<Map<string, Promise<Analysis | null>>>(
    new Map()
  );
  // Analyses whose last result fetch failed. Any other finished analysis
  // without a result is still loading.
  const [failedFetches, setFailedFetches] = React.useState<ReadonlySet<string>>(
    () => new Set()
  );

  const refreshAnalysis = React.useCallback((analysisId: string) => {
    const pending = inflightRef.current.get(analysisId);
    if (pending) return pending;
    const markFailed = (failed: boolean) =>
      setFailedFetches((prev) => {
        if (prev.has(analysisId) === failed) return prev;
        const next = new Set(prev);
        if (failed) next.add(analysisId);
        else next.delete(analysisId);
        return next;
      });
    markFailed(false);
    const request = api
      .getAnalysis(analysisId)
      .then((full) => {
        setAnalyses((prev) => prev.map((a) => (a.id === full.id ? full : a)));
        return full as Analysis | null;
      })
      .catch((err) => {
        markFailed(true);
        toastError(err, "Could not fetch analysis result");
        return null;
      })
      .finally(() => inflightRef.current.delete(analysisId));
    inflightRef.current.set(analysisId, request);
    return request;
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
        // Stream dropped without a final event: stop listening, then
        // re-check the stored state after a growing pause. The resume effect
        // reconnects only while the analysis is still in flight, at most
        // MAX_STREAM_RETRIES times, so a stuck row can never spin a loop.
        closeStream();
        const drops = (dropsRef.current.get(analysis.id) ?? 0) + 1;
        dropsRef.current.set(analysis.id, drops);
        window.setTimeout(() => refreshAnalysis(analysis.id), 1000 * drops);
      };
    },
    [refreshAnalysis]
  );

  // Resume progress streams for analyses still in flight after a reload.
  React.useEffect(() => {
    analyses
      .filter(
        (a) =>
          (a.status === "queued" || a.status === "running") &&
          (dropsRef.current.get(a.id) ?? 0) < MAX_STREAM_RETRIES
      )
      .forEach((a) => subscribe(a));
  }, [analyses, subscribe]);

  // History items arrive without their result payload — fetch it on open
  // (not again after a failed fetch: the pane offers Retry for that).
  React.useEffect(() => {
    if (!openAnalysisId) return;
    const open = analyses.find((a) => a.id === openAnalysisId);
    if (
      open &&
      open.status === "done" &&
      open.result === null &&
      !failedFetches.has(openAnalysisId)
    ) {
      refreshAnalysis(openAnalysisId);
    }
  }, [openAnalysisId, analyses, failedFetches, refreshAnalysis]);

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

  if (loadState === "missing") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-medium text-slate-700">
          This project no longer exists
        </p>
        <p className="max-w-sm text-sm text-slate-500">
          It may have been deleted. Your other projects are on the project list.
        </p>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Back to projects
        </Link>
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
          ERI&apos;s analysis engine did not respond. Retry, and if that does
          not help, close ERI and open it again.
        </p>
        <Button variant="outline" onClick={load}>
          <RefreshCw /> Retry
        </Button>
      </div>
    );
  }

  const hasCorpus = project.corpus_summary !== null && builderMode === null;
  const openAnalysis = analyses.find((a) => a.id === openAnalysisId) ?? null;
  // While the corpus is being built there is no result to show, so the
  // builder gets the full width, unless the user opens a past result.
  const showResults = hasCorpus || openAnalysis !== null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen flex-col overflow-hidden md:flex-row">
        <Sidebar
          project={project}
          analyses={analyses}
          progress={progress}
          openAnalysisId={openAnalysisId}
          onOpenAnalysis={(id) => setOpenAnalysisId(id)}
          onDeleteAnalysis={setPendingDelete}
          confirmLeave={unsavedWork}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* CENTER: configuration */}
          <section
            className={cn(
              "min-h-0 flex-1 overflow-y-auto p-6",
              showResults && "lg:max-w-[55%]"
            )}
          >
            {hasCorpus && project.corpus_summary ? (
              <AnalysisLauncher
                corpusSummary={project.corpus_summary}
                history={analyses}
                onRun={runAnalysis}
                onReplaceCorpus={() => setBuilderMode("choose")}
              />
            ) : builderMode === "upload" ? (
              <CorpusBuilder
                projectId={projectId}
                hasExistingCorpus={project.corpus_summary !== null}
                onSaved={handleCorpusSaved}
                onCancel={() => setBuilderMode(null)}
                onDirtyChange={setUnsavedWork}
              />
            ) : builderMode === "compose" ? (
              <CorpusComposer
                projectId={projectId}
                hasExistingCorpus={project.corpus_summary !== null}
                onSaved={handleCorpusSaved}
                onCancel={() => setBuilderMode(null)}
                onDirtyChange={setUnsavedWork}
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
          {showResults && (
            <section className="min-h-[50vh] flex-1 overflow-y-auto border-t border-slate-200 bg-white p-6 lg:min-h-0 lg:min-w-[45%] lg:border-l lg:border-t-0">
              <ResultsPane
                analysis={openAnalysis}
                event={openAnalysis ? progress[openAnalysis.id] : undefined}
                corpus={project.corpus_summary}
                resultFailed={
                  openAnalysis ? failedFetches.has(openAnalysis.id) : false
                }
                onRetryFetch={
                  openAnalysis ? () => refreshAnalysis(openAnalysis.id) : undefined
                }
              />
            </section>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this analysis?"
        description="Its result will be removed from the project. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) deleteAnalysis(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
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
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {hasCorpus ? "Replace or edit the corpus" : "Build your corpus"}
        </h2>
        <p className="text-sm text-slate-600">
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
