"use client";

import * as React from "react";
import { ChevronDown, Info, Play, RefreshCw } from "lucide-react";
import type { Analysis, AnalysisType, CorpusSummary, TextParams } from "@/lib/types";
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

type StoredParams = Record<string, unknown> | undefined;

function numFrom(p: StoredParams, key: string, fallback: number): number {
  const v = p?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** A card's text settings as stored with a past run, else the defaults. */
function sharedFrom(p: StoredParams): SharedState {
  const d = DEFAULT_SHARED;
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === "boolean" ? v : fallback;
  const stop = p?.custom_stopwords;
  return {
    lang: LANGS.find((l) => l.value === p?.lang)?.value ?? d.lang,
    lemmatize: bool(p?.lemmatize, d.lemmatize),
    remove_stopwords: bool(p?.remove_stopwords, d.remove_stopwords),
    custom_stopwords: Array.isArray(stop) ? stop.join(", ") : d.custom_stopwords,
    min_freq: numFrom(p, "min_freq", d.min_freq),
  };
}

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

/**
 * Whole-number input that lets the user finish typing. Clamping on every
 * keystroke rewrote partial entries (typing "30" over "40" gave 100), so the
 * draft is committed only while it is a whole number inside [min, max], and
 * is clamped (or restored, if left empty) when the field loses focus.
 */
function NumberField({
  id,
  min,
  max,
  value,
  onCommit,
  describedBy,
}: {
  id: string;
  min: number;
  max?: number;
  value: number;
  onCommit: (value: number) => void;
  /** id of a hint paragraph, read out after the field's label. */
  describedBy?: string;
}) {
  const [draft, setDraft] = React.useState(String(value));
  const hi = max ?? Number.MAX_SAFE_INTEGER;
  // Follow outside changes to `value` (e.g. settings seeded from a stored run)
  // without disturbing an in-progress entry, which never changes `value`.
  React.useEffect(() => {
    setDraft((d) => (Number(d) === value ? d : String(value)));
  }, [value]);
  return (
    <Input
      id={id}
      aria-describedby={describedBy}
      type="number"
      min={min}
      max={max}
      step={1}
      value={draft}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = Number(raw);
        if (raw !== "" && Number.isInteger(n) && n >= min && n <= hi) onCommit(n);
      }}
      onBlur={() => {
        const n = Math.round(Number(draft));
        const next =
          draft.trim() === "" || !Number.isFinite(n)
            ? value
            : Math.min(hi, Math.max(min, n));
        setDraft(String(next));
        onCommit(next);
      }}
    />
  );
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
          <Label id={`${idPrefix}-lang-label`}>Language</Label>
          <Select
            value={state.lang}
            onValueChange={(lang) =>
              onChange({ ...state, lang: lang as SharedState["lang"] })
            }
          >
            <SelectTrigger aria-labelledby={`${idPrefix}-lang-label`}>
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
          <NumberField
            id={`${idPrefix}-min-freq`}
            min={1}
            value={state.min_freq}
            onCommit={(min_freq) => onChange({ ...state, min_freq })}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Switch
            checked={state.lemmatize}
            onCheckedChange={(lemmatize) => onChange({ ...state, lemmatize })}
            aria-describedby={`${idPrefix}-lemmatize-hint`}
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
      <p id={`${idPrefix}-lemmatize-hint`} className="-mt-2 text-xs text-slate-500">
        Lemmatize counts the forms of a word as one word (for example, ran and
        running both count as run).
      </p>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-stopwords`}>
          Custom stopwords{" "}
          <span className="font-normal text-slate-500">
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
  history,
  onRun,
  onReplaceCorpus,
}: {
  corpusSummary: CorpusSummary;
  /** The project's analyses, newest first: each card starts from its last run. */
  history: Analysis[];
  onRun: (type: AnalysisType, params: object) => Promise<void>;
  onReplaceCorpus: () => void;
}) {
  const [expanded, setExpanded] = React.useState<AnalysisType | null>(null);
  const [launching, setLaunching] = React.useState(false);

  // Seed each card from the params stored with its own last run, else from
  // the newest run of any type (text settings only), so the settings, above
  // all the language, survive leaving the launcher and relaunching the app.
  const seed = (type: AnalysisType) =>
    (history.find((a) => a.type === type) ?? history[0])?.params as StoredParams;

  // Per-type shared params, stored once the user edits a card (kept separate
  // so each card remembers its config). Until then a card follows its seed,
  // read on every render, so a run made in this session (say, in Portuguese)
  // carries its text settings to the cards that have no run of their own.
  const [edited, setEdited] = React.useState<
    Partial<Record<AnalysisType, SharedState>>
  >({});
  const sharedFor = (type: AnalysisType) =>
    edited[type] ?? sharedFrom(seed(type));
  // Type-specific params
  const [maxCloudWords, setMaxCloudWords] = React.useState(() =>
    numFrom(seed("stats"), "max_cloud_words", 150)
  );
  const [segSize, setSegSize] = React.useState(() =>
    numFrom(seed("chd"), "seg_size", 40)
  );
  const [maxClasses, setMaxClasses] = React.useState(() =>
    numFrom(seed("chd"), "max_classes", 6)
  );
  const [maxTerms, setMaxTerms] = React.useState(() =>
    numFrom(seed("similarity"), "max_terms", 60)
  );
  const [afcVariable, setAfcVariable] = React.useState<string>(
    corpusSummary.variables[0]?.name ?? ""
  );
  const [afcMaxWords, setAfcMaxWords] = React.useState(() =>
    numFrom(seed("afc"), "max_words", 120)
  );

  const hasVariables = corpusSummary.variables.length > 0;

  async function launch(type: AnalysisType) {
    setLaunching(true);
    try {
      const base = buildTextParams(sharedFor(type));
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
          <h2 className="font-display text-lg font-semibold tracking-tight">Run an analysis</h2>
          <p className="text-sm text-slate-600">
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
                    state={sharedFor(type)}
                    onChange={(next) =>
                      setEdited((prev) => ({ ...prev, [type]: next }))
                    }
                  />

                  {type === "stats" && (
                    <div className="grid gap-2 sm:max-w-[240px]">
                      <Label htmlFor="stats-cloud-words">Max cloud words</Label>
                      <NumberField
                        id="stats-cloud-words"
                        min={10}
                        max={300}
                        value={maxCloudWords}
                        onCommit={setMaxCloudWords}
                      />
                    </div>
                  )}

                  {type === "chd" && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="chd-seg-size">
                          Segment size (words)
                        </Label>
                        <NumberField
                          id="chd-seg-size"
                          min={10}
                          max={200}
                          value={segSize}
                          onCommit={setSegSize}
                          describedBy="chd-seg-size-hint"
                        />
                        <p id="chd-seg-size-hint" className="text-xs text-slate-500">
                          Texts are cut into segments of about this many
                          words. Classes group segments, not whole documents.
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="chd-max-classes">Max classes</Label>
                        <NumberField
                          id="chd-max-classes"
                          min={2}
                          max={12}
                          value={maxClasses}
                          onCommit={setMaxClasses}
                          describedBy="chd-max-classes-hint"
                        />
                        <p id="chd-max-classes-hint" className="text-xs text-slate-500">
                          The most classes to find. ERI stops sooner when no
                          class can be split further.
                        </p>
                      </div>
                    </div>
                  )}

                  {type === "similarity" && (
                    <div className="grid gap-2 sm:max-w-[240px]">
                      <Label htmlFor="sim-max-terms">Max terms</Label>
                      <NumberField
                        id="sim-max-terms"
                        min={10}
                        max={200}
                        value={maxTerms}
                        onCommit={setMaxTerms}
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
                          <Label id="afc-variable-label">Variable to cross</Label>
                          <Select
                            value={afcVariable}
                            onValueChange={setAfcVariable}
                          >
                            <SelectTrigger aria-labelledby="afc-variable-label">
                              <SelectValue placeholder="Select a variable" />
                            </SelectTrigger>
                            <SelectContent>
                              {corpusSummary.variables.map((v) => (
                                <SelectItem key={v.name} value={v.name}>
                                  {v.name} — {v.modalities.length} values
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="afc-max-words">Max words</Label>
                          <NumberField
                            id="afc-max-words"
                            min={10}
                            max={400}
                            value={afcMaxWords}
                            onCommit={setAfcMaxWords}
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
