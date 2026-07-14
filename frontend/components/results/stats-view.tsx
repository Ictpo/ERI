"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { StatsResult } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WordCloud } from "./word-cloud";

const PAGE_SIZE = 50;

type SortKey = "form" | "freq" | "docs";

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-semibold tabular-nums tracking-tight">
          {formatNumber(value)}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{label}</p>
      </CardContent>
    </Card>
  );
}

export function StatsView({ result }: { result: StatsResult }) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [sortKey, setSortKey] = React.useState<SortKey>("freq");
  const [sortAsc, setSortAsc] = React.useState(false);
  const [hapaxOpen, setHapaxOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? result.freq.filter((r) => r.form.toLowerCase().includes(q))
      : result.freq.slice();
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "form") cmp = a.form.localeCompare(b.form);
      else cmp = a[sortKey] - b[sortKey];
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [result.freq, query, sortKey, sortAsc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const rows = filtered.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === "form");
    }
    setPage(0);
  }

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    const active = sortKey === k;
    return (
      <button
        onClick={() => toggleSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-slate-900",
          active && "text-slate-900"
        )}
      >
        {label}
        {active &&
          (sortAsc ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </button>
    );
  }

  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="frequencies">Frequencies</TabsTrigger>
        <TabsTrigger value="variables">By variable</TabsTrigger>
        <TabsTrigger value="cloud">Word cloud</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Total tokens" value={result.total_tokens} />
          <StatTile label="Unique forms" value={result.unique_forms} />
          <StatTile label="Hapax legomena" value={result.hapax_count} />
        </div>
        <Card>
          <CardHeader className="pb-3">
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setHapaxOpen((v) => !v)}
              aria-expanded={hapaxOpen}
            >
              <CardTitle className="text-sm">
                Hapax list ({formatNumber(result.hapax.length)} forms occurring
                once)
              </CardTitle>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-slate-400 transition-transform",
                  hapaxOpen && "rotate-180"
                )}
              />
            </button>
          </CardHeader>
          {hapaxOpen && (
            <CardContent>
              {result.hapax.length === 0 ? (
                <p className="text-sm text-slate-400">No hapax in this corpus.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-md bg-slate-50 p-3">
                  <p className="text-xs leading-6 text-slate-600">
                    {result.hapax.map((w) => w.replace(/_+$/, "")).join(" · ")}
                  </p>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="frequencies" className="space-y-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Search forms…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-4 py-2 font-medium">
                  <SortHeader label="Form" k="form" />
                </th>
                <th className="border-b border-slate-200 px-4 py-2 text-right font-medium">
                  <SortHeader label="Frequency" k="freq" />
                </th>
                <th className="border-b border-slate-200 px-4 py-2 text-right font-medium">
                  <SortHeader label="Documents" k="docs" />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.form} className="hover:bg-slate-50/60">
                  <td className="border-b border-slate-100 px-4 py-1.5 font-medium text-slate-700">
                    {row.form.replace(/_+$/, "")}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-1.5 text-right tabular-nums">
                    {formatNumber(row.freq)}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-1.5 text-right tabular-nums">
                    {formatNumber(row.docs)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-sm text-slate-400"
                  >
                    No forms match “{query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            {formatNumber(filtered.length)} forms · page {pageSafe + 1} of{" "}
            {pageCount}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={pageSafe === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={pageSafe >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="variables">
        {result.by_variable.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            This corpus has no variables.
          </p>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-2 font-medium">
                    Variable
                  </th>
                  <th className="border-b border-slate-200 px-4 py-2 font-medium">
                    Modality
                  </th>
                  <th className="border-b border-slate-200 px-4 py-2 text-right font-medium">
                    Tokens
                  </th>
                  <th className="border-b border-slate-200 px-4 py-2 text-right font-medium">
                    Forms
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.by_variable.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="border-b border-slate-100 px-4 py-1.5 text-slate-500">
                      {row.variable}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-1.5 font-medium text-slate-700">
                      {row.modality}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-1.5 text-right tabular-nums">
                      {formatNumber(row.tokens)}
                    </td>
                    <td className="border-b border-slate-100 px-4 py-1.5 text-right tabular-nums">
                      {formatNumber(row.forms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="cloud">
        <WordCloud words={result.cloud} />
      </TabsContent>
    </Tabs>
  );
}
