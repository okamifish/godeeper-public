import type { GoDeeperFlowNode, GoDeeperFlowEdge, CanvasNodeSeed, CanvasEdgeSeed, SocraticDimension } from './types';
import type { QualityEvaluation } from './question-quality';
import { getToken, refreshAccessToken } from './auth';

export interface CanvasData {
  id: string;
  name: string;
  nodes: GoDeeperFlowNode[];
  edges: GoDeeperFlowEdge[];
  createdAt: string;
  updatedAt: string;
}

export type TaskGuideRole = "foundation" | "compare" | "mechanism" | "judgement";

export interface TaskGuideItem {
  id: string;
  title: string;
  body: string;
  why?: string;
  role?: TaskGuideRole;
  recommended?: boolean;
  dependsOn?: string[];
  source?: "ai" | "user";
}

export interface TaskResult {
  taskId: string;
  /** 由 AI 从用户问题提炼出来的任务标题；旧版接口可能没有 */
  title?: string;
  /** answer = 普通结果；plan = 引导目录 */
  mode?: "answer" | "plan";
  results: Array<{
    title: string;
    body: string;
  }>;
  /** 引导模式短答 */
  summary?: string;
  /** 引导模式方向 */
  items?: TaskGuideItem[];
  /** 引导子任务的一句话回填 */
  backfill?: string;
}

export interface DecomposeResult {
  sourceNode: {
    title: string;
    body: string;
    sourceMeta: string;
  };
  fragmentNodes: Array<{
    title: string;
    body: string;
  }>;
  taskNode: {
    title: string;
    body: string;
    chips: string[];
  };
  resultNodes: Array<{
    title: string;
    body: string;
  }>;
}

export interface OcrPagePayload {
  pageIndex: number;
  markdown: string;
  blocks: Array<{
    idx: number;
    type: string;
    bbox: [number, number, number, number];
    content: string;
    format?: string;
  }>;
  width: number;
  height: number;
}

export interface NodeSearchHit {
  id: string;
  canvasId: string;
  canvasTitle: string;
  kind: string;
  title: string;
  body: string;
  updatedAt: string;
  /** 免费用户：其他画布结果只给标题预览，点击需要升级 Pro */
  locked?: boolean;
}

export interface NodeSearchResponse {
  locked: boolean;
  results: NodeSearchHit[];
}

export interface BacklinkHit {
  canvasId: string;
  canvasTitle: string;
  nodeId: string;
  title: string;
  snippet: string;
  updatedAt: string;
}

export interface BacklinksResponse {
  locked: boolean;
  hasCrossCanvas: boolean;
  total: number;
  backlinks: BacklinkHit[];
}

export interface RiskConfigValues {
  burstPerMinute: number;
  failureRateThreshold: number;
  failureMinSamples: number;
  dailyWatchLimitFree: number;
}

export interface RiskConfigResponse {
  config: RiskConfigValues;
  updatedAt: string | null;
}

import type {
  OrganizedReport,
  ReportBrightSpot,
  ReportGraphCatalog,
  ReportGraphCatalogItem,
  ReportGraphConcept,
  ReportGraphEdge,
  ReportGraphGroup,
  ReportGraphInput,
  ReportGraphKeyPoint,
  ReportGraphNode,
  ReportGraphSocraticRound,
  ReportGraphSocraticSession,
  ReportMainThread,
  ReportMilestone,
  ReportOpenQuestion,
  ReportRelation,
  ReportStage,
} from './report-graph';

export type {
  OrganizedReport,
  ReportBrightSpot,
  ReportGraphCatalog,
  ReportGraphCatalogItem,
  ReportGraphConcept,
  ReportGraphEdge,
  ReportGraphGroup,
  ReportGraphInput,
  ReportGraphKeyPoint,
  ReportGraphNode,
  ReportGraphSocraticRound,
  ReportGraphSocraticSession,
  ReportMainThread,
  ReportMilestone,
  ReportOpenQuestion,
  ReportRelation,
  ReportStage,
};

export interface OrganizeReportUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export type OrganizeReportResponse = OrganizedReport & {
  usage?: OrganizeReportUsage;
};

export type CritiqueFindingKind = "counterexample" | "flaw" | "missing_evidence";

export interface CritiqueFinding {
  kind: CritiqueFindingKind;
  title: string;
  body: string;
}

export interface CritiqueResponse {
  findings: CritiqueFinding[];
}

export interface CritiqueRequest {
  claim: { title: string; body?: string; taskType?: string };
  evidence: Array<{ title: string; text: string }>;
  locale?: "zh" | "en";
}

export interface ConceptExplanationRequest {
  term: string;
  context: string[];
  locale?: "zh" | "en";
}

export interface ConceptExplanationResponse {
  explanation: string;
  points: string[];
}

export interface SocraticRoundPayload {
  question: string;
  answer: string;
}

export interface SocraticRequest {
  action: "start" | "answer" | "resume" | "finish";
  source: string;
  context?: string[];
  history?: SocraticRoundPayload[];
  answer?: string;
  locale?: "zh" | "en";
  model?: string;
}

export interface SocraticTurnResponse {
  question: string;
  dimension: SocraticDimension;
  card: { title: string; body: string } | null;
  done: boolean;
}

export interface SocraticSummaryResponse {
  title: string;
  summary: string;
  blindSpots: string[];
}

export type SocraticResponse = SocraticTurnResponse | SocraticSummaryResponse;

/** 用户侧只读的方案/额度快照；null 表示不限额 */
export interface MyPlanSnapshot {
  membership: "free" | "pro" | "team" | string;
  capabilities: string[];
  limits: {
    canvases: number | null;
    nodesPerCanvas: number | null;
    aiTasksPerDay: number | null;
  };
  usage: {
    canvases: number;
    aiTasksToday: number;
  };
  credits: {
    taskRun: number;
    inspire: number;
    summary: number;
  };
  byok: {
    configured: boolean;
    dailyAiUnlimited: boolean;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export interface APIErrorIssue {
  rule?: string;
  message?: string;
  ids?: string[];
}

export class APIError extends Error {
  status: number;
  code?: string;
  issues?: APIErrorIssue[];

  constructor(message: string, init: { status: number; code?: string; issues?: unknown }) {
    super(message);
    this.name = "APIError";
    this.status = init.status;
    this.code = init.code;
    this.issues = Array.isArray(init.issues) ? init.issues as APIErrorIssue[] : undefined;
  }
}

class APIService {
  public async request<T>(path: string, options?: RequestInit): Promise<T> {
    const doFetch = (token: string | null) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...headers, ...(options?.headers as Record<string, string>) },
      });
    };

    let response = await doFetch(getToken());

    // 令牌过期/已被清理时，先用 refresh token 换新再重试一次。
    // 登录/注册自身的 401 是凭证错误，不触发刷新。
    if (response.status === 401 && !path.startsWith('/auth/')) {
      const fresh = await refreshAccessToken();
      if (fresh) response = await doFetch(fresh);
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ message: 'Request failed' })) as {
        error?: string;
        message?: string;
        code?: string;
        issues?: unknown;
      };
      throw new APIError(payload.error || payload.message || `HTTP ${response.status}`, {
        status: response.status,
        code: payload.code,
        issues: payload.issues,
      });
    }

    return response.json();
  }

  // OCR (note card)
  async parseNoteImage(blob: Blob, filename = "note-image.jpg"): Promise<OcrPagePayload> {
    const token = getToken();
    const form = new FormData();
    form.append("file", blob, filename);
    const response = await fetch(`${API_BASE}/ocr/parse`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}`, code: "OCR_FAILED" }));
      const error = new Error(payload?.error || payload?.code || `HTTP ${response.status}`) as Error & { code?: string };
      error.code = payload?.code;
      throw error;
    }
    const payload = await response.json() as { page: OcrPagePayload };
    return payload.page;
  }

  // Canvas
  async listCanvases() {
    return this.request<any[]>('/canvas');
  }

  async listDeletedCanvases() {
    return this.request<any[]>('/canvas/trash');
  }

  async restoreCanvas(id: string) {
    return this.request(`/canvas/${id}/restore`, { method: 'POST' });
  }

  async createCanvas(title?: string) {
    return this.request<any>('/canvas', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  async getCanvas(id: string) {
    return this.request<any>(`/canvas/${id}`);
  }

  async getPublicCanvas(id: string) {
    return this.request<{
      canvasId: string;
      title: string;
      snapshot: { nodes?: CanvasNodeSeed[]; edges?: CanvasEdgeSeed[] } | null;
      updatedAt: string;
      commentsEnabled: boolean;
    }>(`/public/canvas/${id}`);
  }

  async createPublicComment(canvasId: string, content: string) {
    return this.request<{ ok: boolean; commentId: string }>(`/public/canvas/${canvasId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async updateCanvas(id: string, data: { title?: string; isPublic?: boolean; allowPublicComments?: boolean }) {
    return this.request(`/canvas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async saveSnapshot(id: string, snapshot: unknown) {
    return this.request<{ ok: boolean }>(`/canvas/${id}/snapshot`, {
      method: 'PUT',
      body: JSON.stringify(snapshot),
    });
  }

  async deleteCanvas(id: string) {
    return this.request(`/canvas/${id}`, { method: 'DELETE' });
  }

  // Auth / API key
  async updateApiKey(data: { apiKey: string; provider?: 'openrouter' | 'openai' | 'anthropic' | 'siliconflow' | 'custom'; baseUrl?: string; modelName?: string }) {
    return this.request<{ ok: boolean }>('/auth/api-key', {
      method: 'PUT',
      body: JSON.stringify({
        apiKey: data.apiKey,
        provider: data.provider ?? 'custom',
        baseUrl: data.baseUrl,
        modelName: data.modelName,
      }),
    });
  }

  // Node
  async syncNodes(canvasId: string, upserts: any[], deletes: string[], replace = false) {
    const body = replace
      ? { canvasId, upserts, deletes, replace }
      : { canvasId, upserts, deletes };
    return this.request<{ ok: boolean }>('/node/sync', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async searchNodes(q: string) {
    return this.request<NodeSearchResponse>(`/node/search?q=${encodeURIComponent(q)}`);
  }

  async getNodeBacklinks(canvasId: string, nodeId: string) {
    return this.request<BacklinksResponse>(
      `/node/backlinks?canvasId=${encodeURIComponent(canvasId)}&nodeId=${encodeURIComponent(nodeId)}`,
    );
  }

  // Task
  async runTask(
    taskId: string,
    prompt: string,
    context: string[],
    model?: string,
    taskType?: string,
    guide?: { mode?: boolean; child?: boolean },
    signal?: AbortSignal,
  ) {
    return this.request<TaskResult>(`/task/${taskId}/run`, {
      method: 'POST',
      ...(signal ? { signal } : {}),
      body: JSON.stringify({
        prompt,
        context,
        ...(model ? { model } : {}),
        ...(taskType ? { taskType } : {}),
        ...(guide?.mode ? { guideMode: true } : {}),
        ...(guide?.child ? { guideChild: true } : {}),
      }),
    });
  }

  async evaluateQuestionQuality(question: string, context: string, locale: 'zh' | 'en') {
    return this.request<QualityEvaluation>('/quality/evaluate', {
      method: 'POST',
      body: JSON.stringify({ question, context, locale }),
    });
  }

  async streamTask(
    taskId: string,
    prompt: string,
    context: string[],
    model: string,
    onChunk: (chunk: string) => void,
  ) {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}/task/${taskId}/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, context, ...(model ? { model } : {}) }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  }

  // Import
  async importUrl(url: string, fragmentCount?: number) {
    return this.request<any>('/import/url', {
      method: 'POST',
      body: JSON.stringify({ url, fragmentCount }),
    });
  }

  async importText(text: string, fragmentCount?: number) {
    return this.request<any>('/import/text', {
      method: 'POST',
      body: JSON.stringify({ text, fragmentCount }),
    });
  }

  async importFile(file: File, fragmentCount?: number) {
    const token = getToken();
    const formData = new FormData();
    formData.set('file', file);
    if (fragmentCount) formData.set('fragmentCount', String(fragmentCount));

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}/import/file`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Share
  async createShare(canvasId: string, expiresInHours?: number, allowComment = false) {
    return this.request(`/share/${canvasId}`, {
      method: 'POST',
      body: JSON.stringify({ expiresInHours, allowComment }),
    });
  }

  async listShares(canvasId: string) {
    return this.request(`/share/${canvasId}`);
  }

  async revokeShare(id: string) {
    return this.request(`/share/${id}`, { method: 'DELETE' });
  }

  async viewShare(token: string) {
    return this.request(`/share/view/${token}`);
  }

  async listShareComments(token: string, nodeId?: string) {
    const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';
    return this.request(`/share/view/${token}/comments${query}`);
  }

  async createShareComment(token: string, content: string, nodeId?: string) {
    return this.request(`/share/view/${token}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, nodeId }),
    });
  }

  async getAdminRiskConfig(): Promise<RiskConfigResponse> {
    return this.request<RiskConfigResponse>('/admin/risk-config');
  }

  async updateAdminRiskConfig(config: RiskConfigValues): Promise<RiskConfigResponse> {
    return this.request<RiskConfigResponse>('/admin/risk-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  // Comment
  async listComments(canvasId: string, nodeId?: string) {
    const query = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : '';
    return this.request(`/comment/${canvasId}${query}`);
  }

  async createComment(canvasId: string, content: string, nodeId?: string) {
    return this.request(`/comment/${canvasId}`, {
      method: 'POST',
      body: JSON.stringify({ content, nodeId }),
    });
  }

  async deleteComment(id: string) {
    return this.request(`/comment/${id}`, { method: 'DELETE' });
  }

  // Admin
  async getAdminStats() {
    return this.request<{ users: number; canvases: number; nodes: number; todayAiCalls: number; todayNewUsers: number }>('/admin/stats');
  }

  async getAdminStatsTrend(days = 30) {
    return this.request<{ date: string; new_users: number; new_canvases: number; ai_calls: number }[]>(`/admin/stats/trend?days=${days}`);
  }

  async getHealth() {
    return this.request<{
      status: string;
      version?: string;
      uptimeSeconds?: number;
      dbOk?: boolean;
      timestamp: string;
    }>('/health');
  }

  async getMe() {
    return this.request<{ id: string; email: string; displayName?: string | null }>('/auth/me');
  }

  async getMyPlan() {
    return this.request<MyPlanSnapshot>('/auth/me/plan');
  }

  async getAdminNodeDistribution() {
    return this.request<{ kind: string; count: number }[]>('/admin/stats/node-distribution');
  }

  async getAdminRecentUsers() {
    return this.request<{ id: string; email: string; displayName: string | null; membership: string; createdAt: string }[]>('/admin/stats/recent-users');
  }

  async getAdminTopCanvases() {
    return this.request<{ id: string; title: string; ownerEmail: string; nodeCount: number; updatedAt: string }[]>('/admin/stats/top-canvases');
  }

  async getAdminUsers(params?: { search?: string }) {
    const q = params?.search ? `?search=${encodeURIComponent(params.search)}` : '';
    return this.request<any[]>('/admin/users' + q);
  }

  async getAdminUser(id: string) {
    return this.request<any>(`/admin/users/${id}`);
  }

  async getAdminUserActivity(id: string, limit = 30) {
    return this.request<any[]>(`/admin/users/${id}/activity?limit=${limit}`);
  }

  async updateUserMembership(userId: string, membership: string) {
    return this.request(`/admin/users/${userId}/membership`, {
      method: 'PUT',
      body: JSON.stringify({ membership }),
    });
  }

  async deleteAdminUser(userId: string) {
    return this.request(`/admin/users/${userId}`, { method: 'DELETE' });
  }

  async getAdminCanvases(params?: { search?: string; public?: string }) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.public) qs.set('public', params.public);
    const q = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<any[]>('/admin/canvases' + q);
  }

  async getAdminCanvas(id: string) {
    return this.request<any>(`/admin/canvases/${id}`);
  }

  async updateAdminCanvas(id: string, data: { title?: string; isPublic?: boolean }) {
    return this.request(`/admin/canvases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAdminCanvas(id: string) {
    return this.request(`/admin/canvases/${id}`, { method: 'DELETE' });
  }

  async getAdminCanvasShares(canvasId: string) {
    return this.request<any[]>(`/admin/canvases/${canvasId}/shares`);
  }

  async getAdminAiUsageOverview() {
    return this.request<{ totalCalls: number; todayCalls: number; activeUsersToday: number; avgPerUser: number }>('/admin/ai-usage/overview');
  }

  async getAdminAiUsageTrend() {
    return this.request<{ date: string; calls: number }[]>('/admin/ai-usage/trend');
  }

  async getAdminAiUsageRanking(params?: { limit?: number }) {
    const q = params?.limit ? `?limit=${params.limit}` : '';
    return this.request<any[]>('/admin/ai-usage/ranking' + q);
  }

  async getAdminAiUsageQuotaHit() {
    return this.request<{ freeUsers: number; hitLimit: number; hitRate: string }>('/admin/ai-usage/quota-hit');
  }

  async getAdminAiUsageByFeature(days = 30) {
    return this.request<{ feature: string; calls: number; inputTokens: number; outputTokens: number; costUsd: string }[]>(
      `/admin/ai-usage/by-feature?days=${days}`,
    );
  }

  async getAdminAiUsageByModel(days = 30) {
    return this.request<{ model: string; calls: number; inputTokens: number; outputTokens: number; costUsd: string }[]>(
      `/admin/ai-usage/by-model?days=${days}`,
    );
  }

  async getAdminTaskRuns(params?: { status?: string; model?: string; limit?: number; offset?: number }) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.model) q.set("model", params.model);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    const qs = q.toString();
    return this.request<any[]>(`/admin/task-runs${qs ? `?${qs}` : ""}`);
  }

  // Models
  async getAdminModels() { return this.request<any[]>("/admin/models"); }
  async createAdminModel(data: any) { return this.request<any>("/admin/models", { method: "POST", body: JSON.stringify(data) }); }
  async updateAdminModel(id: string, data: any) { return this.request(`/admin/models/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
  async deleteAdminModel(id: string) { return this.request(`/admin/models/${id}`, { method: "DELETE" }); }

  // Prompts
  async getAdminPrompts(feature?: string) {
    const q = feature ? `?feature=${feature}` : "";
    return this.request<any[]>(`/admin/prompts${q}`);
  }
  async getAdminPromptsCatalog() { return this.request<any[]>("/admin/prompts/catalog"); }
  async getAdminPromptEffective(feature: string) {
    return this.request<any>(`/admin/prompts/effective?feature=${encodeURIComponent(feature)}`);
  }
  async previewAdminPrompt(data: any) {
    return this.request<any>("/admin/prompts/preview", { method: "POST", body: JSON.stringify(data) });
  }
  async testAdminPrompt(data: any) {
    return this.request<any>("/admin/prompts/test", { method: "POST", body: JSON.stringify(data) });
  }
  async suggestAdminPrompt(data: any) {
    return this.request<any>("/admin/prompts/suggest", { method: "POST", body: JSON.stringify(data) });
  }
  async createAdminPrompt(data: any) { return this.request<any>("/admin/prompts", { method: "POST", body: JSON.stringify(data) }); }
  async updateAdminPrompt(id: string, data: any) { return this.request(`/admin/prompts/${id}`, { method: "PUT", body: JSON.stringify(data) }); }
  async deleteAdminPrompt(id: string) { return this.request(`/admin/prompts/${id}`, { method: "DELETE" }); }

  // AI endpoints (prompts managed by backend)
  async aiAnalyzeUrl(url: string, model?: string) {
    return this.request<any>("/ai/analyze-url", { method: "POST", body: JSON.stringify({ url, ...(model ? { model } : {}) }) });
  }
  async aiExpand(pointText: string, summary: string, model?: string) {
    return this.request<{ text: string }>("/ai/expand", { method: "POST", body: JSON.stringify({ pointText, summary, ...(model ? { model } : {}) }) });
  }
  async aiInspire(context: string, model?: string) {
    return this.request<any>("/ai/inspire", { method: "POST", body: JSON.stringify({ context, ...(model ? { model } : {}) }) });
  }
  async aiSocratic(input: SocraticRequest, model?: string) {
    return this.request<SocraticResponse>("/ai/socratic", {
      method: "POST",
      body: JSON.stringify({ ...input, ...(model ? { model } : {}) }),
    });
  }
  async aiOrganizeReport(
    input: ReportGraphInput,
    model?: string,
  ) {
    return this.request<OrganizeReportResponse>("/ai/organize-report", {
      method: "POST",
      body: JSON.stringify({ ...input, ...(model ? { model } : {}) }),
    });
  }
  async aiCritique(input: CritiqueRequest, model?: string) {
    return this.request<CritiqueResponse>("/ai/critique", {
      method: "POST",
      body: JSON.stringify({ ...input, ...(model ? { model } : {}) }),
    });
  }
  async aiExplainConcept(input: ConceptExplanationRequest, model?: string) {
    return this.request<ConceptExplanationResponse>("/ai/explain-concept", {
      method: "POST",
      body: JSON.stringify({ ...input, ...(model ? { model } : {}) }),
    });
  }

  // Dashboard enhanced
  async getAdminStatsEnhanced() { return this.request<any>("/admin/stats/enhanced"); }

  // Plans
  async getAdminPlans() { return this.request<any[]>("/admin/plans"); }
  async createAdminPlan(data: any) { return this.request<any>("/admin/plans", { method: "POST", body: JSON.stringify(data) }); }
  async updateAdminPlan(id: string, data: any) { return this.request(`/admin/plans/${id}`, { method: "PUT", body: JSON.stringify(data) }); }

  // Credits
  async adjustCredits(userId: string, feature: string, amount: number, reason?: string) {
    return this.request(`/admin/users/${userId}/adjust-credits`, { method: "POST", body: JSON.stringify({ feature, amount, reason }) });
  }
  async getUserCredits(userId: string) { return this.request<any>(`/admin/users/${userId}/credits`); }

  // Risk
  async getRiskEvents(status?: string) {
    const q = status ? `?status=${status}` : "";
    return this.request<any[]>(`/admin/risk/events${q}`);
  }
  async resolveRiskEvent(id: string) {
    return this.request(`/admin/risk/events/${id}`, { method: "PUT", body: JSON.stringify({ status: "resolved" }) });
  }
  async getRiskAlerts() { return this.request<any>("/admin/risk/alerts"); }
}

export const api = new APIService();
