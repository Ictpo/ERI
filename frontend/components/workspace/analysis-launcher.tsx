"use client";

import * as React from "react";
import { ChevronDown, Info, Play, RefreshCw } from "lucide-react";
import type { AnalysisType, CorpusSummary, TextParams } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ANALYSIS_META } from "./sidebar";

const LANGS = [
  { value: "en", label: "English" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
] as const;

/**
 * Plain-language line first, the jargon kept as a quiet tag beside it —
 * the identity system's rule: "a plain-language line so nobody has to know
 * the jargon first". The terms aren't hidden (researchers need them), they
 * just stop being the entry price.
 */
const CARD_DESCRIPTIONS: Record<AnalysisType, string> = {
  stats:
    "Counts, form frequencies, the rarest words, and a word cloud of your corpus. A good first look.",
  chd: "Clusters your text into families of words that keep showing up together — the heart of the method.",
  similarity:
    "A web of the words that appear together, with the strongest links and clusters brought forward.",
  afc: "Crosses your words with a variable (age, role, group…) and places them on a map — closer means more alike.",
};

/** The jargon, demoted to a tag. */
const CARD_TAGS: Record<AnalysisType, string> = {
  stats: "Frequencies",
  chd: "Lexical classes",
  similarity: "Co-occurrence",
  afc: "Positioning map",
};

type SharedState = {
  lang: "en" | "pt" | "fr" | "es";
  lemmatize: boolean;
  remove_stopwords: boolean;
  custom_stopwords: string;
  min_freq: number;
};

const DEFAULT_SHARED: SharedState = {
  lang: "en",
  lemmatize: true,
  remove_stopwords: true,
  custom_stopwords: "",
  min_freq: 3,
};

function buildTextParams(s: SharedState): TextParams {
  return {
    lang: s.lang,
    lemmatize: s.lemmatize,
    remove_stopwords: s.remove_stopwords,
    custom_stopwords: s.custom_stopwords
      .split(/[\n,]/)
      .map((w) => w.trim())
      .filter(Boolean),
    min_freq: s.min_freq,
  };
}

function SharedFields({
  state,
  onChange,
  idPrefix,
}: {
  state: SharedState;
  onChange: (next: SharedState) => void;
  idPrefix: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Language</Label>
          <Select
            value={state.lang}
            onValueChange={(lang) =>
              onChange({ ...state, lang: lang as SharedState["lang"] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-min-freq`}>Minimum frequency</Label>
          <Input
            id={`${idPrefix}-min-freq`}
            type="number"
            min={1}
            value={state.min_freq}
            onChange={(e) =>
              onChange({
                ...state,
                min_freq: Math.max(1, Number(e.target.value) || 1),
              })
            }
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Switch
            checked={state.lemmatize}
            onCheckedChange={(lemmatize) => onChange({ ...state, lemmatize })}
          />
          Lemmatize
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Switch
            checked={state.remove_stopwords}
            onCheckedChange={(remove_stopwords) =>
              onChange({ ...state, remove_stopwords })
            }
          />
          Remove stopwords
        </label>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-stopwords`}>
          Custom stopwords{" "}
          <span className="font-normal text-slate-400">
            (comma or newline separated)
          </span>
        </Label>
        <Textarea
          id={`${idPrefix}-stopwords`}
          rows={2}
          placeholder="e.g. uh, um, interviewer"
          value={state.custom_stopwords}
          onChange={(e) =>
            onChange({ ...state, custom_stopwords: e.target.value })
          }
        />
      </div>
    </>
  );
}

export function AnalysisLauncher({
  corpusSummary,
  onRun,
  onReplaceCorpus,
}: {
  corpusSummary: CorpusSummary;
  onRun: (type: AnalysisType, params: object) => Promise<void>;
  onReplaceCorpus: () => void;
}) {
  const [expanded, setExpanded] = React.useState<AnalysisType | null>(null);
  const [launching, setLaunching] = React.useState(false);

  // Per-type shared params (kept separate so each card remembers its config).
  const [shared, setShared] = React.useState<Record<AnalysisType, SharedState>>({
    stats: { ...DEFAULT_SHARED },
    chd: { ...DEFAULT_SHARED },
    similarity: { ...DEFAULT_SHARED },
    afc: { ...DEFAULT_SHARED },
  });
  // Type-specific params
  const [maxCloudWords, setMaxCloudWords] = React.useState(150);
  const [segSize, setSegSize] = React.useState(40);
  const [maxClasses, setMaxClasses] = React.useState(6);
  const [maxTerms, setMaxTerms] = React.useState(60);
  const [afcVariable, setAfcVariable] = React.useState<string>(
    corpusSummary.variables[0]?.name ?? ""
  );
  const [afcMaxWords, setAfcMaxWords] = React.useState(120);

  const hasVariables = corpusSummary.variables.length > 0;

  async function launch(type: AnalysisType) {
    setLaunching(true);
    try {
      const base = buildTextParams(shared[type]);
      let params: object = base;
      if (type === "stats") params = { ...base, max_cloud_words: maxCloudWords };
      if (type === "chd")
        params = { ...base, seg_size: segSize, max_classes: maxClasses };
      if (type === "similarity") params = { ...base, max_terms: maxTerms };
      if (type === "afc")
        params = { ...base, variable: afcVariable, max_words: afcMaxWords };
      await onRun(type, params);
    } finally {
      setLaunching(false);
    }
  }

  const order: AnalysisType[] = ["stats", "chd", "similarity", "afc"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Run an analysis</h2>
          <p className="text-sm text-slate-500">
            Pick a method, tune its parameters, and launch.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReplaceCorpus}>
          <RefreshCw /> Replace corpus
        </Button>
      </div>

      {/* Corpus summary chips */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {formatNumber(corpusSummary.n_documents)} docs
        </Badge>
        <Badge variant="secondary">
          {formatNumber(corpusSummary.n_tokens)} tokens
        </Badge>
        <Badge variant="secondary">
          {formatNumber(corpusSummary.n_forms)} forms
        </Badge>
        {corpusSummary.variables.map((v) => (
          <Badge key={v.name} variant="outline">
            {v.name} ({v.modalities.length})
          </Badge>
        ))}
      </div>

      <div className="grid gap-4">
        {order.map((type) => {
          const meta = ANALYSIS_META[type];
          const Icon = meta.icon;
          const isOpen = expanded === type;
          const afcBlocked = type === "afc" && !hasVariables;
          return (
            <Card key={type} className={cn(isOpen && "ring-1 ring-indigo-200")}>
              <button
                className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                onClick={() => setExpanded(isOpen ? null : type)}
                aria-expanded={isOpen}
              >
                <CardHeader className="flex-row items-center gap-4 space-y-0">
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      isOpen
                        ? "bg-indigo-600 text-white"
                        : "bg-indigo-50 text-indigo-600"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{meta.label}</CardTitle>
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        {CARD_TAGS[type]}
                      </span>
                    </div>
                    <CardDescription className="mt-1">
                      {CARD_DESCRIPTIONS[type]}
                    </CardDescription>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </CardHeader>
              </button>
              {isOpen && (
                <div className="grid gap-4 border-t border-slate-100 p-5">
                  <SharedFields
                    idPrefix={type}
                    state={shared[type]}
                    onChange={(next) =>
                      setShared((prev) => ({ ...prev, [type]: next }))
                    }
                  />

                  {type === "stats" && (
                    <div className="grid gap-2 sm:max-w-[240px]">
                      <Label htmlFor="stats-cloud-words">Max cloud words</Label>
                      <Input
                        id="stats-cloud-words"
                        type="number"
                        min={10}
                        max={500}
                        value={maxCloudWords}
                        onChange={(e) =>
                          setMaxCloudWords(
                            Math.max(10, Number(e.target.value) || 150)
                          )
                        }
                      />
                    </div>
                  )}

                  {type === "chd" && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="chd-seg-size">
                          Segment size (words)
                        </Label>
                        <Input
                          id="chd-seg-size"
                          type="number"
                          min={10}
                          max={200}
                          value={segSize}
                          onChange={(e) =>
                            setSegSize(Math.max(10, Number(e.target.value) || 40))
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="chd-max-classes">Max classes</Label>
                        <Input
                          id="chd-max-classes"
                          type="number"
                          min={2}
                          max={20}
                          value={maxClasses}
                          onChange={(e) =>
                            setMaxClasses(
                              Math.max(2, Number(e.target.value) || 6)
                            )
                          }
                        />
                      </div>
                    </div>
                  )}

                  {type === "similarity" && (
                    <div className="grid gap-2 sm:max-w-[240px]">
                      <Label htmlFor="sim-max-terms">Max terms</Label>
                      <Input
                        id="sim-max-terms"
                        type="number"
                        min={10}
                        max={300}
                        value={maxTerms}
                        onChange={(e) =>
                          setMaxTerms(Math.max(10, Number(e.target.value) || 60))
                        }
                      />
                    </div>
                  )}

                  {type === "afc" &&
                    (afcBlocked ? (
                      <Alert variant="info">
                        <Info className="h-4 w-4" />
                        <div>
                          Correspondence analysis needs at least one corpus
                          variable (e.g. sex, age group) to cross words against.
                          This corpus has none — rebuild the corpus with
                          variables to enable AFC.
                        </div>
                      </Alert>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>Variable to cross</Label>
                          <Select
                            value={afcVariable}
                            onValueChange={setAfcVariable}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a variable" />
                            </SelectTrigger>
                            <SelectContent>
                              {corpusSummary.variables.map((v) => (
                                <SelectItem key={v.name} value={v.name}>
                                  {v.name} — {v.modalities.length} modalities
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="afc-max-words">Max words</Label>
                          <Input
                            id="afc-max-words"
                            type="number"
                            min={10}
                            max={500}
                            value={afcMaxWords}
                            onChange={(e) =>
                              setAfcMaxWords(
                                Math.max(10, Number(e.target.value) || 120)
                              )
                            }
                          />
                        </div>
                      </div>
                    ))}

                  <div className="flex justify-end">
                    <Button
                      onClick={() => launch(type)}
                      disabled={
                        launching || afcBlocked || (type === "afc" && !afcVariable)
                      }
                    >
                      <Play /> Run analysis
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
