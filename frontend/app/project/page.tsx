"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Workspace } from "@/components/workspace/workspace";

/* The workspace route uses a query parameter (/project/?id=...) instead of a
   dynamic segment so the app can be statically exported. */

function ProjectFromQuery() {
  const params = useSearchParams();
  const id = params.get("id");
  if (!id) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-lg font-medium text-slate-700">No project selected</p>
        <Link href="/" className="text-sm text-indigo-600 hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }
  return <Workspace projectId={id} />;
}

export default function ProjectPage() {
  return (
    <React.Suspense fallback={null}>
      <ProjectFromQuery />
    </React.Suspense>
  );
}
