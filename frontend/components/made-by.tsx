"use client";

import { cn } from "@/lib/utils";

/**
 * Author credit, shown in the home header and the workspace sidebar.
 *
 * A plain target="_blank" link. In the desktop build pywebview hands
 * new-window requests to the system browser (OPEN_EXTERNAL_LINKS_IN_BROWSER,
 * pinned in backend/desktop.py), so the app window never navigates away; in a
 * normal browser it opens a new tab.
 */
const LINKEDIN_URL = "https://www.linkedin.com/in/victor-ramalho-prados-47a1b334a/";

export function MadeBy({ className }: { className?: string }) {
  return (
    <a
      href={LINKEDIN_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        // Sits one step below the surrounding UI text, and lightens further
        // when highlighted; the underline carries the affordance so the
        // lighter hover never costs discoverability.
        "text-sm text-slate-500 underline-offset-4 transition-colors",
        "hover:text-slate-400 hover:underline",
        "focus-visible:text-slate-400 focus-visible:underline focus-visible:outline-none",
        className
      )}
    >
      made by Victor R Prados
    </a>
  );
}
