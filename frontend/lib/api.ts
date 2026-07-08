import type {
  Analysis,
  AnalysisType,
  ApiErrorBody,
  CorpusGet,
  CorpusPreview,
  CorpusSummary,
  DocumentIn,
  Health,
  Project,
  ProjectDetail,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Error thrown for every failed API call; carries the contract error envelope. */
export class ApiError extends Error {
  code: string;
  hint: string | null;
  status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.hint = body.hint;
  }
}

/** Normalize any thrown value into { message, hint } for toasts. */
export function toErrorInfo(err: unknown): { message: string; hint: string | null } {
  if (err instanceof ApiError) return { message: err.message, hint: err.hint };
  if (err instanceof TypeError)
    return {
      message: "Could not reach the analysis server.",
      hint: `Check that the backend is running at ${API_BASE}.`,
    };
  if (err instanceof Error) return { message: err.message, hint: null };
  return { message: "Unexpected error.", hint: null };
}

async function parseError(res: Response): Promise<never> {
  let body: ApiErrorBody = {
    code: "unknown",
    message: `Request failed (${res.status})`,
    hint: null,
  };
  try {
    const json = await res.json();
    if (json && typeof json === "object" && json.error) {
      body = {
        code: String(json.error.code ?? "unknown"),
        message: String(json.error.message ?? `Request failed (${res.status})`),
        hint: json.error.hint != null ? String(json.error.hint) : null,
      };
    }
  } catch {
    // non-JSON error body; keep fallback
  }
  throw new ApiError(res.status, body);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) return parseError(res);
  return (await res.json()) as T;
}

export const api = {
  // Health
  health: () => request<Health>("/health"),

  // Projects
  listProjects: () => request<Project[]>("/projects"),
  createProject: (data: { name: string; description?: string }) =>
    request<Project>("/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getProject: (id: string) => request<ProjectDetail>(`/projects/${id}`),
  deleteProject: (id: string) =>
    request<{ ok: true }>(`/projects/${id}`, { method: "DELETE" }),

  // Corpus
  previewCorpus: (
    projectId: string,
    file: File,
    kind: "txt" | "csv",
    opts?: { text_column?: string; encoding?: string }
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    if (opts?.text_column) form.append("text_column", opts.text_column);
    if (opts?.encoding) form.append("encoding", opts.encoding);
    return request<CorpusPreview>(`/projects/${projectId}/corpus/preview`, {
      method: "POST",
      body: form,
    });
  },
  saveCorpus: (projectId: string, documents: DocumentIn[]) =>
    request<CorpusSummary>(`/projects/${projectId}/corpus`, {
      method: "PUT",
      body: JSON.stringify({ documents }),
    }),
  getCorpus: (projectId: string) =>
    request<CorpusGet>(`/projects/${projectId}/corpus`),

  // Analyses
  createAnalysis: (projectId: string, type: AnalysisType, params: object) =>
    request<{ analysis: Analysis }>(`/projects/${projectId}/analyses`, {
      method: "POST",
      body: JSON.stringify({ type, params }),
    }),
  listAnalyses: (projectId: string) =>
    request<Analysis[]>(`/projects/${projectId}/analyses`),
  getAnalysis: (analysisId: string) =>
    request<Analysis>(`/analyses/${analysisId}`),
  deleteAnalysis: (analysisId: string) =>
    request<{ ok: true }>(`/analyses/${analysisId}`, { method: "DELETE" }),

  /** URL for the SSE progress stream of an analysis. */
  analysisEventsUrl: (analysisId: string) =>
    `${API_BASE}/api/analyses/${analysisId}/events`,
};
