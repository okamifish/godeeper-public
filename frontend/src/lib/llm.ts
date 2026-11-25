import {
  api,
  type ConceptExplanationRequest,
  type ConceptExplanationResponse,
  type CritiqueRequest,
  type CritiqueResponse,
  type SocraticRequest,
  type SocraticTurnResponse,
  type SocraticSummaryResponse,
  type TaskGuideItem,
} from "./api";

export interface LLMResult {
  title: string;
  body: string;
}

export interface LLMTaskResponse {
  results: LLMResult[];
  title?: string;
  mode?: "answer" | "plan";
  summary?: string;
  items?: TaskGuideItem[];
  backfill?: string;
}

export interface InspireResult {
  question: string;
  reason: string;
  prerequisites: string[];
}

export interface UrlAnalysis {
  title: string;
  summary: string;
  keyPoints: { text: string; body: string }[];
}

// Connection test still calls LLM directly (no product prompt)
function resolveEndpoint(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  if (url.endsWith("/chat/completions")) return url;
  if (url.endsWith("/v1")) return `${url}/chat/completions`;
  return `${url}/v1/chat/completions`;
}

export async function testConnection(
  baseUrl: string,
  apiKey: string,
  modelName: string,
): Promise<void> {
  const url = resolveEndpoint(baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: modelName, messages: [{ role: "user", content: "Hi" }], max_tokens: 5 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    throw new Error(err.error?.message ?? `HTTP ${res.status}`);
  }
}

// All product LLM calls go through backend — prompts managed centrally

export async function runLLMTask(
  _baseUrl: string,
  _apiKey: string,
  _modelName: string,
  prompt: string,
  context: string[],
  _signal?: AbortSignal,
  _language?: "zh" | "en",
  taskType?: string,
  guide?: { mode?: boolean; child?: boolean },
): Promise<LLMTaskResponse> {
  const res = await api.runTask("inline", prompt, context, _modelName, taskType, guide);
  return {
    results: res.results ?? [],
    title: res.title,
    mode: res.mode,
    summary: res.summary,
    items: res.items,
    backfill: res.backfill,
  };
}

export async function analyzeUrl(
  _baseUrl: string,
  _apiKey: string,
  model: string | undefined,
  url: string,
  _signal?: AbortSignal,
  _language?: "zh" | "en",
  _jinaApiKey?: string,
): Promise<UrlAnalysis> {
  return api.aiAnalyzeUrl(url, model);
}

export async function expandPoint(
  _baseUrl: string,
  _apiKey: string,
  model: string | undefined,
  pointText: string,
  summary: string,
  _signal?: AbortSignal,
  _language?: "zh" | "en",
): Promise<string> {
  const result = await api.aiExpand(pointText, summary, model);
  return result.text;
}

export async function generateInspiration(
  _baseUrl: string,
  _apiKey: string,
  model: string | undefined,
  context: string,
  _signal?: AbortSignal,
  _language?: "zh" | "en",
): Promise<InspireResult> {
  return api.aiInspire(context, model);
}

export async function generateCritique(
  _model: string | undefined,
  input: CritiqueRequest,
): Promise<CritiqueResponse> {
  return api.aiCritique(input, _model);
}

export async function generateConceptExplanation(
  _model: string | undefined,
  input: ConceptExplanationRequest,
): Promise<ConceptExplanationResponse> {
  return api.aiExplainConcept(input, _model);
}

export async function generateSocraticTurn(
  model: string | undefined,
  input: SocraticRequest,
): Promise<SocraticTurnResponse> {
  return api.aiSocratic(input, model) as Promise<SocraticTurnResponse>;
}

export async function generateSocraticSummary(
  model: string | undefined,
  input: SocraticRequest,
): Promise<SocraticSummaryResponse> {
  return api.aiSocratic(input, model) as Promise<SocraticSummaryResponse>;
}
