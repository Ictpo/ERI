"use client";

import * as React from "react";
import {
  AlertTriangle,
  FileUp,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { CorpusPreview, CorpusSummary, DocumentIn } from "@/lib/types";
import { parseCsvHeader } from "@/lib/csv";
import { cn, truncate } from "@/lib/utils";
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
import { Alert } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Step =
  | { kind: "pick" }
  | { kind: "csv-column"; file: File; columns: string[] }
  | { kind: "uploading" }
  | { kind: "edit"; preview: CorpusPreview };

export function CorpusBuilder({
  projectId,
  hasExistingCorpus,
  onSaved,
  onCancel,
}: {
  projectId: string;
  hasExistingCorpus: boolean;
  onSaved: (summary: CorpusSummary) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = React.useState<Step>({ kind: "pick" });
  const [documents, setDocuments] = React.useState<DocumentIn[]>([]);
  const [variables, setVariables] = React.useState<string[]>([]);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [expandedDoc, setExpandedDoc] = React.useState<number | null>(null);
  const [addVarOpen, setAddVarOpen] = React.useState(false);
  const [newVarName, setNewVarName] = React.useState("");
  const [csvColumn, setCsvColumn] = React.useState<string>("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const name = file.name.toLowerCase();
    const isCsv = name.endsWith(".csv");
    const isTxt = name.endsWith(".txt");
    if (!isCsv && !isTxt) {
      toastError(
        new Error("Unsupported file type."),
        "Only .txt and .csv files are accepted"
      );
      return;
    }
    if (isCsv) {
      try {
        const text = await file.text();
        const columns = parseCsvHeader(text);
        if (columns.length === 0) {
          toastError(
            new Error("Could not read any column names from the header row."),
            "CSV header not found"
          );
          return;
        }
        setCsvColumn(columns[0]);
        setStep({ kind: "csv-column", file, columns });
      } catch (err) {
        toastError(err, "Could not read the CSV file");
      }
      return;
    }
    await uploadPreview(file, "txt");
  }

  async function uploadPreview(file: File, kind: "txt" | "csv", textColumn?: string) {
    setStep({ kind: "uploading" });
    try {
      const preview = await api.previewCorpus(projectId, file, kind, {
        text_column: textColumn,
      });
      setDocuments(preview.documents);
      setVariables(preview.detected_variables);
      setWarnings(preview.warnings);
      setStep({ kind: "edit", preview });
    } catch (err) {
      toastError(err, "Could not preview the corpus");
      setStep({ kind: "pick" });
    }
  }

  function updateDocText(index: number, text: string) {
    setDocuments((prev) =>
      prev.map((d, i) => (i === index ? { ...d, text } : d))
    );
  }

  function updateDocVariable(index: number, variable: string, value: string) {
    setDocuments((prev) =>
      prev.map((d, i) =>
        i === index
          ? { ...d, variables: { ...d.variables, [variable]: value } }
          : d
      )
    );
  }

  function removeDocument(index: number) {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  }

  function addVariable() {
    const name = newVarName.trim();
    if (!name || variables.includes(name)) {
      setAddVarOpen(false);
      setNewVarName("");
      return;
    }
    setVariables((prev) => [...prev, name]);
    setDocuments((prev) =>
      prev.map((d) => ({ ...d, variables: { ...d.variables, [name]: "" } }))
    );
    setAddVarOpen(false);
    setNewVarName("");
  }

  function removeVariable(name: string) {
    setVariables((prev) => prev.filter((v) => v !== name));
    setDocuments((prev) =>
      prev.map((d) => {
        const rest = { ...d.variables };
        delete rest[name];
        return { ...d, variables: rest };
      })
    );
  }

  async function saveCorpus() {
    setSaving(true);
    try {
      // Keep only current variable columns for each document.
      const cleaned = documents.map((d) => ({
        ...d,
        variables: Object.fromEntries(
          variables.map((v) => [v, d.variables[v] ?? ""])
        ),
      }));
      const summary = await api.saveCorpus(projectId, cleaned);
      onSaved(summary);
    } catch (err) {
      toastError(err, "Could not save the corpus");
    } finally {
      setSaving(false);
    }
  }

  // ---- Step: pick file ----
  if (step.kind === "pick" || step.kind === "uploading") {
    const uploading = step.kind === "uploading";
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>
            {hasExistingCorpus ? "Replace corpus" : "Build your corpus"}
          </CardTitle>
          <CardDescription>
            Upload a <span className="font-medium">.txt</span> file (documents
            separated by <code className="rounded bg-slate-100 px-1">****</code>{" "}
            markers with <code className="rounded bg-slate-100 px-1">*var_mod</code>{" "}
            tags, or blank lines) or a{" "}
            <span className="font-medium">.csv</span> with one document per row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file && !uploading) handleFile(file);
            }}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors",
              dragOver
                ? "border-indigo-400 bg-indigo-50"
                : "border-slate-300 bg-slate-50"
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-indigo-600" />
                <p className="text-sm font-medium text-slate-700">
                  Parsing your file…
                </p>
              </>
            ) : (
              <>
                <Upload className="mb-3 h-8 w-8 text-slate-400" />
                <p className="text-sm font-medium text-slate-700">
                  Drag and drop your file here
                </p>
                <p className="mb-4 mt-1 text-xs text-slate-500">
                  .txt or .csv, UTF-8 recommended
                </p>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp /> Choose a file
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </div>
          {onCancel && !uploading && (
            <div className="mt-4 text-right">
              <Button variant="ghost" onClick={onCancel}>
                <X /> Keep current corpus
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---- Step: choose CSV text column ----
  if (step.kind === "csv-column") {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Which column contains the text?</CardTitle>
          <CardDescription>
            {step.file.name} — the other columns become corpus variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Text column</Label>
            <Select value={csvColumn} onValueChange={setCsvColumn}>
              <SelectTrigger>
                <SelectValue placeholder="Select a column" />
              </SelectTrigger>
              <SelectContent>
                {step.columns.map((col) => (
                  <SelectItem key={col} value={col}>
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStep({ kind: "pick" })}>
              Back
            </Button>
            <Button
              onClick={() => uploadPreview(step.file, "csv", csvColumn)}
              disabled={!csvColumn}
            >
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Step: edit preview ----
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Review corpus</h2>
          <p className="text-sm text-slate-500">
            {documents.length} document{documents.length === 1 ? "" : "s"},{" "}
            {variables.length} variable{variables.length === 1 ? "" : "s"}. Edit
            cells before saving.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep({ kind: "pick" })}>
            <Upload /> Different file
          </Button>
          <Button
            onClick={saveCorpus}
            disabled={saving || documents.length === 0}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Save corpus
          </Button>
        </div>
      </div>

      {warnings.map((warning, i) => (
        <Alert key={i} variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <div>{warning}</div>
        </Alert>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setAddVarOpen(true)}>
          <Plus /> Add variable
        </Button>
        {variables.map((variable) => (
          <span
            key={variable}
            className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white py-1 pl-3 pr-1.5 text-xs font-medium text-slate-700"
          >
            {variable}
            <button
              onClick={() => removeVariable(variable)}
              aria-label={`Remove variable ${variable}`}
              className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[55vh] overflow-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2 font-medium">
                  #
                </th>
                <th className="w-full border-b border-slate-200 px-3 py-2 font-medium">
                  Text
                </th>
                {variables.map((variable) => (
                  <th
                    key={variable}
                    className="border-b border-slate-200 px-3 py-2 font-medium"
                  >
                    {variable}
                  </th>
                ))}
                <th className="border-b border-slate-200 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {documents.map((doc, index) => (
                <tr key={index} className="group hover:bg-slate-50/60">
                  <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-400">
                    {index + 1}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    <button
                      className="block w-full text-left text-slate-700 hover:text-indigo-700"
                      onClick={() => setExpandedDoc(index)}
                      title="Click to view and edit the full text"
                    >
                      {truncate(doc.text, 110) || (
                        <span className="italic text-slate-400">empty</span>
                      )}
                    </button>
                  </td>
                  {variables.map((variable) => (
                    <td
                      key={variable}
                      className="border-b border-slate-100 px-2 py-1.5"
                    >
                      <Input
                        className="h-7 min-w-[90px] text-xs"
                        value={doc.variables[variable] ?? ""}
                        onChange={(e) =>
                          updateDocVariable(index, variable, e.target.value)
                        }
                      />
                    </td>
                  ))}
                  <td className="border-b border-slate-100 px-2 py-1.5">
                    <button
                      onClick={() => removeDocument(index)}
                      aria-label="Remove document"
                      className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td
                    colSpan={variables.length + 3}
                    className="px-3 py-10 text-center text-sm text-slate-400"
                  >
                    All documents removed. Upload a different file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Full-text dialog */}
      <Dialog
        open={expandedDoc !== null}
        onOpenChange={(open) => !open && setExpandedDoc(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Document {expandedDoc !== null ? expandedDoc + 1 : ""}
            </DialogTitle>
            <DialogDescription>
              Edit the full text of this document.
            </DialogDescription>
          </DialogHeader>
          {expandedDoc !== null && documents[expandedDoc] && (
            <Textarea
              rows={14}
              value={documents[expandedDoc].text}
              onChange={(e) => updateDocText(expandedDoc, e.target.value)}
            />
          )}
          <DialogFooter>
            <Button onClick={() => setExpandedDoc(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add-variable dialog */}
      <Dialog open={addVarOpen} onOpenChange={setAddVarOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add variable</DialogTitle>
            <DialogDescription>
              Adds an empty column you can fill per document.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addVariable();
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="new-var-name">Variable name</Label>
              <Input
                id="new-var-name"
                value={newVarName}
                onChange={(e) => setNewVarName(e.target.value)}
                placeholder="e.g. sex, age, region"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddVarOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!newVarName.trim()}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
