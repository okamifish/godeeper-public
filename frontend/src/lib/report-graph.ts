import type {
  CanvasGroup,
  GoDeeperFlowEdge,
  GoDeeperFlowNode,
  KeyConcept,
  NodeKind,
} from "@/lib/types";
import { normalizeNodeCatalog } from "@/lib/node-body";

/** 用户选择的整理范围：整画布、一个分支、或画布框选。 */
export type ReportScopeMode = "canvas" | "branch" | "selection";

export type ReportEdgeRelation =
  | "branch"
  | "evidence"
  | "result"
  | "reference"
  | "attachment";

export interface ReportGraphScope {
  mode: ReportScopeMode;
  rootNodeIds: string[];
  nodeIds: string[];
  edgeIds: string[];
}

export interface ReportGraphCanvas {
  name: string;
  locale: "zh" | "en";
  guideMode: boolean;
}

export interface ReportGraphCatalogItem {
  id: string;
  title: string;
  body: string;
  why?: string;
  dependsOn?: string[];
  role?: string;
  recommended?: boolean;
  source?: string;
}

export interface ReportGraphCatalog {
  mode: "answers" | "directions";
  items: ReportGraphCatalogItem[];
  collapsed?: boolean;
  summary?: string;
}

export interface ReportGraphKeyPoint {
  text: string;
  body: string;
  expanded?: boolean;
}

export interface ReportGraphSocraticRound {
  question: string;
  answer: string;
  cardTitle: string;
  cardBody: string;
  dimension: string;
  createdAt: string;
}

export interface ReportGraphSocraticSession {
  id: string;
  sourceNodeId: string;
  sourceTitle: string;
  sourceBody: string;
  rounds: ReportGraphSocraticRound[];
  status: "asking" | "done";
  title?: string;
  summary?: string;
  blindSpots?: string[];
}

/** 交给 AI 的单个节点；正文完整，图片只带文字，不带二进制。 */
export interface ReportGraphNode {
  id: string;
  kind: NodeKind;
  title: string;
  body: string;
  collapsed?: boolean;
  hidden?: boolean;
  taskType?: string;
  author?: string;
  status?: string;
  summary?: string;
  keyPoints?: ReportGraphKeyPoint[];
  url?: string;
  catalog?: ReportGraphCatalog;
  socraticSession?: ReportGraphSocraticSession;
  notePages?: Array<{ ocrMarkdown: string; editedMarkdown?: string }>;
  inspireQuestion?: string;
  inspireReason?: string;
  inspirePrerequisites?: string[];
  locked?: boolean;
}

export interface ReportGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: ReportEdgeRelation;
  sourceHandle?: string;
  targetHandle?: string;
  hidden?: boolean;
}

export interface ReportGraphGroup {
  id: string;
  title: string;
  color?: string;
  nodeIds: string[];
  /** 分组跨越选区边界时为 true；只带选区内成员 */
  partial?: boolean;
}

export interface ReportGraphConcept {
  id: string;
  term: string;
  explanation: string;
  points: string[];
  sourceNodeId: string;
}

/** 一份完整的选区子图；范围由用户选择决定，不是整张画布。 */
export interface ReportGraphInput {
  scope: ReportGraphScope;
  canvas: ReportGraphCanvas;
  nodes: ReportGraphNode[];
  edges: ReportGraphEdge[];
  groups: ReportGraphGroup[];
  concepts: ReportGraphConcept[];
}

export interface ReportMainThread {
  thesis: string;
  narrative: string;
  stageIds: string[];
}

export interface ReportStage {
  id: string;
  title: string;
  question: string;
  reasoning: string;
  outcome: string;
  nodeIds: string[];
}

export interface ReportMilestone {
  title: string;
  description: string;
  stageId: string;
  nodeIds: string[];
}

export interface ReportBrightSpot {
  title: string;
  insight: string;
  whyItMatters: string;
  nodeIds: string[];
}

export interface ReportOpenQuestion {
  question: string;
  nodeIds: string[];
}

export interface ReportRelation {
  edgeId: string;
  note: string;
}

/** 研究纪要式报告；只引用 id，不包含卡片正文。 */
export interface OrganizedReport {
  title: string;
  subtitle: string;
  summary: string;
  mainThread: ReportMainThread;
  stages: ReportStage[];
  milestones: ReportMilestone[];
  brightSpots: ReportBrightSpot[];
  conclusion: string;
  openQuestions: ReportOpenQuestion[];
  relations: ReportRelation[];
}

export interface ReportScopeRequest {
  mode: ReportScopeMode;
  rootNodeId?: string | null;
  nodeIds?: string[] | null;
}

export interface SerializeReportGraphParams {
  nodes: GoDeeperFlowNode[];
  edges: GoDeeperFlowEdge[];
  groups?: CanvasGroup[];
  concepts?: KeyConcept[];
  scope: ReportScopeRequest;
  canvasName: string;
  locale: "zh" | "en";
  guideMode?: boolean;
}

export interface ReportGraphEstimate {
  nodeCount: number;
  edgeCount: number;
  charCount: number;
  byKind: Partial<Record<NodeKind, number>>;
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toOptionalText(value: unknown): string | undefined {
  const text = toText(value);
  return text ? text : undefined;
}

/** 画布里的后代集合：选中根 + 所有下游节点，包含所有节点类型。 */
export function collectScopeNodeIds(
  nodes: GoDeeperFlowNode[],
  edges: GoDeeperFlowEdge[],
  request: ReportScopeRequest,
): Set<string> {
  const existing = new Set(nodes.map((node) => node.id));

  if (request.mode === "canvas") return existing;

  if (request.mode === "branch") {
    const rootId = request.rootNodeId;
    if (!rootId || !existing.has(rootId)) return new Set();
    const outgoing = new Map<string, string[]>();
    for (const edge of edges) {
      if (!existing.has(edge.source) || !existing.has(edge.target)) continue;
      const list = outgoing.get(edge.source);
      if (list) list.push(edge.target);
      else outgoing.set(edge.source, [edge.target]);
    }
    const result = new Set<string>([rootId]);
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const target of outgoing.get(current) ?? []) {
        if (result.has(target)) continue;
        result.add(target);
        queue.push(target);
      }
    }
    return result;
  }

  return new Set((request.nodeIds ?? []).filter((id) => existing.has(id)));
}

function isTaskLike(node: GoDeeperFlowNode | undefined): boolean {
  return node?.data.kind === "task" || node?.data.kind === "inspire";
}

/**
 * 把 React Flow 的边翻译成报告里的关系。
 * 画布没有独立的 relation 字段，需要从节点类型与 handle 推导。
 */
export function deriveEdgeRelation(
  source: GoDeeperFlowNode | undefined,
  target: GoDeeperFlowNode | undefined,
  sourceHandle?: string | null,
): ReportEdgeRelation {
  if (!source || !target) return "reference";

  if (sourceHandle?.startsWith("kp-") || source.data.kind === "link") {
    if (isTaskLike(target)) return "evidence";
  }

  if (isTaskLike(source) && isTaskLike(target)) return "branch";
  if (isTaskLike(source) && target.data.kind === "result") return "result";
  if (target.data.kind === "result") return "result";

  if (source.data.kind === "text" || source.data.kind === "free" || source.data.kind === "note" || source.data.kind === "image") {
    return "attachment";
  }

  return "reference";
}

function serializeCatalog(node: GoDeeperFlowNode): ReportGraphCatalog | undefined {
  const catalog = normalizeNodeCatalog({
    catalog: node.data.catalog,
    resultItems: node.data.resultItems,
    catalogCollapsed: node.data.catalogCollapsed,
  });
  if (!catalog || catalog.items.length === 0) return undefined;

  return {
    mode: catalog.mode,
    collapsed: catalog.collapsed,
    ...(catalog.summary ? { summary: catalog.summary } : {}),
    items: catalog.items.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      ...(item.why ? { why: item.why } : {}),
      ...(item.dependsOn?.length ? { dependsOn: item.dependsOn } : {}),
      ...(item.role ? { role: item.role } : {}),
      ...(item.recommended ? { recommended: true } : {}),
      ...(item.source ? { source: item.source } : {}),
    })),
  };
}

function serializeSocraticSession(node: GoDeeperFlowNode): ReportGraphSocraticSession | undefined {
  const session = node.data.socraticSession;
  if (!session) return undefined;

  return {
    id: session.id,
    sourceNodeId: session.sourceNodeId,
    sourceTitle: session.sourceTitle,
    sourceBody: session.sourceBody,
    rounds: session.rounds.map((round) => ({
      question: round.question,
      answer: round.answer,
      cardTitle: round.cardTitle,
      cardBody: round.cardBody,
      dimension: round.dimension,
      createdAt: round.createdAt,
    })),
    status: session.status,
    ...(session.title ? { title: session.title } : {}),
    ...(session.summary ? { summary: session.summary } : {}),
    ...(session.blindSpots?.length ? { blindSpots: session.blindSpots } : {}),
  };
}

export function serializeReportNode(node: GoDeeperFlowNode): ReportGraphNode {
  const data = node.data;
  const result: ReportGraphNode = {
    id: node.id,
    kind: data.kind,
    title: toText(data.title),
    body: String(data.body ?? ""),
    ...(data.bodyCollapsed ? { collapsed: true } : {}),
    ...(data.catalogHidden ? { hidden: true } : {}),
    ...(data.taskType ? { taskType: data.taskType } : {}),
    ...(data.author ? { author: data.author } : {}),
    ...(data.taskStatus ? { status: data.taskStatus } : {}),
    ...(data.summary ? { summary: data.summary } : {}),
    ...(data.keyPoints?.length
      ? {
          keyPoints: data.keyPoints.map((point) => ({
            text: point.text,
            body: point.body,
            ...(point.expanded ? { expanded: true } : {}),
          })),
        }
      : {}),
    ...(data.url ? { url: data.url } : {}),
    ...(data.inspireQuestion ? { inspireQuestion: data.inspireQuestion } : {}),
    ...(data.inspireReason ? { inspireReason: data.inspireReason } : {}),
    ...(data.inspirePrerequisites?.length ? { inspirePrerequisites: data.inspirePrerequisites } : {}),
    ...(data.locked ? { locked: true } : {}),
  };

  const catalog = serializeCatalog(node);
  if (catalog) result.catalog = catalog;

  const socraticSession = serializeSocraticSession(node);
  if (socraticSession) result.socraticSession = socraticSession;

  if (data.notePages?.length) {
    // 只发识别文字，不发 imageDataUrl，避免把 base64 当 Token 打出去。
    result.notePages = data.notePages.map((page) => ({
      ocrMarkdown: page.ocrMarkdown,
      ...(page.editedMarkdown ? { editedMarkdown: page.editedMarkdown } : {}),
    }));
  }

  return result;
}

export function serializeReportGraph(params: SerializeReportGraphParams): ReportGraphInput {
  const { nodes, edges, groups, concepts, scope, canvasName, locale, guideMode } = params;
  const scopeNodeIds = collectScopeNodeIds(nodes, edges, scope);
  const scopedNodes = nodes.filter((node) => scopeNodeIds.has(node.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const scopedEdges = edges.filter(
    (edge) => scopeNodeIds.has(edge.source) && scopeNodeIds.has(edge.target),
  );

  const edgeIds = scopedEdges.map((edge) => edge.id);
  const rootNodeIds = scope.mode === "branch" && scope.rootNodeId
    ? [scope.rootNodeId]
    : scopedNodes
        .filter((node) => !scopedEdges.some((edge) => edge.target === node.id))
        .map((node) => node.id);

  const serializedGroups: ReportGraphGroup[] = [];
  for (const group of groups ?? []) {
    const memberIds = group.nodeIds.filter((id) => scopeNodeIds.has(id));
    if (memberIds.length === 0) continue;
    serializedGroups.push({
      id: group.id,
      title: group.title,
      ...(group.color ? { color: group.color } : {}),
      nodeIds: memberIds,
      ...(memberIds.length !== group.nodeIds.length ? { partial: true } : {}),
    });
  }

  const serializedConcepts = (concepts ?? [])
    .filter((concept) => scopeNodeIds.has(concept.sourceNodeId))
    .map((concept) => ({
      id: concept.id,
      term: concept.term,
      explanation: concept.explanation,
      points: concept.points,
      sourceNodeId: concept.sourceNodeId,
    }));

  return {
    scope: {
      mode: scope.mode,
      rootNodeIds,
      nodeIds: scopedNodes.map((node) => node.id),
      edgeIds,
    },
    canvas: {
      name: canvasName,
      locale,
      guideMode: Boolean(guideMode),
    },
    nodes: scopedNodes.map(serializeReportNode),
    edges: scopedEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation: deriveEdgeRelation(nodeById.get(edge.source), nodeById.get(edge.target), edge.sourceHandle),
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
      ...(edge.hidden ? { hidden: true } : {}),
    })),
    groups: serializedGroups,
    concepts: serializedConcepts,
  };
}

export function estimateReportGraph(graph: ReportGraphInput): ReportGraphEstimate {
  const byKind: Partial<Record<NodeKind, number>> = {};
  for (const node of graph.nodes) {
    byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
  }

  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    charCount: JSON.stringify(graph).length,
    byKind,
  };
}
