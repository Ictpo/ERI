// Types mirroring CONTRACT.md exactly.

export type Project = {
  id: string;
  name: string;
  description: string;
  created_at: string;
};

export type CorpusSummary = {
  n_documents: number;
  n_tokens: number;
  n_forms: number;
  variables: { name: string; modalities: string[] }[];
};

export type ProjectDetail = Project & { corpus_summary: CorpusSummary | null };

export type DocumentIn = {
  id?: string;
  text: string;
  variables: Record<string, string>;
};

export type CorpusPreview = {
  documents: DocumentIn[];
  detected_variables: string[];
  warnings: string[];
};

export type CorpusGet = {
  documents: DocumentIn[];
  summary: CorpusSummary;
};

export type AnalysisType = "stats" | "chd" | "similarity" | "afc";

export type AnalysisStatus = "queued" | "running" | "done" | "error";

export type ApiErrorBody = {
  code: string;
  message: string;
  hint: string | null;
};

export type Analysis = {
  id: string;
  project_id: string;
  type: AnalysisType;
  params: object;
  status: AnalysisStatus;
  error: ApiErrorBody | null;
  created_at: string;
  finished_at: string | null;
  result: StatsResult | ChdResult | SimilarityResult | AfcResult | null;
};

export type AnalysisEvent = {
  status: AnalysisStatus;
  progress: number; // 0..1
  stage: string;
  message: string;
};

export type TextParams = {
  lang: "en" | "pt" | "fr" | "es";
  lemmatize: boolean;
  remove_stopwords: boolean;
  custom_stopwords: string[];
  min_freq: number;
};

export type StatsParams = TextParams & { max_cloud_words?: number };
export type ChdParams = TextParams & { seg_size?: number; max_classes?: number };
export type SimilarityParams = TextParams & { max_terms?: number };
export type AfcParams = TextParams & { variable: string; max_words?: number };

export type StatsResult = {
  total_tokens: number;
  unique_forms: number;
  hapax_count: number;
  freq: { form: string; freq: number; docs: number }[];
  hapax: string[];
  cloud: { form: string; freq: number }[];
  by_variable: {
    variable: string;
    modality: string;
    tokens: number;
    forms: number;
  }[];
};

export type ChdNode = {
  id: number;
  size: number;
  class_id: number | null;
  children: [ChdNode, ChdNode] | null;
};

export type ChdClass = {
  id: number;
  label: string;
  size: number;
  pct: number;
  words: {
    form: string;
    chi2: number;
    p: number;
    freq_in: number;
    freq_total: number;
  }[];
  variables: { variable: string; modality: string; chi2: number; p: number }[];
  segments: { text: string; doc_index: number; score: number }[];
};

export type ChdResult = {
  n_segments: number;
  n_classified: number;
  pct_classified: number;
  tree: ChdNode;
  classes: ChdClass[];
};

export type SimilarityNode = { id: string; freq: number; community: number };
export type SimilarityEdge = {
  source: string;
  target: string;
  cooc: number;
  jaccard: number;
  cosine: number;
};

export type SimilarityResult = {
  nodes: SimilarityNode[];
  edges: SimilarityEdge[];
  n_segments: number;
};

export type AfcPoint = {
  label: string;
  x: number;
  y: number;
  z: number | null;
  mass: number;
  contrib_x: number;
  contrib_y: number;
  freq: number;
};

export type AfcResult = {
  explained: number[];
  rows: AfcPoint[];
  cols: AfcPoint[];
};

export type Health = { ok: true; version: string };
