"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

/** Previous/next controls for long lists: only one page is rendered. */
export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
      <span className="tabular-nums">
        {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        aria-label="Previous page"
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPage(page + 1)}
        disabled={page >= pageCount - 1}
        aria-label="Next page"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
