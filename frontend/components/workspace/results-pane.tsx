"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { FlaskConical, RefreshCw, XCircle } from "lucide-react";
import { EriLoader } from "@/components/ui/eri-loader";
import type {
  AfcResult,
  Analysis,
  AnalysisEvent,
  ChdResult,
  SimilarityResult,
  StatsResult,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { ANALYSIS_META } from "./sidebar";
import { formatDate } from "@/lib/utils";

const StatsView = dynamic(
  () => import("@/components/results/stats-view").then((m) => m.StatsView),
  { ssr: false, loading: () => <ResultSkeleton /> }
);
const ChdView = dynamic(
  () => import("@/components/results/chd-view").then((m) => m.ChdView),
  { ssr: false, loading: () => <ResultSkeleton /> }
);
const SimilarityView = dynamic(
  () =>
    import("@/components/results/similarity-view").then((m) => m.SimilarityView),
  { ssr: false, loading: () => <ResultSkeleton /> }
);
const AfcView = dynamic(
  () => import("@/components/results/afc-view").then((m) => m.AfcView),
  { ssr: false, loading: () => <ResultSkeleton /> }
);

function ResultSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-64" />
      <Skeleton className="h-32" />
    </div>
  );
}

export function ResultsPane({
  analysis,
  event,
  onRetryFetch,
}: {
  analysis: Analysis | null;
  event?: AnalysisEvent;
  onRetryFetch?: () => void;
}) {
  if (!analysis) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
          <FlaskConical className="h-8 w-8 text-slate-300" />
        </div>
        <p className="font-medium text-slate-600">No result open</p>
        <p className="mt-1 max-w-xs text-sm text-slate-400">
          Run an analysis from the center pane, or pick one from the history in
          the sidebar.
        </p>
      </div>
    );
  }

  const meta = ANALYSIS_META[analysis.type];

  // In-flight: progress bar + stage text
  if (analysis.status === "queued" || analysis.status === "running") {
    const pct = Math.round(Math.min(1, Math.max(0, event?.progress ?? 0)) * 100);
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
        {/* Decorative brand loader (plain mode swaps it for a plain spinner).
            The stage/message/percentage below are functional progress
            feedback and stay in BOTH modes. */}
        <EriLoader label={`${meta.label} running…`} />
        <p className="mt-4 text-sm text-slate-500">
          {event?.message || "Waiting for progress events…"}
        </p>
        <div className="mt-5 w-full max-w-sm">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-indigo-600 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-slate-400">
            <span>{event?.stage ?? "queued"}</span>
            <span>{pct}%</span>
          </div>
        </div>
      </div>
    );
  }

  if (analysis.status === "error") {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-4 text-center">
        <XCircle className="mb-4 h-8 w-8 text-red-500" />
        <p className="font-medium text-slate-700">{meta.label} failed</p>
        <Alert variant="destructive" className="mt-4 max-w-md text-left">
          <div>
            <p className="font-medium">
              {analysis.error?.message ?? "The analysis ended with an error."}
            </p>
            {analysis.error?.hint && (
              <p className="mt-1 text-red-700/80">{analysis.error.hint}</p>
            )}
          </div>
        </Alert>
      </div>
    );
  }

  // done but result missing (e.g. fetch after done failed)
  if (!analysis.result) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
        <p className="font-medium text-slate-700">Result not loaded</p>
        <p className="mt-1 max-w-xs text-sm text-slate-500">
          The analysis finished but its result could not be fetched.
        </p>
        {onRetryFetch && (
          <Button variant="outline" className="mt-4" onClick={onRetryFetch}>
            <RefreshCw /> Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{meta.label}</h2>
        <p className="text-sm text-slate-400">
          Finished{" "}
          {analysis.finished_at
            ? formatDate(analysis.finished_at)
            : formatDate(analysis.created_at)}
        </p>
      </div>
      {analysis.type === "stats" && (
        <StatsView result={analysis.result as StatsResult} />
      )}
      {analysis.type === "chd" && (
        <ChdView result={analysis.result as ChdResult} />
      )}
      {analysis.type === "similarity" && (
        <SimilarityView result={analysis.result as SimilarityResult} />
      )}
      {analysis.type === "afc" && <AfcView result={analysis.result as AfcResult} />}
    </div>
  );
}
