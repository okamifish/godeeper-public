/**
 * 公开的 Pro 插件契约（只有类型，没有实现）。
 *
 * 核心仓库只认识这些接口；Pro 实现放在私有仓库 godeeper-pro。
 * 契约刻意保持窄结构，不引用 Hono / Drizzle 的完整类型，
 * 避免私有包与核心的依赖版本互相绑定。
 */

export type ProMembership = "free" | "pro" | "team";

export interface ProUser {
  id: string;
  email: string;
  membership: ProMembership;
}

export interface ProRequest {
  param(name: string): string;
}

/** Pro 处理器需要的最小上下文；Hono 的 Context 结构上满足它。 */
export interface ProContext {
  get(key: "user"): ProUser;
  req: ProRequest;
  json(body: unknown, status?: number): Response;
}

export type ProNext = () => Promise<void>;
export type ProHandler = (c: ProContext, next: ProNext) => unknown;

/** Pro 模块自己组装的路由器；核心负责把实例挂到 app 上。 */
export interface ProRouter {
  use(path: string, ...handlers: ProHandler[]): unknown;
  get(path: string, ...handlers: ProHandler[]): unknown;
  post(path: string, ...handlers: ProHandler[]): unknown;
}

/** Pro 模块可以注册到核心 app 上的最小路由能力。 */
export interface ProRouteHost {
  route(path: string, app: ProRouter): unknown;
}

/** 核心注入的 sql 模板标签，保证与核心使用同一个 Drizzle 实例。 */
export type ProSql = (strings: TemplateStringsArray, ...values: unknown[]) => unknown;

export interface ProDatabase {
  execute(query: unknown): Promise<unknown[]>;
}

/** 核心提供给 Pro 模块的依赖；只允许公开、稳定的能力。 */
export interface ProBackendDeps {
  createRouter(): ProRouter;
  authMiddleware: ProHandler;
  requireCapability: (capability: string, c: ProContext, next: ProNext) => unknown;
  db: ProDatabase;
  sql: ProSql;
  isUuid: (value: string | undefined | null) => boolean;
  /** 核心统一的提及片段截断；Pro 反链复用，避免两套实现漂移。 */
  backlinkSnippet(body: string, max?: number): string;
  /** 核心统一的回收站过期清理；Pro 列表与恢复前复用。 */
  purgeExpiredCanvases(userId: string): Promise<void>;
  /** 核心提供的底层模型调用：Pro 自带归一化，核心只负责凭据与计费。 */
  runSystemPrompt(input: {
    userId: string;
    system: string;
    prompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onUsage?: ProUsageCallback;
  }): Promise<string>;
  /** 读取核心的生效系统提示词（含后台覆盖）；默认模板仍由公开目录维护。 */
  getPrompt(feature: string): Promise<string>;
  /** 只读取后台覆盖；没有覆盖时返回 null，由私有包使用自己的默认提示词。 */
  getPromptOverride(feature: string): Promise<string | null>;
  /** 渲染用户消息模板（含变量替换与后台覆盖）。 */
  resolvePrompt(name: string, variables?: Record<string, string | number>): Promise<string>;
}

export interface ProBackendModule {
  readonly edition: "stub" | "pro";
  register(app: ProRouteHost, deps: ProBackendDeps): void;
  /** 需要在核心同路径接口里组合的能力；社区版没有这个工厂。 */
  createServices?(deps: ProBackendDeps): ProServices;
}

export interface ProSearchHit {
  id: string;
  canvasId: string;
  canvasTitle: string;
  kind: string;
  title: string;
  body: string;
  updatedAt: string | Date;
}

export interface ProBacklinkHit {
  canvasId: string;
  canvasTitle: string;
  nodeId: string;
  title: string;
  snippet: string;
  updatedAt: string | Date;
}

export interface ProServices {
  /** 跨画布全文搜索；只返回本人、未删除画布中的节点。 */
  searchFull(userId: string, query: string): Promise<ProSearchHit[]>;
  /** 目标节点在其他画布中的反向链接。 */
  findCrossCanvasBacklinks(
    userId: string,
    targetCanvasId: string,
    targetNodeId: string,
  ): Promise<ProBacklinkHit[]>;
  /** 概念卡：按当前上下文解释术语。 */
  explainConcept(input: ProConceptInput): Promise<ProConceptResult>;
  /** 苏格拉底追问：单轮提问 + 镜像卡。 */
  generateSocraticTurn(input: ProSocraticTurnInput): Promise<ProSocraticTurn>;
  /** 苏格拉底追问：结束总结。 */
  generateSocraticSummary(input: ProSocraticSummaryInput): Promise<ProSocraticSummary>;
  /** AI 整理报告：章节分组 + 叙述。 */
  organizeReport(input: ProOrganizeInput): Promise<ProOrganizedReport>;
  /** 引导探索：任务运行时的 plan / answer 二选一与子任务回填。 */
  runGuidedTask(input: ProGuidedTaskInput): Promise<ProTaskRunResult>;
}

export interface ProGuideTaskItem {
  id: string;
  title: string;
  body: string;
  why?: string;
  role?: "foundation" | "compare" | "mechanism" | "judgement";
  recommended?: boolean;
  dependsOn?: string[];
  source?: "ai";
}

export interface ProTaskRunResult {
  mode?: "answer" | "plan";
  title?: string;
  results: Array<{ title: string; body: string }>;
  summary?: string;
  items?: ProGuideTaskItem[];
  backfill?: string;
}

export interface ProGuidedTaskInput {
  userId: string;
  prompt: string;
  context: string[];
  model?: string;
  taskType?: string;
  guideMode?: boolean;
  guideChild?: boolean;
  onUsage?: ProUsageCallback;
}

export interface ProUsage {
  inputTokens: number;
  outputTokens: number;
}

export type ProUsageCallback = (usage: ProUsage) => void;

export interface ProConceptInput {
  userId: string;
  term: string;
  context: string[];
  locale?: "zh" | "en";
  model?: string;
  onUsage?: ProUsageCallback;
}

export interface ProConceptResult {
  explanation: string;
  points: string[];
}

export interface ProSocraticRound {
  question: string;
  answer: string;
}

export type ProSocraticDimension =
  | "definition"
  | "evidence"
  | "assumption"
  | "counterexample"
  | "consequence";

export interface ProSocraticTurnInput {
  userId: string;
  action: "start" | "answer" | "resume";
  source: string;
  context?: string[];
  history?: ProSocraticRound[];
  answer?: string;
  locale?: "zh" | "en";
  model?: string;
  onUsage?: ProUsageCallback;
}

export interface ProSocraticTurn {
  question: string;
  dimension: ProSocraticDimension;
  card: { title: string; body: string } | null;
  done: boolean;
}

export interface ProSocraticSummaryInput {
  userId: string;
  source: string;
  history: ProSocraticRound[];
  locale?: "zh" | "en";
  model?: string;
  onUsage?: ProUsageCallback;
}

export interface ProSocraticSummary {
  title: string;
  summary: string;
  blindSpots: string[];
}

export type ProReportScopeMode = "canvas" | "branch" | "selection";
export type ProReportEdgeRelation =
  | "branch"
  | "evidence"
  | "result"
  | "reference"
  | "attachment";

export interface ProReportGraphScope {
  mode: ProReportScopeMode;
  rootNodeIds: string[];
  nodeIds: string[];
  edgeIds: string[];
}

export interface ProReportGraphCanvas {
  name: string;
  locale: "zh" | "en";
  guideMode: boolean;
}

export interface ProReportCatalogItem {
  id: string;
  title: string;
  body: string;
  why?: string;
  dependsOn?: string[];
  role?: string;
  recommended?: boolean;
  source?: string;
}

export interface ProReportCatalog {
  mode: "answers" | "directions";
  items: ProReportCatalogItem[];
  collapsed?: boolean;
  summary?: string;
}

export interface ProReportKeyPoint {
  text: string;
  body: string;
  expanded?: boolean;
}

export interface ProReportSocraticRound {
  question: string;
  answer: string;
  cardTitle: string;
  cardBody: string;
  dimension: string;
  createdAt: string;
}

export interface ProReportSocraticSession {
  id: string;
  sourceNodeId: string;
  sourceTitle: string;
  sourceBody: string;
  rounds: ProReportSocraticRound[];
  status: "asking" | "done";
  title?: string;
  summary?: string;
  blindSpots?: string[];
}

/**
 * 交给 AI 的单个节点。正文完整，不截断；图片只带文字信息，不带二进制。
 * 额外字段允许透传，避免私有 Pro 包与核心契约版本互相绑死。
 */
export interface ProReportGraphNode {
  id: string;
  kind: string;
  title: string;
  body: string;
  collapsed?: boolean;
  hidden?: boolean;
  taskType?: string;
  author?: string;
  status?: string;
  summary?: string;
  keyPoints?: ProReportKeyPoint[];
  url?: string;
  catalog?: ProReportCatalog;
  socraticSession?: ProReportSocraticSession;
  notePages?: Array<{ ocrMarkdown: string; editedMarkdown?: string }>;
  inspireQuestion?: string;
  inspireReason?: string;
  inspirePrerequisites?: string[];
  locked?: boolean;
  [key: string]: unknown;
}

export interface ProReportGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: ProReportEdgeRelation;
  sourceHandle?: string;
  targetHandle?: string;
  hidden?: boolean;
}

export interface ProReportGraphGroup {
  id: string;
  title: string;
  color?: string;
  nodeIds: string[];
  partial?: boolean;
}

export interface ProReportGraphConcept {
  id: string;
  term: string;
  explanation: string;
  points: string[];
  sourceNodeId: string;
}

/** 一份完整的选区子图；范围由用户选择决定，不是整张画布。 */
export interface ProReportGraphInput {
  scope: ProReportGraphScope;
  canvas: ProReportGraphCanvas;
  nodes: ProReportGraphNode[];
  edges: ProReportGraphEdge[];
  groups: ProReportGraphGroup[];
  concepts: ProReportGraphConcept[];
}

export interface ProOrganizeInput extends ProReportGraphInput {
  userId: string;
  model?: string;
  onUsage?: ProUsageCallback;
}

export interface ProReportMainThread {
  thesis: string;
  narrative: string;
  stageIds: string[];
}

export interface ProReportStage {
  id: string;
  title: string;
  question: string;
  reasoning: string;
  outcome: string;
  nodeIds: string[];
}

export interface ProReportMilestone {
  title: string;
  description: string;
  stageId: string;
  nodeIds: string[];
}

export interface ProReportBrightSpot {
  title: string;
  insight: string;
  whyItMatters: string;
  nodeIds: string[];
}

export interface ProReportOpenQuestion {
  question: string;
  nodeIds: string[];
}

export interface ProReportRelation {
  edgeId: string;
  note: string;
}

/** 研究纪要式报告；只引用 id，不包含卡片正文。 */
export interface ProOrganizedReport {
  title: string;
  subtitle: string;
  summary: string;
  mainThread: ProReportMainThread;
  stages: ProReportStage[];
  milestones: ProReportMilestone[];
  brightSpots: ProReportBrightSpot[];
  conclusion: string;
  openQuestions: ProReportOpenQuestion[];
  relations: ProReportRelation[];
}
