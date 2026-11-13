"use client";

import * as React from "react";
import {
  Download,
  FileText,
  Hash,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { CorpusSummary } from "@/lib/types";
import { toastError } from "@/lib/toast-error";
import { downloadBlob } from "@/lib/export";
import { formatNumber, truncate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pager } from "./pager";
import { ConfirmDialog } from "./confirm-dialog";

/* MyBib-style corpus composer: define the variable schema once, then add
   documents one by one (paste text, pick variable values from dropdowns).
   ERI assembles the corpus — no hand-written '****' markers needed. */

type VarDef = { name: string; values: string[]; auto: boolean };
type Doc = { text: string; variables: Record<string, string> };

// A removal that would lose typed text or picked values asks first.
type Removal =
  | { kind: "doc"; index: number }
  | { kind: "variable"; name: string; used: number }
  | { kind: "value"; varName: string; value: string; used: number };

function describeRemoval(r: Removal) {
  const docs = (n: number) => `${n} document${n === 1 ? "" : "s"}`;
  if (r.kind === "doc")
    return {
      title: `Delete document ${r.index + 1}?`,
      description:
        "Its text and variable values will be removed from the corpus. This cannot be undone.",
      confirmLabel: "Delete",
    };
  if (r.kind === "variable")
    return {
      title: `Delete variable ${r.name}?`,
      description: `Its values will be removed from ${docs(r.used)}. This cannot be undone.`,
      confirmLabel: "Delete",
    };
  return {
    title: `Remove value ${r.value}?`,
    description: `${docs(r.used)} will be left with no ${r.varName} value. This cannot be undone.`,
    confirmLabel: "Remove",
  };
}

const NONE = "__none__";
const ADD_NEW = "__add_new__";
// Documents shown at once. Loading a large corpus used to put every
// document's full text in the page.
const PAGE_SIZE = 50;

function tokenCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function sanitizeName(raw: string): string {
  // No "_": in a `*name_value` tag the first underscore ends the name.
  return raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
}

function sanitizeValue(raw: string): string {
  return raw.trim().replace(/[\s*]+/g, "_").slice(0, 32);
}

/** Tag-safe name/value for `*name_value`. The parser (backend
    corpus_parse._parse_tags) splits a tag at its FIRST underscore and ends it
    at whitespace or "*"; names and values loaded from a CSV or an existing
    corpus were never sanitized, so clean them when writing the tag. */
function tagName(name: string): string {
  return name.replace(/[_\s*]+/g, "");
}

function tagValue(value: string): string {
  return value.trim().replace(/[\s*]+/g, "_");
}

export function CorpusComposer({
  projectId,
  hasExistingCorpus,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  projectId: string;
  hasExistingCorpus: boolean;
  onSaved: (summary: CorpusSummary) => void;
  onCancel?: () => void;
  /** Reports whether the composer holds unsaved work (for leave prompts). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [schema, setSchema] = React.useState<VarDef[]>([]);
  const [docs, setDocs] = React.useState<Doc[]>([]);
  const [loading, setLoading] = React.useState(hasExistingCorpus);
  const [saving, setSaving] = React.useState(false);
  const [newVarName, setNewVarName] = React.useState("");
  // Text editor dialog: index of the doc being edited, or "new".
  const [editing, setEditing] = React.useState<number | "new" | null>(null);
  const [draftText, setDraftText] = React.useState("");
  const [page, setPage] = React.useState(0);
  // Inline "add new value" state for a specific doc x variable cell.
  const [addingValue, setAddingValue] = React.useState<{
    doc: number;
    varName: string;
    text: string;
  } | null>(null);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [pendingRemoval, setPendingRemoval] = React.useState<Removal | null>(null);
  // Unsaved work: every edit replaces `docs`/`schema` with a new array, so
  // comparing with the arrays present right after loading is enough.
  const baseline = React.useRef<{ schema: VarDef[]; docs: Doc[] } | null>(null);
  const [dirty, setDirty] = React.useState(false);

  // Editing an existing corpus: load it and infer the schema.
  React.useEffect(() => {
    if (!hasExistingCorpus) return;
    let cancelled = false;
    (async () => {
      try {
        const { documents, summary } = await api.getCorpus(projectId);
        if (cancelled) return;
        setDocs(
          documents.map((d) => ({ text: d.text, variables: { ...d.variables } }))
        );
        setSchema(
          summary.variables.map((v) => ({
            name: v.name,
            values: [...v.modalities],
            auto: false,
          }))
        );
      } catch (err) {
        toastError(err, "Could not load the existing corpus");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, hasExistingCorpus]);

  React.useEffect(() => {
    if (loading) return;
    if (!baseline.current) {
      baseline.current = { schema, docs };
      return;
    }
    setDirty(
      schema !== baseline.current.schema || docs !== baseline.current.docs
    );
  }, [schema, docs, loading]);
  React.useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  React.useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // ---- schema operations ----

  function addVariable() {
    const name = sanitizeName(newVarName);
    if (!name) return;
    if (schema.some((v) => v.name === name)) {
      setNewVarName("");
      return;
    }
    setSchema((prev) => [...prev, { name, values: [], auto: false }]);
    setNewVarName("");
  }

  function removeVariable(name: string) {
    setSchema((prev) => prev.filter((v) => v.name !== name));
    setDocs((prev) =>
      prev.map((d) => {
        const variables = { ...d.variables };
        delete variables[name];
        return { ...d, variables };
      })
    );
  }

  function setAuto(name: string, auto: boolean) {
    setSchema((prev) =>
      prev.map((v) => (v.name === name ? { ...v, auto } : v))
    );
  }

  function removeValue(varName: string, value: string) {
    setSchema((prev) =>
      prev.map((v) =>
        v.name === varName
          ? { ...v, values: v.values.filter((x) => x !== value) }
          : v
      )
    );
    setDocs((prev) =>
      prev.map((d) => {
        if (d.variables[varName] !== value) return d;
        const variables = { ...d.variables };
        delete variables[varName];
        return { ...d, variables };
      })
    );
  }

  // Ask first only when something typed or picked would be lost.
  function askRemoveVariable(name: string) {
    const used = docs.filter((d) => d.variables[name]).length;
    if (used === 0) removeVariable(name);
    else setPendingRemoval({ kind: "variable", name, used });
  }

  function askRemoveValue(varName: string, value: string) {
    const used = docs.filter((d) => d.variables[varName] === value).length;
    if (used === 0) removeValue(varName, value);
    else setPendingRemoval({ kind: "value", varName, value, used });
  }

  function confirmRemoval() {
    const r = pendingRemoval;
    setPendingRemoval(null);
    if (r?.kind === "doc") removeDoc(r.index);
    else if (r?.kind === "variable") removeVariable(r.name);
    else if (r) removeValue(r.varName, r.value);
  }

  // ---- document operations ----

  function openEditor(target: number | "new") {
    setDraftText(target === "new" ? "" : docs[target].text);
    setEditing(target);
  }

  function commitEditor(addAnother: boolean) {
    const text = draftText.trim();
    if (!text) return;
    if (editing === "new") {
      setDocs((prev) => [...prev, { text, variables: {} }]);
      setPage(Math.floor(docs.length / PAGE_SIZE)); // page of the new document
    } else if (editing !== null) {
      setDocs((prev) =>
        prev.map((d, i) => (i === editing ? { ...d, text } : d))
      );
    }
    if (addAnother) {
      setDraftText("");
      setEditing("new");
    } else {
      setEditing(null);
    }
  }

  function removeDoc(index: number) {
    setDocs((prev) => prev.filter((_, i) => i !== index));
  }

  function setDocValue(index: number, varName: string, value: string) {
    setDocs((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d;
        const variables = { ...d.variables };
        if (value) variables[varName] = value;
        else delete variables[varName];
        return { ...d, variables };
      })
    );
  }

  function commitNewValue() {
    if (!addingValue) return;
    const value = sanitizeValue(addingValue.text);
    if (value) {
      setSchema((prev) =>
        prev.map((v) =>
          v.name === addingValue.varName && !v.values.includes(value)
            ? { ...v, values: [...v.values, value] }
            : v
        )
      );
      setDocValue(addingValue.doc, addingValue.varName, value);
    }
    setAddingValue(null);
  }

  // ---- assemble / persist ----

  function finalVariables(doc: Doc, index: number): Record<string, string> {
    const out: Record<string, string> = {};
    schema.forEach((v) => {
      if (v.auto) out[v.name] = String(index + 1);
      else if (doc.variables[v.name]) out[v.name] = doc.variables[v.name];
    });
    return out;
  }

  async function saveCorpus() {
    setSaving(true);
    try {
      const summary = await api.saveCorpus(
        projectId,
        docs.map((d, i) => ({
          id: `doc_${i + 1}`,
          text: d.text,
          variables: finalVariables(d, i),
        }))
      );
      onSaved(summary);
    } catch (err) {
      toastError(err, "Could not save the corpus");
    } finally {
      setSaving(false);
    }
  }

  function exportTxt() {
    const parts = docs.map((d, i) => {
      const variables = finalVariables(d, i);
      const tags = schema
        .filter((v) => variables[v.name] && tagName(v.name))
        .map((v) => `*${tagName(v.name)}_${tagValue(variables[v.name])}`)
        .join(" ");
      return `**** ${tags}`.trimEnd() + `\n${d.text.trim()}\n`;
    });
    downloadBlob(
      new Blob([parts.join("\n")], { type: "text/plain;charset=utf-8" }),
      "corpus.txt"
    );
  }

  const canSave = docs.length > 0 && !saving;
  const pageCount = Math.max(1, Math.ceil(docs.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * PAGE_SIZE;
  // Word counts for the visible page, recomputed when documents change and
  // not on every keystroke in the editor dialog.
  const pageWordCounts = React.useMemo(
    () => docs.slice(start, start + PAGE_SIZE).map((d) => tokenCount(d.text)),
    [docs, start]
  );
  // A stray click outside the editor, or Esc, must not throw away a pasted
  // interview; its Cancel and close buttons still discard on purpose.
  const editorDirty =
    editing !== null &&
    draftText.trim() !==
      (editing === "new" ? "" : docs[editing]?.text ?? "").trim();
  const removal = pendingRemoval ? describeRemoval(pendingRemoval) : null;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Corpus composer
          </h2>
          <p className="text-sm text-slate-600">
            Define your variables once, then add one document per interview —
            no &quot;****&quot; markers to hand-write.
          </p>
        </div>
        {onCancel && (
          <Button
            variant="ghost"
            onClick={() => (dirty ? setConfirmCancel(true) : onCancel())}
          >
            Cancel
          </Button>
        )}
        <Button
          variant="outline"
          onClick={exportTxt}
          disabled={docs.length === 0}
        >
          <Download /> Export .txt
        </Button>
        <Button onClick={saveCorpus} disabled={!canSave}>
          <Save /> {saving ? "Saving…" : "Save corpus"}
        </Button>
      </div>

      {/* Variable schema */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Variables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {schema.length === 0 && (
            <p className="text-sm text-slate-500">
              Add a variable such as <span className="font-mono">RESP</span>,{" "}
              <span className="font-mono">GEN</span> or{" "}
              <span className="font-mono">FACUL</span>. Each document then
              picks one value per variable from a dropdown.
            </p>
          )}
          {schema.map((v) => (
            <div
              key={v.name}
              className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2"
            >
              <Badge className="font-mono">{v.name}</Badge>
              {v.auto ? (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Hash className="h-3.5 w-3.5" /> auto-numbered 1…
                  {Math.max(docs.length, 1)}
                </span>
              ) : v.values.length === 0 ? (
                <span className="text-xs text-slate-500">
                  no values yet — add them from a document&apos;s dropdown
                </span>
              ) : (
                v.values.map((value) => (
                  <span
                    key={value}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                  >
                    {value}
                    <button
                      onClick={() => askRemoveValue(v.name, value)}
                      aria-label={`Remove value ${value}`}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
              <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
                <Switch
                  checked={v.auto}
                  onCheckedChange={(checked) => setAuto(v.name, checked)}
                />
                Auto-number
              </label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => askRemoveVariable(v.name)}
                aria-label={`Delete variable ${v.name}`}
              >
                <Trash2 className="h-4 w-4 text-slate-400" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              value={newVarName}
              placeholder="New variable name (letters and numbers)"
              className="max-w-xs"
              onChange={(e) => setNewVarName(sanitizeName(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") addVariable();
              }}
            />
            <Button
              variant="outline"
              onClick={addVariable}
              disabled={!newVarName}
            >
              <Plus /> Add variable
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-slate-700">
          Documents ({docs.length})
        </h3>
        <Button variant="outline" size="sm" onClick={() => openEditor("new")}>
          <Plus /> Add document
        </Button>
      </div>

      {docs.length === 0 ? (
        <button
          onClick={() => openEditor("new")}
          className="flex w-full flex-col items-center rounded-lg border border-dashed border-slate-300 bg-white/60 py-12 text-center hover:bg-slate-50"
        >
          <FileText className="mb-2 h-8 w-8 text-slate-300" />
          <span className="font-medium text-slate-700">
            Add your first document
          </span>
          <span className="mt-1 text-sm text-slate-500">
            Paste one interview / transcription, then assign its variables.
          </span>
        </button>
      ) : (
        <div className="space-y-2">
          {docs.slice(start, start + PAGE_SIZE).map((doc, offset) => {
            const i = start + offset;
            return (
            <Card key={i}>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Document {i + 1}</Badge>
                  <span className="text-xs text-slate-500">
                    {formatNumber(pageWordCounts[offset])} words
                  </span>
                  <div className="ml-auto flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditor(i)}
                      aria-label={`Edit document ${i + 1}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPendingRemoval({ kind: "doc", index: i })}
                      aria-label={`Delete document ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4 text-slate-400" />
                    </Button>
                  </div>
                </div>
                <p className="line-clamp-2 text-sm text-slate-600">
                  {truncate(doc.text, 400)}
                </p>
                {schema.length > 0 && (
                  <div className="grid gap-2 pt-1 sm:grid-cols-2 lg:grid-cols-3">
                    {schema.map((v) => (
                      <div key={v.name} className="grid gap-1">
                        <Label className="font-mono text-[11px] uppercase text-slate-500">
                          {v.name}
                        </Label>
                        {v.auto ? (
                          <Badge variant="outline" className="w-fit tabular-nums">
                            <Hash className="h-3 w-3" /> {i + 1}
                          </Badge>
                        ) : addingValue &&
                          addingValue.doc === i &&
                          addingValue.varName === v.name ? (
                          <Input
                            autoFocus
                            value={addingValue.text}
                            placeholder="New value"
                            onChange={(e) =>
                              setAddingValue({
                                ...addingValue,
                                text: e.target.value,
                              })
                            }
                            onBlur={commitNewValue}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitNewValue();
                              if (e.key === "Escape") setAddingValue(null);
                            }}
                          />
                        ) : (
                          <Select
                            value={doc.variables[v.name] ?? NONE}
                            onValueChange={(value) => {
                              if (value === ADD_NEW) {
                                setAddingValue({
                                  doc: i,
                                  varName: v.name,
                                  text: "",
                                });
                              } else {
                                setDocValue(
                                  i,
                                  v.name,
                                  value === NONE ? "" : value
                                );
                              }
                            }}
                          >
                            <SelectTrigger
                              className="h-8"
                              aria-label={`${v.name}, document ${i + 1}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>
                                <span className="text-slate-600">(none)</span>
                              </SelectItem>
                              {v.values.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {value}
                                </SelectItem>
                              ))}
                              <SelectItem value={ADD_NEW}>
                                <span className="text-indigo-600">
                                  + Add new value…
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })}
          <Pager
            page={currentPage}
            pageCount={pageCount}
            total={docs.length}
            pageSize={PAGE_SIZE}
            onPage={setPage}
          />
        </div>
      )}

      {/* Text editor dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent
          className="max-w-2xl"
          onInteractOutside={(e) => {
            if (editorDirty) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (editorDirty) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editing === "new"
                ? `New document (${docs.length + 1})`
                : `Edit document ${typeof editing === "number" ? editing + 1 : ""}`}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={14}
            placeholder="Paste the interview / transcription text here…"
            className="font-mono text-sm"
          />
          <p className="text-xs text-slate-500">
            {formatNumber(tokenCount(draftText))} words
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            {editing === "new" && (
              <Button
                variant="outline"
                onClick={() => commitEditor(true)}
                disabled={!draftText.trim()}
              >
                Save & add next
              </Button>
            )}
            <Button
              onClick={() => commitEditor(false)}
              disabled={!draftText.trim()}
            >
              Save document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmCancel}
        title="Discard your changes?"
        description="The documents and variables you added or edited here are not saved. Leaving the composer discards them."
        confirmLabel="Discard"
        onConfirm={() => {
          setConfirmCancel(false);
          onCancel?.();
        }}
        onCancel={() => setConfirmCancel(false)}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={removal?.title ?? ""}
        description={removal?.description ?? ""}
        confirmLabel={removal?.confirmLabel ?? "Delete"}
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
