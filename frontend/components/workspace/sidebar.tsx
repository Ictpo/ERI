"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileText,
  Network,
  PanelLeft,
  ScatterChart,
  Trash2,
  Split,
} from "lucide-react";
import type { Analysis, AnalysisType, ProjectDetail } from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { AboutEri } from "@/components/about-eri";
import { PlainModeToggle } from "@/components/ui/plain-mode-toggle";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProgressMap } from "./workspace";

export const ANALYSIS_META: Record<
  AnalysisType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  stats: { label: "Text statistics", icon: BarChart3 },
  chd: { label: "Reinert classification", icon: Split },
  similarity: { label: "Similarity network", icon: Network },
  afc: { label: "Correspondence analysis", icon: ScatterChart },
};

function StatusDot({ status }: { status: Analysis["status"] }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        (status === "queued" || status === "running") &&
          "animate-pulse bg-amber-500",
        status === "done" && "bg-emerald-500",
        status === "error" && "bg-red-500"
      )}
      aria-label={status}
    />
  );
}

export function Sidebar({
  project,
  analyses,
  progress,
  openAnalysisId,
  onOpenAnalysis,
  onDeleteAnalysis,
}: {
  project: ProjectDetail;
  analyses: Analysis[];
  progress: ProgressMap;
  openAnalysisId: string | null;
  onOpenAnalysis: (id: string) => void;
  onDeleteAnalysis: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const summary = project.corpus_summary;

  if (collapsed) {
    return (
      <aside className="flex shrink-0 flex-row items-center gap-2 border-b border-slate-200 bg-white p-2 md:w-12 md:flex-col md:border-b-0 md:border-r">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <PanelLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand sidebar</TooltipContent>
        </Tooltip>
      </aside>
    );
  }

  return (
    <aside className="flex max-h-[45vh] w-full shrink-0 flex-col border-b border-slate-200 bg-white md:max-h-none md:w-[260px] md:border-b-0 md:border-r">
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-slate-100 p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/"
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              aria-label="Back to projects"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">All projects</TooltipContent>
        </Tooltip>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold" title={project.name}>
          {project.name}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
        >
          <ChevronLeft />
        </Button>
      </div>

      {/* Corpus section */}
      <div className="border-b border-slate-100 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Corpus
        </p>
        {summary ? (
          <div className="flex items-start gap-2 rounded-md bg-slate-50 p-2.5">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
            <div className="text-xs text-slate-600">
              <p className="font-medium text-slate-800">
                {formatNumber(summary.n_documents)} document
                {summary.n_documents === 1 ? "" : "s"}
              </p>
              <p>
                {formatNumber(summary.n_tokens)} tokens ·{" "}
                {formatNumber(summary.n_forms)} forms
              </p>
              <p>
                {summary.variables.length} variable
                {summary.variables.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-md bg-amber-50 p-2.5 text-xs text-amber-800">
            No corpus yet. Upload one in the center pane.
          </p>
        )}
      </div>

      {/* Analyses history */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Analyses
        </p>
        {analyses.length === 0 ? (
          <p className="px-1 text-xs text-slate-400">
            No analyses yet. Configure one in the center pane.
          </p>
        ) : (
          <ul className="space-y-1">
            {analyses.map((analysis) => {
              const meta = ANALYSIS_META[analysis.type];
              const Icon = meta.icon;
              const event = progress[analysis.id];
              const inFlight =
                analysis.status === "queued" || analysis.status === "running";
              return (
                <li key={analysis.id} className="group relative">
                  <button
                    onClick={() => onOpenAnalysis(analysis.id)}
                    className={cn(
                      "w-full rounded-md p-2 pr-8 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                      openAnalysisId === analysis.id &&
                        "bg-indigo-50 hover:bg-indigo-50"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
                        {meta.label}
                      </span>
                      <StatusDot status={analysis.status} />
                    </span>
                    <span className="mt-0.5 block pl-6 text-[11px] text-slate-400">
                      {formatDate(analysis.created_at)}
                    </span>
                    {inFlight && event && (
                      <span className="mt-1.5 block pl-6">
                        <span className="block h-1 w-full overflow-hidden rounded-full bg-slate-200">
                          <span
                            className="block h-full rounded-full bg-amber-500 transition-[width] duration-300"
                            style={{
                              width: `${Math.round(
                                Math.min(1, Math.max(0, event.progress)) * 100
                              )}%`,
                            }}
                          />
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-amber-700">
                          {event.stage}
                        </span>
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => onDeleteAnalysis(analysis.id)}
                    aria-label="Delete analysis"
                    className="absolute right-1.5 top-1.5 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="hidden border-t border-slate-100 p-2 md:block">
        <p className="flex items-center gap-1 px-1 text-[11px] text-slate-300">
          <ChevronRight className="h-3 w-3" />
          Click an analysis to open its result
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/eri-mark.png" alt="" className="h-4 w-4 rounded-full" />
            <AboutEri />
          </div>
          <PlainModeToggle />
        </div>
      </div>
    </aside>
  );
}
