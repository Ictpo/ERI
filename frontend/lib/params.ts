import type { Analysis, CorpusSummary } from "./types";

// Display helpers for the parameters stored with every analysis. Defaults
// mirror the engine's (TextParams.from_dict and each runner), which applies
// them when a key is missing.

const LANG_LABELS: Record<string, string> = {
  en: "English",
  pt: "Portuguese",
  fr: "French",
  es: "Spanish",
};

type Stored = Record<string, unknown>;

function num(p: Stored, key: string, fallback: number): number {
  const v = p[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** The language an analysis ran with (the engine falls back to English). */
export function langLabel(analysis: Analysis): string {
  const lang = (analysis.params as Stored).lang;
  return (typeof lang === "string" && LANG_LABELS[lang]) || "English";
}

/** Every setting an analysis ran with, on one line (result header). */
export function describeParams(analysis: Analysis): string {
  const p = analysis.params as Stored;
  const parts = [
    langLabel(analysis),
    p.lemmatize === false ? "not lemmatized" : "lemmatized",
    p.remove_stopwords === false ? "stopwords kept" : "stopwords removed",
  ];
  const custom = Array.isArray(p.custom_stopwords) ? p.custom_stopwords : [];
  if (custom.length) parts.push(`custom stopwords: ${custom.join(", ")}`);
  parts.push(`min frequency ${num(p, "min_freq", 3)}`);
  if (analysis.type === "stats") {
    parts.push(`${num(p, "max_cloud_words", 150)} cloud words`);
  } else if (analysis.type === "chd") {
    parts.push(`${num(p, "seg_size", 40)}-word segments`);
    parts.push(`up to ${num(p, "max_classes", 6)} classes`);
  } else if (analysis.type === "similarity") {
    parts.push(`${num(p, "max_terms", 60)} terms`);
  } else if (analysis.type === "afc") {
    parts.push(`variable “${String(p.variable ?? "")}”`);
    parts.push(`up to ${num(p, "max_words", 120)} words`);
  }
  return parts.join(" · ");
}

/** True when the analysis ran before the project's current corpus was saved.
    Both are UTC isoformat strings from the backend, so they compare as text. */
export function ranOnEarlierCorpus(
  analysis: Analysis,
  corpus: CorpusSummary | null
): boolean {
  return Boolean(corpus?.saved_at && analysis.created_at < corpus.saved_at);
}
