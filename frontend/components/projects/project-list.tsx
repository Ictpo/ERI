"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
  FileText,
  CalendarDays,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { toastError } from "@/lib/toast-error";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectList() {
  const router = useRouter();
  const [projects, setProjects] = React.useState<Project[] | null>(null);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Project | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  const load = React.useCallback(async () => {
    setLoadFailed(false);
    setProjects(null);
    try {
      setProjects(await api.listProjects());
    } catch (err) {
      setLoadFailed(true);
      setProjects([]);
      toastError(err, "Could not load projects");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const project = await api.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setCreateOpen(false);
      setName("");
      setDescription("");
      router.push(`/project/${project.id}`);
    } catch (err) {
      toastError(err, "Could not create project");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.deleteProject(deleteTarget.id);
      setProjects((prev) =>
        prev ? prev.filter((p) => p.id !== deleteTarget.id) : prev
      );
      setDeleteTarget(null);
    } catch (err) {
      toastError(err, "Could not delete project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> New project
        </Button>
      </div>

      {projects === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : loadFailed ? (
        <Card className="mx-auto max-w-md">
          <CardHeader>
            <CardTitle>Could not reach the server</CardTitle>
            <CardDescription>
              The project list could not be loaded. Make sure the backend is
              running, then retry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={load}>
              <RefreshCw /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-slate-300 bg-white/60 py-16 text-center">
          <FolderOpen className="mb-3 h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-700">No projects yet</p>
          <p className="mb-4 mt-1 max-w-sm text-sm text-slate-500">
            Create a project, upload a corpus of texts, and run your first
            analysis.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Create your first project
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="group relative transition-shadow hover:shadow-md"
            >
              <Link
                href={`/project/${project.id}`}
                className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 pr-8">
                    <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
                    <span className="truncate">{project.name}</span>
                  </CardTitle>
                  <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                    {project.description || "No description."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="flex items-center gap-1.5 text-xs text-slate-400">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Created {formatDate(project.created_at)}
                  </p>
                </CardContent>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${project.name}`}
                className="absolute right-2 top-2 h-8 w-8 text-slate-400 opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => setDeleteTarget(project)}
              >
                <Trash2 />
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              A project holds one corpus and its analyses.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Interview study 2026"
                autoFocus
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-description">Description (optional)</Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this corpus about?"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              Delete “{deleteTarget?.name}” and all of its analyses? This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={busy}>
              <Trash2 /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
