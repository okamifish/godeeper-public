import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";
import dagre from "dagre";
import { initialCanvas } from "@/data/canvas-data";
import { GENERATED_BRANCHES } from "@/data/constants";
import { runLLMTask, testConnection, analyzeUrl, generateInspiration, generateCritique, generateConceptExplanation, generateSocraticTurn, generateSocraticSummary } from "@/lib/llm";
import {
  BASE_NODE_WIDTH,
  WIDTH_BY_KIND,
  defaultNodeTitle,
  metaString,
  statusLabel,
  POSITION_OFFSETS,
} from "@/data/node-defaults";
import {
  taskRerun,
  taskFromSelection as taskFromSelectionTimeline,
  nodesDeleted,
  nodeDuplicated,
} from "@/data/timeline-templates";
import { t } from "@/lib/i18n";
import { api } from "@/lib/api";
import { boundingBox, findFreeSlot, type PlacementRect } from "@/lib/node-placement";
import type { DecomposeResult, CritiqueFinding, SocraticTurnResponse } from "@/lib/api";
import { importAdapter } from "@/lib/adapters/import-adapter";
import type { CanvasExportFile } from "@/lib/canvas-export";
import { isAuthenticated, getUser } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import { toast } from "sonner";
import {
  buildAiQuestionSeed,
  buildTaskInquiryContext,
  collectAiQuestionTexts,
  detectTaskType,
  normalizeQuestionText,
  normalizeTaskNodeFields,
} from "@/lib/task-model";
import {
  contextEntriesToPrompt,
  getContextRecipe,
  resolveTaskContext,
} from "@/lib/context-resolver";
import { aiErrorMessage } from "@/lib/ai-errors";
import { buildCritiqueInput } from "@/lib/critique-context";
import { DEFAULT_GROUP_COLOR, normalizeGroups, pruneGroups } from "@/lib/group-model";
import { buildConceptContext, findConceptByTerm } from "@/lib/concepts";
import { writeMentionLabelCache, formatMentionsForText, type MentionTarget } from "@/lib/mentions";
import {
  MAX_SOCRATIC_ROUNDS,
  appendSocraticRound,
  buildSocraticCardSeed,
  buildSocraticRound,
  buildSocraticSummarySeed,
  createSocraticSession,
  isSocraticResumable,
  parseSocraticDraft,
  serializeSocraticDraft,
  socraticHistory,
} from "@/lib/socratic";
import {
  EDGE_COLORS,
  EDGE_WIDTHS,
  DAGRE_CONFIG,
  NODE_HEIGHT_BY_KIND,
  RESULT_CATALOG_WIDTH,
} from "@/data/layout-constants";
import {
  buildCatalogBody,
  estimateCatalogHeight,
  normalizeNodeCatalog,
  type CatalogItem,
} from "@/lib/node-body";
import type {
  CanvasEdgeSeed,
  CanvasGroup,
  CanvasNodeSeed,
  CanvasState,
  GoDeeperFlowEdge,
  GoDeeperFlowNode,
  GoDeeperNodeData,
  KeyConcept,
  NodeKind,
  SocraticDimension,
  SocraticSession,
  TaskStatus,
  TraceItem,
} from "@/lib/types";
import { clampNotePageIndex, normalizeNotePages, notePagesToBody } from "@/lib/note-pages";
import { buildQualityHash } from "@/lib/question-quality";

// 任务结果节点必须使用全局唯一 id：runCount 可被画布切换重置，且并发运行时会重复取值。
function uniqueResultId(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function getNodeWidth(node: CanvasNodeSeed) {
  return node.width ?? (WIDTH_BY_KIND[node.kind] ?? BASE_NODE_WIDTH);
}

const SOCRATIC_DRAFT_PREFIX = "godeeper-socratic-draft";

function loadSocraticDraft(canvasId: string): SocraticSession | null {
  if (typeof window === "undefined") return null;
  try {
    return parseSocraticDraft(window.localStorage.getItem(`${SOCRATIC_DRAFT_PREFIX}:${canvasId}`));
  } catch {
    return null;
  }
}

function saveSocraticDraft(canvasId: string, session: SocraticSession) {
  if (typeof window === "undefined") return;
  try {
    const payload = serializeSocraticDraft(session);
    if (payload) window.localStorage.setItem(`${SOCRATIC_DRAFT_PREFIX}:${canvasId}`, payload);
  } catch {
    /* localStorage 不可用时忽略，当前页面仍可继续 */
  }
}

function clearSocraticDraft(canvasId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${SOCRATIC_DRAFT_PREFIX}:${canvasId}`);
  } catch {
    /* ignore */
  }
}

const VALID_NODE_KINDS: ReadonlySet<string> = new Set(["text", "task", "link", "result", "free", "inspire", "note", "image"]);

/** 每次问题判断的请求序号；用于丢弃过期响应，避免旧结果覆盖新问题。 */
const qualityRequestSeq = new Map<string, number>();

const FALLBACK_TITLE_BY_KIND: Record<NodeKind, string> = {
  text: "Untitled",
  task: "Task",
  link: "Source",
  result: "Result",
  free: "Idea",
  inspire: "Inspiration",
  note: "Note",
  image: "Image",
};

/** 旧画布把这两个占位词写进 footer；它们不代表任何真实状态，加载时清掉。 */
const LEGACY_META_VALUES = new Set(["刚创建", "just created", "编辑中", "editing"]);

function normalizeMeta(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  return LEGACY_META_VALUES.has(value.trim().toLowerCase()) ? undefined : value;
}

export function buildNode(node: CanvasNodeSeed): GoDeeperFlowNode {
  const normalized = normalizeTaskNodeFields(node);
  const kind: NodeKind = VALID_NODE_KINDS.has(normalized.kind) ? normalized.kind : "text";
  const x = Number.isFinite(normalized.x) ? normalized.x : 0;
  const y = Number.isFinite(normalized.y) ? normalized.y : 0;
  const width = normalized.width ?? (WIDTH_BY_KIND[kind] ?? BASE_NODE_WIDTH);
  const notePages = normalizeNotePages(normalized.notePages);

  return {
    id: normalized.id,
    // Legacy inspire nodes keep their kind for export/back-compat, but render
    // through the unified task card so provenance is visible.
    type: kind === "inspire" ? "taskNode" : `${kind}Node`,
    position: { x, y },
    data: {
      kind,
      title: String(normalized.title ?? FALLBACK_TITLE_BY_KIND[kind]),
      body: String(normalized.body ?? "") || (notePages ? notePagesToBody(notePages) : ""),
      width,
      metaLeft: normalizeMeta(normalized.metaLeft),
      metaRight: normalizeMeta(normalized.metaRight),
      sourceLabel: normalized.sourceLabel,
      chips: normalized.chips,
      taskStatus: normalized.taskStatus,
      taskType: normalized.taskType,
      author: normalized.author,
      adopted: normalized.adopted,
      adoptedAt: normalized.adoptedAt,
      editedByUser: normalized.editedByUser,
      legacyKind: normalized.legacyKind,
      inspireAction: normalized.inspireAction,
      previewLabel: normalized.previewLabel,
      thumbnailUrl: normalized.thumbnailUrl,
      summary: normalized.summary,
      keyPoints: normalized.keyPoints,
      url: normalized.url,
      inspireQuestion: normalized.inspireQuestion,
      inspireReason: normalized.inspireReason,
      inspirePrerequisites: normalized.inspirePrerequisites,
      bodyCollapsed: normalized.bodyCollapsed,
      catalog: normalizeNodeCatalog({
        catalog: normalized.catalog,
        resultItems: normalized.resultItems,
        catalogCollapsed: normalized.catalogCollapsed,
      }),
      sourceCatalogId: normalized.sourceCatalogId,
      sourceCatalogKind: normalized.sourceCatalogKind,
      sourceCatalogItemId: normalized.sourceCatalogItemId ?? normalized.sourceResultItemId,
      catalogHidden: normalized.catalogHidden === true,
      catalogSourceHash: normalized.catalogSourceHash,
      catalogStale: normalized.catalogStale,
      catalogBackfill: normalized.catalogBackfill,
      contextPinnedIds: normalized.contextPinnedIds,
      contextExcludedIds: normalized.contextExcludedIds,
      contextSelectionIds: normalized.contextSelectionIds,
      notePages,
      noteActivePage: notePages ? clampNotePageIndex(normalized.noteActivePage, notePages.length) : undefined,
      locked: normalized.locked === true,
      qualityStatus: normalized.qualityStatus,
      qualityConfidence: normalized.qualityConfidence,
      qualityHash: normalized.qualityHash,
      qualityModel: normalized.qualityModel,
      qualityCheckedAt: normalized.qualityCheckedAt,
      socraticSession: normalized.socraticSession,
    },
    draggable: normalized.locked !== true,
    hidden: normalized.catalogHidden === true,
    style: { width },
  };
}

export function buildEdge(edge: CanvasEdgeSeed, edgeType?: string): GoDeeperFlowEdge {
  const style = (edgeType ?? "bezier") === "bezier" ? "default" : (edgeType ?? "bezier");
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    type: style,
    animated: false,
    style: {
      stroke: EDGE_COLORS.inactive.stroke,
      strokeWidth: EDGE_WIDTHS.inactive,
    },
    reconnectable: true,
    hidden: edge.hidden === true,
  };
}

/** 导出时把空字符串归一成 undefined，保证 JSON 拖回后与导出内容逐字段一致 */
function exportText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > 0 ? value : undefined;
}

export function toCanvasNodeSeed(node: GoDeeperFlowNode): CanvasNodeSeed {
  return {
    id: node.id,
    kind: node.data.kind,
    title: node.data.title,
    body: node.data.body ?? "",
    x: node.position.x,
    y: node.position.y,
    width: node.data.width,
    metaLeft: exportText(node.data.metaLeft),
    metaRight: exportText(node.data.metaRight),
    sourceLabel: exportText(node.data.sourceLabel),
    previewLabel: exportText(node.data.previewLabel),
    thumbnailUrl: exportText(node.data.thumbnailUrl),
    chips: node.data.chips,
    taskStatus: node.data.taskStatus,
    taskType: node.data.taskType,
    author: node.data.author,
    adopted: node.data.adopted,
    adoptedAt: node.data.adoptedAt,
    editedByUser: node.data.editedByUser,
    legacyKind: node.data.legacyKind,
    inspireAction: node.data.inspireAction,
    summary: exportText(node.data.summary),
    keyPoints: node.data.keyPoints,
    url: exportText(node.data.url),
    inspireQuestion: exportText(node.data.inspireQuestion),
    inspireReason: exportText(node.data.inspireReason),
    inspirePrerequisites: node.data.inspirePrerequisites,
    bodyCollapsed: node.data.bodyCollapsed,
    catalog: node.data.catalog
      ? {
          ...node.data.catalog,
          items: node.data.catalog.items.map((item) => ({
            ...item,
            dependsOn: item.dependsOn ? [...item.dependsOn] : undefined,
          })),
        }
      : undefined,
    sourceCatalogId: node.data.sourceCatalogId,
    sourceCatalogKind: node.data.sourceCatalogKind,
    sourceCatalogItemId: node.data.sourceCatalogItemId,
    catalogHidden: node.data.catalogHidden === true ? true : undefined,
    catalogSourceHash: exportText(node.data.catalogSourceHash),
    catalogStale: node.data.catalogStale,
    catalogBackfill: exportText(node.data.catalogBackfill),
    contextPinnedIds: node.data.contextPinnedIds ? [...node.data.contextPinnedIds] : undefined,
    contextExcludedIds: node.data.contextExcludedIds ? [...node.data.contextExcludedIds] : undefined,
    contextSelectionIds: node.data.contextSelectionIds ? [...node.data.contextSelectionIds] : undefined,
    notePages: node.data.notePages
      ? node.data.notePages.map((page) => ({
          ...page,
          blocks: page.blocks ? page.blocks.map((block) => ({ ...block, bbox: [...block.bbox] as [number, number, number, number] })) : undefined,
        }))
      : undefined,
    noteActivePage: node.data.noteActivePage,
    qualityStatus: node.data.qualityStatus,
    qualityConfidence: node.data.qualityConfidence,
    qualityHash: node.data.qualityHash,
    qualityModel: node.data.qualityModel,
    qualityCheckedAt: node.data.qualityCheckedAt,
    socraticSession: node.data.socraticSession,
  };
}

export function toCanvasEdgeSeed(edge: GoDeeperFlowEdge): CanvasEdgeSeed {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    active: edge.animated,
    hidden: edge.hidden === true ? true : undefined,
  };
}

export function toCanvasStateSnapshot(state: CanvasStore): CanvasState {
  return {
    selectedNodeId: state.selectedNodeId ?? "",
    nodes: state.nodes.map(toCanvasNodeSeed),
    edges: state.edges.map(toCanvasEdgeSeed),
    timeline: state.timeline,
    canvasName: state.canvasName,
    guideMode: state.guideMode,
    groups: state.groups,
    concepts: state.concepts,
  };
}

/** 把后端拆解结果映射到链接节点上，失败/未登录时不伪装成已解析 */
function applyDecomposeResult(
  nodes: GoDeeperFlowNode[],
  nodeId: string,
  result: DecomposeResult,
  language: "zh" | "en",
): GoDeeperFlowNode[] {
  const summary = result.sourceNode?.body?.trim() ?? "";
  const keyPoints = (result.fragmentNodes ?? [])
    .map((fragment) => ({ text: fragment.title ?? "", body: fragment.body ?? "" }))
    .filter((point) => point.text);
  return nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          data: {
            ...node.data,
            title: result.sourceNode?.title?.trim() || node.data.title,
            body: summary || node.data.body,
            summary: summary || node.data.summary,
            keyPoints,
            metaRight: `${keyPoints.length} ${t("keyPoints", language)}`,
            previewLabel: t("analyzed", language),
          },
        }
      : node,
  );
}

function updateNodeStatus(
  nodes: GoDeeperFlowNode[],
  nodeId: string,
  taskStatus: TaskStatus,
  metaRight: string,
  extra?: { taskError?: string | null },
) {
  return nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          data: {
            ...node.data,
            taskStatus,
            metaRight,
            ...(extra ? { taskError: extra.taskError ?? undefined } : {}),
          },
        }
      : node,
  );
}

function appendTimelineItem(timeline: TraceItem[], item: TraceItem) {
  return [...timeline, item];
}

/** 从一批起始节点沿现有连线收集所有下游节点。 */
function collectDescendantIds(startIds: ReadonlySet<string>, edges: GoDeeperFlowEdge[]): Set<string> {
  const result = new Set(startIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (result.has(edge.source) && !result.has(edge.target)) {
        result.add(edge.target);
        changed = true;
      }
    }
  }
  return result;
}

/**
 * 计算“输入缺失”的节点：
 * - 删除前有入边、删除后没有入边的节点；
 * - 这些节点的所有下游也标记为异常，提示推理链已断。
 * recoveredIds 用于连线恢复后清除对应分支的异常状态。
 */
function nextBrokenInputIds(input: {
  edgesBefore: GoDeeperFlowEdge[];
  edgesAfter: GoDeeperFlowEdge[];
  nodesAfter: GoDeeperFlowNode[];
  existing: string[];
  recoveredIds?: ReadonlySet<string>;
}): string[] {
  const nodeIds = new Set(input.nodesAfter.map((node) => node.id));
  const broken = new Set(
    input.existing.filter((id) => nodeIds.has(id) && !(input.recoveredIds?.has(id) ?? false)),
  );
  const hadIncoming = new Set(input.edgesBefore.map((edge) => edge.target));
  const hasIncoming = new Set(input.edgesAfter.map((edge) => edge.target));
  for (const node of input.nodesAfter) {
    if (hadIncoming.has(node.id) && !hasIncoming.has(node.id)) broken.add(node.id);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of input.edgesAfter) {
      if (broken.has(edge.source) && nodeIds.has(edge.target) && !broken.has(edge.target)) {
        broken.add(edge.target);
        changed = true;
      }
    }
  }
  return Array.from(broken);
}

const NODE_SPACING = 40;

function findNonOverlappingY(
  nodes: GoDeeperFlowNode[],
  x: number,
  desiredY: number,
  nodeWidth: number,
  nodeHeight: number,
): number {
  let y = desiredY;
  let attempts = 0;
  while (attempts < 50) {
    const overlaps = nodes.some((n) => {
      const nw = n.data.width ?? BASE_NODE_WIDTH;
      const nh = NODE_HEIGHT_BY_KIND[n.data.kind] ?? 200;
      const xOverlap = x < n.position.x + nw + NODE_SPACING && x + nodeWidth + NODE_SPACING > n.position.x;
      const yOverlap = y < n.position.y + nh + NODE_SPACING && y + nodeHeight + NODE_SPACING > n.position.y;
      return xOverlap && yOverlap;
    });
    if (!overlaps) return y;
    y += 80;
    attempts++;
  }
  return y;
}

function nodePlacementRect(node: GoDeeperFlowNode): PlacementRect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? node.data.width ?? BASE_NODE_WIDTH,
    height: node.measured?.height ?? NODE_HEIGHT_BY_KIND[node.data.kind] ?? 200,
  };
}

function visiblePlacementRects(nodes: GoDeeperFlowNode[]): PlacementRect[] {
  return nodes
    .filter((node) => node.hidden !== true && node.data.catalogHidden !== true)
    .map(nodePlacementRect);
}

/** 卡片之间保留的最小间距（碰撞消解的余量） */
const COLLISION_GAP = 24;
/** 碰撞消解的最大迭代次数，防止极端堆叠时来回推 */
const COLLISION_MAX_ITERATIONS = 16;

function nodeBoxSize(node: GoDeeperFlowNode) {
  return {
    // 优先用 React Flow 渲染后测量到的真实尺寸，未测量时回退估算值
    width: node.measured?.width ?? node.data.width ?? BASE_NODE_WIDTH,
    height: node.measured?.height ?? NODE_HEIGHT_BY_KIND[node.data.kind] ?? 200,
  };
}

/**
 * 最小轴碰撞推移（Minimum Translation Vector）
 * - 两个卡片在 X / Y 两轴的间距都小于 COLLISION_GAP 才算碰撞
 * - 沿「需要的位移更小」的那条轴推开，位移 = 刚好把间距补到 COLLISION_GAP
 * - fixedIds 里的节点（正在被拖的节点）不动，只推其它节点
 * - 不用斥力模拟：那需要逐帧演算，松手后卡片还会自己滑、结果不可复现
 */
function resolveOverlaps(
  nodes: GoDeeperFlowNode[],
  fixedIds: ReadonlySet<string> = new Set(),
  iterations = COLLISION_MAX_ITERATIONS,
  lockedIds: ReadonlySet<string> = new Set(),
): GoDeeperFlowNode[] {
  const result = nodes.map((n) => ({ ...n, position: { ...n.position } }));

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < result.length; i++) {
      const a = result[i];
      if (a.hidden) continue;
      const sa = nodeBoxSize(a);
      for (let j = i + 1; j < result.length; j++) {
        const b = result[j];
        if (b.hidden) continue;
        const sb = nodeBoxSize(b);

        const aL = a.position.x, aT = a.position.y, aR = aL + sa.width, aB = aT + sa.height;
        const bL = b.position.x, bT = b.position.y, bR = bL + sb.width, bB = bT + sb.height;

        // >0 表示两卡已分离该距离；>= COLLISION_GAP 视为不碰撞
        const gapX = Math.max(aL, bL) - Math.min(aR, bR);
        const gapY = Math.max(aT, bT) - Math.min(aB, bB);
        if (gapX >= COLLISION_GAP || gapY >= COLLISION_GAP) continue;

        const penX = COLLISION_GAP - gapX;
        const penY = COLLISION_GAP - gapY;
        const alongX = penX <= penY;

        const fixedA = fixedIds.has(a.id);
        const fixedB = fixedIds.has(b.id);
        const lockedA = lockedIds.has(a.id);
        const lockedB = lockedIds.has(b.id);
        if (lockedA && lockedB) continue;
        if (fixedA && fixedB && !lockedA && !lockedB) continue;

        // 中心差 >0 表示 a 在 b 的右/下方；推 b 时取反方向
        const dx = (aL + sa.width / 2) - (bL + sb.width / 2);
        const dy = (aT + sa.height / 2) - (bT + sb.height / 2);
        const dirX = dx === 0 ? 1 : Math.sign(dx);
        const dirY = dy === 0 ? 1 : Math.sign(dy);

        // 锁定节点永远不动：只推另一个；普通情况下被拖节点不动，只推被撞节点。
        let pushA: boolean;
        if (lockedA || lockedB) {
          pushA = lockedB;
        } else {
          pushA = fixedB && !fixedA;
        }
        const node = pushA ? a : b;
        const signX = pushA ? dirX : -dirX;
        const signY = pushA ? dirY : -dirY;

        if (alongX) {
          node.position = { ...node.position, x: node.position.x + signX * penX };
        } else {
          node.position = { ...node.position, y: node.position.y + signY * penY };
        }
        moved = true;
      }
    }
    if (!moved) break;
  }

  return result;
}

// --- Undo/Redo history ---
const MAX_HISTORY = 50;
type HistoryEntry = { nodes: GoDeeperFlowNode[]; edges: GoDeeperFlowEdge[] };
const undoStack: HistoryEntry[] = [];
const redoStack: HistoryEntry[] = [];

function pushHistory(nodes: GoDeeperFlowNode[], edges: GoDeeperFlowEdge[]) {
  undoStack.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
}

export interface MentionPickerAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MentionPickerInput {
  sourceNodeId: string;
  anchor: MentionPickerAnchor;
  query?: string;
  onSelect: (target: MentionTarget) => void;
  onClose: () => void;
}

export interface MentionPickerState extends MentionPickerInput {
  query: string;
}

export interface MentionPickingState {
  sourceNodeId: string;
  onPick: (target: MentionTarget) => void;
}

interface CanvasStore {
  nodes: GoDeeperFlowNode[];
  edges: GoDeeperFlowEdge[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  timeline: TraceItem[];
  groups: CanvasGroup[];
  concepts: KeyConcept[];
  conceptPendingIds: string[];
  conceptErrors: Record<string, string>;
  conceptSourceNodeId: string | null;
  selectedNodeId: string;
  selectedNodeIds: string[];
  search: string;
  summaryMode: boolean;
  summaryResult: string | null;
  summaryLoading: boolean;
  critiquePreview: { taskId: string; findings: CritiqueFinding[] } | null;
  /** 因上游节点被删除而缺失输入的节点；下游节点也会被标记 */
  brokenInputNodeIds: string[];
  critiqueLoading: boolean;
  critiqueError: string | null;
  focusMode: boolean;
  focusPath: Set<string>;
  drillDownActive: boolean;
  drillDownRoot: string | null;
  socraticActive: boolean;
  socraticSourceNodeId: string | null;
  socraticSession: SocraticSession | null;
  socraticNodes: GoDeeperFlowNode[];
  socraticCurrentQuestion: string;
  socraticCurrentDimension: SocraticDimension | null;
  socraticLoading: boolean;
  socraticError: string | null;
  gridVisible: boolean;
  profileOpen: boolean;
  saveState: string;
  activeCanvasId: string;
  canvases: Record<string, CanvasState>;
  runCount: number;
  panelCollapsed: boolean;
  panelTab: "trace" | "outline" | "concepts";
  setPanelTab: (tab: "trace" | "outline" | "concepts") => void;
  mobileMenuOpen: boolean;
  canvasDensity: "compact" | "comfortable";
  defaultModel: string;
  userName: string;
  userEmail: string;
  language: "zh" | "en";
  jinaApiKey: string;
  theme: "light" | "dark";
  canvasName: string;
  /** 引导模式：画布级开关 */
  guideMode: boolean;
  setCanvasName: (name: string) => void;
  renameCanvas: (name: string) => Promise<void>;
  setGuideMode: (value: boolean) => void;
  pushHistory: () => void;
  setUserName: (value: string) => void;
  setUserEmail: (value: string) => void;
  setLanguage: (value: "zh" | "en") => void;
  setJinaApiKey: (value: string) => void;
  setTheme: (value: "light" | "dark") => void;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  validatedModels: string[];
  apiTestStatus: "idle" | "testing" | "success" | "error";
  apiTestError: string;
  pendingTimers: ReturnType<typeof setTimeout>[];
  abortControllers: Map<string, AbortController>;
  autoEditNodeId: string | null;
  clearAutoEdit: () => void;
  isLayoutAnimating: boolean;
  layoutVersion: number;
  edgeStyle: "smoothstep" | "bezier" | "straight";
  setEdgeStyle: (style: "smoothstep" | "bezier" | "straight") => void;
  setSaveState: (value: string) => void;
  focusNodeId: string | null;
  focusNode: (nodeId: string) => void;
  jumpToMention: (target: MentionTarget) => Promise<void>;
  mentionPicker: MentionPickerState | null;
  mentionPicking: MentionPickingState | null;
  openMentionPicker: (input: MentionPickerInput) => void;
  closeMentionPicker: () => void;
  setMentionQuery: (query: string) => void;
  startMentionPicking: (sourceNodeId: string, onPick: (target: MentionTarget) => void) => void;
  completeMentionPick: (nodeId: string) => void;
  cancelMentionPicking: () => void;
  onNodesChange: (changes: NodeChange<GoDeeperFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<GoDeeperFlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  onReconnect: (oldEdge: GoDeeperFlowEdge, newConnection: Connection) => void;
  selectNode: (nodeId: string) => void;
  syncSelection: (nodeIds: string[]) => void;
  toggleNodeSelection: (nodeId: string) => void;
  clearSelection: () => void;
  setSearch: (value: string) => void;
  setSummaryMode: (value: boolean) => void;
  clearSummaryResult: () => void;
  generateSummary: (nodeIds: string[]) => Promise<void>;
  enterFocusMode: (nodeId: string) => void;
  exitFocusMode: () => void;
  drillDown: (nodeId: string) => void;
  exitDrillDown: () => void;
  startSocratic: (nodeId: string) => Promise<void>;
  resumeSocratic: (cardNodeId: string) => Promise<void>;
  submitSocraticAnswer: (answer: string) => Promise<void>;
  finishSocratic: () => Promise<void>;
  discardSocratic: () => void;
  closeSocratic: () => void;
  setGridVisible: (value: boolean) => void;
  setProfileOpen: (value: boolean) => void;
  setActiveCanvasId: (value: string) => Promise<void>;
  createNewCanvas: () => Promise<void>;
  resetForAuthChange: () => void;
  setPanelCollapsed: (value: boolean) => void;
  setMobileMenuOpen: (value: boolean) => void;
  togglePanel: () => void;
  setCanvasDensity: (value: "compact" | "comfortable") => void;
  setDefaultModel: (value: string) => void;
  setApiKey: (value: string) => void;
  setBaseUrl: (value: string) => void;
  setModelName: (value: string) => void;
  testAndSaveApi: () => void;
  clearApiConfig: (modelId: string) => void;
  restoreCanvas: (file: CanvasExportFile) => void;
  addLinkNodeAt: (
    input: { title: string; body?: string; url?: string; sourceLabel?: string; previewLabel?: string },
    x: number,
    y: number,
  ) => string;
  addImageNodeAt: (
    input: { imageUrl: string; title: string; naturalWidth?: number; naturalHeight?: number },
    x: number,
    y: number,
  ) => string;
  importDocumentAt: (file: File, x: number, y: number) => Promise<void>;
  importTextAt: (text: string, x: number, y: number) => Promise<void>;
  importUrl: (url: string, x: number, y: number) => void;
  expandKeyPoint: (nodeId: string, pointIndex: number) => void;
  runTask: (taskNodeId?: string) => void;
  cancelTask: (taskNodeId: string) => void;
  createTaskFromSelection: () => void;
  createAiQuestionFromTask: (taskNodeId: string) => Promise<void>;
  requestCritique: (taskNodeId: string) => Promise<void>;
  acceptCritiqueFinding: (index: number) => void;
  dismissCritique: () => void;
  autoLayout: () => void;
  returnToBranchPoint: () => void;
  deleteSelectedNodes: () => void;
  duplicateNode: (nodeId: string) => void;
  /** 把多张历史结果卡合并成一张目录卡；可撤销 */
  mergeResultNodes: (nodeIds: string[]) => void;
  /** 从目录卡的某一行物化任务节点；已存在则聚焦并返回 */
  materializeCatalogItem: (catalogId: string, itemId: string) => string | null;
  toggleCatalogChild: (catalogId: string, itemId: string) => void;
  updateNodeData: (nodeId: string, data: Partial<GoDeeperNodeData>) => void;
  toggleNodeLock: (nodeId: string) => void;
  createGroupFromSelection: () => void;
  toggleGroupSelection: () => void;
  ungroupSelected: () => void;
  renameGroup: (groupId: string, title: string) => void;
  setGroupColor: (groupId: string, color: string) => void;
  deleteGroup: (groupId: string) => void;
  setConceptSourceNodeId: (nodeId: string | null) => void;
  createConceptFromSelection: (term: string, sourceNodeId?: string) => Promise<void>;
  retryConcept: (conceptId: string) => Promise<void>;
  deleteConcept: (conceptId: string) => void;
  focusConceptSource: (conceptId: string) => void;
  addNode: (x: number, y: number, kind?: NodeKind) => string;
  addConnectedNode: (input: {
    fromNodeId: string;
    fromHandleId?: string | null;
    fromHandleType?: "source" | "target";
    x: number;
    y: number;
    kind: NodeKind;
  }) => string;
  addSiblingNode: (nodeId: string) => void;
  addChildNode: (nodeId: string, kind?: NodeKind) => string;
  createInspireActionCard: (action: "challenge" | "rebut") => void;
  removeChip: (nodeId: string, chip: string) => void;
  getReasoningPath: (nodeId: string) => GoDeeperFlowNode[];
  exportReport: () => void;
  exportOpen: boolean;
  setExportOpen: (value: boolean) => void;
  saveCurrentCanvas: () => Promise<void>;
  deleteCanvas: (canvasId: string) => Promise<void>;
  canvasHistory: string[];
  goBackCanvas: () => void;
}

export const useCanvasStore = create<CanvasStore>((set, get) => {
  const makeEdge = (seed: CanvasEdgeSeed) => buildEdge(seed, get().edgeStyle);

  const initialEdges = initialCanvas.edges.map((e) => buildEdge(e));

  const socraticSourceText = (session: SocraticSession) =>
    `${session.sourceTitle}\n${session.sourceBody}`.trim().slice(0, 1200);

  const failSocratic = (error: unknown, language: "zh" | "en") => {
    const message = error instanceof Error ? error.message : String(error);
    set({ socraticLoading: false, socraticError: aiErrorMessage(message, language) });
  };

  const applySocraticTurn = (
    session: SocraticSession,
    response: SocraticTurnResponse,
    canvasId: string,
  ) => {
    const next: SocraticSession = {
      ...session,
      status: response.done ? "done" : "asking",
      pendingQuestion: response.done ? undefined : response.question,
      pendingDimension: response.done ? undefined : response.dimension,
      updatedAt: new Date().toISOString(),
    };
    set({
      socraticSession: next,
      socraticCurrentQuestion: next.pendingQuestion ?? "",
      socraticCurrentDimension: next.pendingDimension ?? null,
      socraticLoading: false,
      socraticError: null,
    });
    saveSocraticDraft(canvasId, next);
    return next;
  };

  /** 用当前画布语境补全概念解释；失败时保留卡片，便于稍后重试 */
  const fillConceptExplanation = async (concept: KeyConcept) => {
    const { nodes, edges, baseUrl, apiKey, modelName, defaultModel, language } = get();
    if (!hasCapability(getUser(), "ai.concept")) {
      toast.error(t("proFeatureRequired", language));
      return;
    }
    const activeModel = modelName || defaultModel || "";
    set((state) => ({
      conceptPendingIds: Array.from(new Set([...state.conceptPendingIds, concept.id])),
      conceptErrors: (() => {
        const next = { ...state.conceptErrors };
        delete next[concept.id];
        return next;
      })(),
    }));

    if (!isAuthenticated() && (!baseUrl || !apiKey || !activeModel)) {
      set((state) => ({
        conceptPendingIds: state.conceptPendingIds.filter((id) => id !== concept.id),
        conceptErrors: { ...state.conceptErrors, [concept.id]: "AI_NOT_CONFIGURED" },
      }));
      toast.error(t("conceptGenerateFailed", language), { description: t("noModelsConfigured", language) });
      return;
    }

    try {
      const context = buildConceptContext(nodes, edges, concept.sourceNodeId);
      const result = await generateConceptExplanation(activeModel, {
        term: concept.term,
        context,
        locale: language,
      });
      set((state) => {
        const nextErrors = { ...state.conceptErrors };
        delete nextErrors[concept.id];
        return {
          concepts: state.concepts.map((item) =>
            item.id === concept.id
              ? { ...item, explanation: result.explanation, points: result.points }
              : item
          ),
          conceptPendingIds: state.conceptPendingIds.filter((id) => id !== concept.id),
          conceptErrors: nextErrors,
          saveState: "Unsaved",
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      set((state) => ({
        conceptPendingIds: state.conceptPendingIds.filter((id) => id !== concept.id),
        conceptErrors: { ...state.conceptErrors, [concept.id]: message || "unknown" },
      }));
      toast.error(t("conceptGenerateFailed", language), {
        description: message ? aiErrorMessage(message, language) : t("unknownError", language),
      });
    }
  };

  return ({
  nodes: initialCanvas.nodes.map(buildNode),
  edges: initialEdges,
  canvasName: initialCanvas.canvasName ?? "Untitled Canvas",
  guideMode: initialCanvas.guideMode ?? false,
  canvasHistory: [],
  canUndo: false,
  canRedo: false,
  undo: () => {
    const entry = undoStack.pop();
    if (!entry) return;
    const { nodes, edges } = get();
    redoStack.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
    set({ nodes: entry.nodes, edges: entry.edges, brokenInputNodeIds: [], canUndo: undoStack.length > 0, canRedo: true });
  },
  redo: () => {
    const entry = redoStack.pop();
    if (!entry) return;
    const { nodes, edges } = get();
    undoStack.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
    set({ nodes: entry.nodes, edges: entry.edges, brokenInputNodeIds: [], canUndo: true, canRedo: redoStack.length > 0 });
  },
  pushHistory: () => {
    const { nodes, edges } = get();
    pushHistory(nodes, edges);
    set({ canUndo: undoStack.length > 0, canRedo: false });
  },
  timeline: initialCanvas.timeline,
  groups: [],
  concepts: [],
  conceptPendingIds: [],
  conceptErrors: {},
  conceptSourceNodeId: null,
  selectedNodeId: initialCanvas.selectedNodeId,
  selectedNodeIds: [],
  search: "",
  summaryMode: false,
  summaryResult: null,
  summaryLoading: false,
  critiquePreview: null,
  brokenInputNodeIds: [],
  critiqueLoading: false,
  critiqueError: null,
  focusMode: false,
  focusPath: new Set<string>(),
  drillDownActive: false,
  drillDownRoot: null,
  socraticActive: false,
  socraticSourceNodeId: null,
  socraticSession: null,
  socraticNodes: [],
  socraticCurrentQuestion: "",
  socraticCurrentDimension: null,
  socraticLoading: false,
  socraticError: null,
  gridVisible: true,
  profileOpen: false,
  exportOpen: false,
  saveState: "Saved",
  activeCanvasId: "canvas-1",
  canvases: {
    "canvas-1": initialCanvas,
  },
  runCount: 0,
  panelCollapsed: false,
  panelTab: "trace",
  mobileMenuOpen: false,
  canvasDensity: "compact",
  defaultModel: "",
  userName: typeof window !== "undefined" && localStorage.getItem("godeeper-auth-token") ? (() => {
    try {
      const raw = localStorage.getItem("godeeper-auth-user");
      if (raw) { const u = JSON.parse(raw); if (u?.displayName) return u.displayName; }
    } catch {}
    return "用户";
  })() : "",
  userEmail: typeof window !== "undefined" && localStorage.getItem("godeeper-auth-token") ? (() => {
    try {
      const raw = localStorage.getItem("godeeper-auth-user");
      if (raw) { const u = JSON.parse(raw); if (u?.email) return u.email; }
    } catch {}
    return "";
  })() : "",
  language: "zh",
  jinaApiKey: "",
  theme: typeof window !== "undefined" && localStorage.getItem("godeeper-theme") === "dark" ? "dark" : "light",
  setCanvasName: (name) => set({ canvasName: name }),
  renameCanvas: async (name) => {
    const next = name.trim();
    if (!next) return;
    const previous = get().canvasName;
    if (next === previous) return;

    set({ canvasName: next });
    const canvasId = get().activeCanvasId;
    const isCloudCanvas = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(canvasId);

    if (!isCloudCanvas) {
      const state = get();
      set({
        canvases: {
          ...state.canvases,
          [canvasId]: { ...toCanvasStateSnapshot(state), canvasName: next },
        },
      });
      return;
    }

    try {
      await api.updateCanvas(canvasId, { title: next });
      const state = get();
      const snapshot = state.canvases[canvasId];
      set({
        canvases: snapshot
          ? { ...state.canvases, [canvasId]: { ...snapshot, canvasName: next } }
          : state.canvases,
      });
    } catch {
      set({ canvasName: previous });
      toast.error(t("canvasRenameFailed", get().language));
    }
  },
  setGuideMode: (value) => {
    set({ guideMode: value });
    const state = get();
    const snapshot = toCanvasStateSnapshot(state);
    set({ canvases: { ...state.canvases, [state.activeCanvasId]: snapshot } });
    void state.saveCurrentCanvas().catch(() => {});
  },
  setUserName: (value) => set({ userName: value }),
  setUserEmail: (value) => set({ userEmail: value }),
  setLanguage: (value) => set({ language: value }),
  setJinaApiKey: (value: string) => set({ jinaApiKey: value }),
  setTheme: (value) => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", value === "dark");
    }
    localStorage.setItem("godeeper-theme", value);
    set({ theme: value });
  },
  apiKey: typeof window !== "undefined" ? (localStorage.getItem("godeeper-api-key") ?? "") : "",
  baseUrl: typeof window !== "undefined" ? (localStorage.getItem("godeeper-base-url") ?? "") : "",
  modelName: typeof window !== "undefined" ? (localStorage.getItem("godeeper-model-name") ?? "") : "",
  validatedModels: (() => {
    if (typeof window === "undefined") return [] as string[];
    // 只有验证成功的配置才算“已验证模型”，不能仅凭输入框有值就当成可用。
    try {
      const raw = localStorage.getItem("godeeper-api-verified");
      const verified = raw ? JSON.parse(raw) : null;
      const key = localStorage.getItem("godeeper-api-key");
      const base = localStorage.getItem("godeeper-base-url");
      const model = localStorage.getItem("godeeper-model-name");
      return key && base && model
        && verified?.baseUrl === base
        && verified?.modelName === model
        ? [model]
        : [] as string[];
    } catch {
      return [] as string[];
    }
  })(),
  apiTestStatus: "idle",
  apiTestError: "",
  pendingTimers: [],
  abortControllers: new Map(),
  autoEditNodeId: null,
  clearAutoEdit: () => set({ autoEditNodeId: null }),
  isLayoutAnimating: false,
  layoutVersion: 0,
  edgeStyle: "bezier",
  setEdgeStyle: (style) => {
    const rfType = style === "bezier" ? "default" : style;
    const edges = get().edges.map((e) => ({ ...e, type: rfType }));
    set({ edgeStyle: style, edges });
  },
  setSaveState: (value) => set({ saveState: value }),
  focusNodeId: null,
  mentionPicker: null,
  mentionPicking: null,
  focusNode: (nodeId) => {
    set((state) => ({
      selectedNodeId: nodeId,
      selectedNodeIds: [nodeId],
      focusNodeId: nodeId,
      nodes: state.nodes.map((n) => ({
        ...n,
        selected: n.id === nodeId,
      })),
    }));
    setTimeout(() => set({ focusNodeId: null }), 600);
  },
  jumpToMention: async (target) => {
    const state = get();
    if (target.canvasId !== state.activeCanvasId) {
      try {
        await state.setActiveCanvasId(target.canvasId);
      } catch {
        toast.error(t("mentionJumpFailed", state.language));
        return;
      }
    }

    const current = get();
    if (current.activeCanvasId !== target.canvasId) {
      toast.error(t("mentionJumpFailed", state.language));
      return;
    }
    const node = current.nodes.find((item) => item.id === target.nodeId);
    if (!node) {
      toast.error(t("mentionTargetMissing", state.language));
      return;
    }

    current.focusNode(target.nodeId);
    writeMentionLabelCache({
      canvasId: target.canvasId,
      nodeId: target.nodeId,
      label: node.data.title,
      canvasTitle: current.canvasName,
    });
  },
  openMentionPicker: (input) => set({
    mentionPicker: {
      ...input,
      query: input.query ?? "",
    },
  }),
  closeMentionPicker: () => set({ mentionPicker: null }),
  setMentionQuery: (query) => set((state) => (
    state.mentionPicker
      ? { mentionPicker: { ...state.mentionPicker, query } }
      : {}
  )),
  startMentionPicking: (sourceNodeId, onPick) => set({
    mentionPicker: null,
    mentionPicking: { sourceNodeId, onPick },
  }),
  completeMentionPick: (nodeId) => {
    const { mentionPicking, nodes, activeCanvasId } = get();
    if (!mentionPicking || nodeId === mentionPicking.sourceNodeId) return;
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return;
    mentionPicking.onPick({
      canvasId: activeCanvasId,
      nodeId,
      label: node.data.title,
    });
    set({ mentionPicking: null });
  },
  cancelMentionPicking: () => set({ mentionPicking: null }),
  onNodesChange: (changes) => {
    if (get().socraticActive) {
      // 会话画布只允许移动/选择，不允许删除；主画布 nodes 完全不动。
      const allowed = changes.filter((change) => change.type !== "remove");
      set({ socraticNodes: applyNodeChanges(allowed, get().socraticNodes) });
      return;
    }
    const selectChanges = changes.filter(
      (c): c is Extract<NodeChange, { type: "select" }> => c.type === "select",
    );
    // 锁定只锁位置：位置变更一律忽略；选择、删除、尺寸等变更照常。
    const lockedIds = new Set(
      get().nodes.filter((node) => node.data.locked === true).map((node) => node.id),
    );
    const nonSelect = changes.filter(
      (c) => c.type !== "select" && !(c.type === "position" && lockedIds.has(c.id)),
    );
    const removedIds = new Set(
      nonSelect.filter((c) => c.type === "remove").map((c) => c.id),
    );
    const hasRemoval = removedIds.size > 0;
    const dragEndIds = nonSelect
      .filter((c): c is Extract<NodeChange, { type: "position" }> => c.type === "position" && c.dragging === false)
      .map((c) => c.id);
    const hasPosition = dragEndIds.length > 0;
    if (hasRemoval || hasPosition) pushHistory(get().nodes, get().edges);
    const applied = applyNodeChanges(nonSelect, get().nodes);
    // 拖拽松手时做一次「最小轴碰撞推移」：只推被撞到的节点，被拖的节点保持落点不动。
    // 拖拽过程中不实时推，避免卡片一路乱跑；自动布局仍会全量消解重叠。
    const nodes = hasPosition
      ? resolveOverlaps(applied, new Set(dragEndIds), COLLISION_MAX_ITERATIONS, lockedIds)
      : applied;
    const edgesAfter = hasRemoval
      ? get().edges.filter((edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target))
      : get().edges;
    const brokenInputNodeIds = hasRemoval
      ? nextBrokenInputIds({
          edgesBefore: get().edges,
          edgesAfter,
          nodesAfter: nodes,
          existing: get().brokenInputNodeIds,
        })
      : get().brokenInputNodeIds;
    set((state) => {
      let selectedNodeIds = state.selectedNodeIds;
      if (selectChanges.length > 0) {
        const nextIds = new Set(state.selectedNodeIds);
        for (const change of selectChanges) {
          if (change.selected) nextIds.add(change.id);
          else nextIds.delete(change.id);
        }
        selectedNodeIds = Array.from(nextIds);
      }
      return {
        nodes,
        edges: edgesAfter,
        brokenInputNodeIds,
        selectedNodeIds,
        selectedNodeId: selectedNodeIds[selectedNodeIds.length - 1] ?? null,
        saveState: hasPosition || hasRemoval ? "Unsaved" : "Saved",
        canUndo: undoStack.length > 0,
      };
    });
  },
  onEdgesChange: (changes) => {
    if (get().socraticActive) return;
    const hasRemoval = changes.some((c) => c.type === "remove");
    if (hasRemoval) pushHistory(get().nodes, get().edges);
    set((state) => {
      const edges = applyEdgeChanges(changes, state.edges);
      const brokenInputNodeIds = hasRemoval
        ? nextBrokenInputIds({
            edgesBefore: state.edges,
            edgesAfter: edges,
            nodesAfter: state.nodes,
            existing: state.brokenInputNodeIds,
          })
        : state.brokenInputNodeIds;
      return {
        edges,
        brokenInputNodeIds,
        canUndo: undoStack.length > 0,
      };
    });
  },
  onConnect: (connection) => {
    if (get().socraticActive) return;
    pushHistory(get().nodes, get().edges);
    set((state) => {
      const edges = addEdge(
        {
          ...connection,
          type: get().edgeStyle === "bezier" ? "default" : get().edgeStyle,
          style: { stroke: EDGE_COLORS.inactive.stroke, strokeWidth: EDGE_WIDTHS.inactive },
        },
        state.edges,
      );
      const recoveredIds = connection.target
        ? collectDescendantIds(new Set([connection.target]), edges)
        : undefined;
      return {
        edges,
        brokenInputNodeIds: nextBrokenInputIds({
          edgesBefore: state.edges,
          edgesAfter: edges,
          nodesAfter: state.nodes,
          existing: state.brokenInputNodeIds,
          recoveredIds,
        }),
        saveState: "Saved",
        canUndo: undoStack.length > 0,
      };
    });
  },
  onReconnect: (oldEdge, newConnection) => {
    if (get().socraticActive) return;
    pushHistory(get().nodes, get().edges);
    set((state) => {
      const edges = state.edges.map((e) =>
        e.id === oldEdge.id
          ? { ...e, source: newConnection.source!, target: newConnection.target!, sourceHandle: newConnection.sourceHandle, targetHandle: newConnection.targetHandle }
          : e
      );
      const recoveredIds = newConnection.target
        ? collectDescendantIds(new Set([newConnection.target]), edges)
        : undefined;
      return {
        edges,
        brokenInputNodeIds: nextBrokenInputIds({
          edgesBefore: state.edges,
          edgesAfter: edges,
          nodesAfter: state.nodes,
          existing: state.brokenInputNodeIds,
          recoveredIds,
        }),
        canUndo: undoStack.length > 0,
      };
    });
  },
  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedNodeIds: [nodeId] }),
  syncSelection: (nodeIds) => {
    const current = get().selectedNodeIds;
    if (current.length === nodeIds.length && current.every((id, i) => id === nodeIds[i])) return;
    set({
      selectedNodeIds: nodeIds,
      selectedNodeId: nodeIds[nodeIds.length - 1] ?? null,
    });
  },
  toggleNodeSelection: (nodeId) =>
    set((state) => {
      const isSelected = state.selectedNodeIds.includes(nodeId);
      const newSelection = isSelected
        ? state.selectedNodeIds.filter((id) => id !== nodeId)
        : [...state.selectedNodeIds, nodeId];
      return {
        selectedNodeIds: newSelection,
        selectedNodeId: newSelection[newSelection.length - 1] ?? state.selectedNodeId,
      };
    }),
  clearSelection: () => set({ selectedNodeIds: [] }),
  setSearch: (value) => set({ search: value }),
  setSummaryMode: (value) => set({ summaryMode: value }),
  clearSummaryResult: () => set({ summaryResult: null, summaryMode: false }),
  generateSummary: async (nodeIds: string[]) => {
    const { apiKey, baseUrl, modelName, nodes } = get();
    const selected = nodes.filter((n) => nodeIds.includes(n.id));
    if (selected.length < 2) return;

    set({ summaryLoading: true, summaryMode: true });

    // Mock mode only for local, unauthenticated canvases.
    if (!isAuthenticated() && (!apiKey || !baseUrl || !modelName)) {
      const titles = selected.map((n) => n.data.title).join("、");
      const mockResult = `【关系分析】\n以下节点（${titles}）之间存在密切的关联。\n\n【共同主题】\n这些节点围绕同一核心议题展开，形成了从不同角度的探索路径。\n\n【潜在推论】\n可以进一步探索这些观点之间的交叉验证，发现更深层的关联。`;
      setTimeout(() => set({ summaryResult: mockResult, summaryLoading: false }), 800);
      return;
    }

    try {
      const context = selected.map((n) => `[${n.data.kind}] ${n.data.title}: ${formatMentionsForText(n.data.body)}`);
      const { results } = await runLLMTask(
        baseUrl, apiKey, modelName,
        "分析以下节点之间的关系并生成一段结构化总结，包含：关系描述、共同主题、潜在推论。用中文回答。",
        context,
        undefined,
        get().language,
        "summary",
      );
      const text = results.map((r) => `${r.title}\n${r.body}`).join("\n\n");
      set({ summaryResult: text, summaryLoading: false });
    } catch {
      set({ summaryResult: null, summaryLoading: false });
    }
  },
  enterFocusMode: (nodeId: string) => {
    const { edges } = get();
    const path = new Set<string>();
    const queue = [nodeId];
    // BFS downstream
    const visited = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      path.add(id);
      for (const e of edges) {
        if (e.source === id && !visited.has(e.target)) queue.push(e.target);
      }
    }
    // BFS upstream
    queue.push(nodeId);
    const visitedUp = new Set<string>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visitedUp.has(id)) continue;
      visitedUp.add(id);
      path.add(id);
      for (const e of edges) {
        if (e.target === id && !visitedUp.has(e.source)) queue.push(e.source);
      }
    }
    set({ focusMode: true, focusPath: path });
  },
  exitFocusMode: () => set({ focusMode: false, focusPath: new Set() }),
  drillDown: (nodeId: string) => {
    const { nodes, edges } = get();
    const visible = new Set<string>();
    // Find parent
    const parentEdge = edges.find((e) => e.target === nodeId);
    if (parentEdge) visible.add(parentEdge.source);
    // BFS from selected node downstream
    const queue = [nodeId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visible.has(id)) continue;
      visible.add(id);
      for (const e of edges) {
        if (e.source === id && !visible.has(e.target)) queue.push(e.target);
      }
    }
    const updatedNodes = nodes.map((n) => ({ ...n, hidden: !visible.has(n.id) }));
    set({ nodes: updatedNodes, drillDownActive: true, drillDownRoot: nodeId });
    get().autoLayout();
  },
  exitDrillDown: () => {
    const nodes = get().nodes.map((n) => ({ ...n, hidden: false }));
    set({ nodes, drillDownActive: false, drillDownRoot: null });
    get().autoLayout();
  },
  startSocratic: async (nodeId) => {
    const state = get();
    if (state.socraticActive) return;
    const node = state.nodes.find((item) => item.id === nodeId);
    if (!node) return;

    const model = state.modelName || state.defaultModel || undefined;
    if (!isAuthenticated() && (!state.baseUrl || !state.apiKey || !model)) {
      toast.error(t("socraticFailed", state.language), {
        description: t("noModelsConfigured", state.language),
      });
      return;
    }

    const draft = loadSocraticDraft(state.activeCanvasId);
    const resumable = draft && draft.sourceNodeId === nodeId && isSocraticResumable(draft) ? draft : null;

    if (resumable) {
      set({
        socraticActive: true,
        socraticSourceNodeId: nodeId,
        socraticSession: resumable,
        socraticNodes: resumable.rounds.map((round, index) => buildNode(buildSocraticCardSeed({ round, index }))),
        socraticCurrentQuestion: resumable.pendingQuestion ?? "",
        socraticCurrentDimension: resumable.pendingDimension ?? null,
        socraticLoading: !resumable.pendingQuestion,
        socraticError: null,
        selectedNodeId: "",
        selectedNodeIds: [],
      });
      if (resumable.pendingQuestion) return;

      try {
        const response = await generateSocraticTurn(model, {
          action: "resume",
          source: socraticSourceText(resumable),
          context: resumable.context ?? [],
          history: socraticHistory(resumable),
          locale: state.language,
        });
        if (!("question" in response)) throw new Error("AI_SOCRATIC_INVALID");
        applySocraticTurn(resumable, response, state.activeCanvasId);
        if (response.done) await get().finishSocratic();
      } catch (error) {
        failSocratic(error, state.language);
      }
      return;
    }

    const path = state.getReasoningPath(nodeId);
    const ancestors = path.slice(0, -1).slice(-3).map((item) => ({
      title: item.data.title,
      body: formatMentionsForText(item.data.body),
    }));
    const contextText = buildTaskInquiryContext(node.data, ancestors, []).slice(0, 3000);
    const session = createSocraticSession({
      sourceNodeId: nodeId,
      sourceTitle: node.data.title,
      sourceBody: formatMentionsForText(node.data.body),
      context: [contextText],
    });

    set({
      socraticActive: true,
      socraticSourceNodeId: nodeId,
      socraticSession: session,
      socraticNodes: [],
      socraticCurrentQuestion: "",
      socraticCurrentDimension: null,
      socraticLoading: true,
      socraticError: null,
      selectedNodeId: "",
      selectedNodeIds: [],
    });
    saveSocraticDraft(state.activeCanvasId, session);

    try {
      const response = await generateSocraticTurn(model, {
        action: "start",
        source: socraticSourceText(session),
        context: session.context ?? [],
        history: [],
        locale: state.language,
      });
      if (!("question" in response)) throw new Error("AI_SOCRATIC_INVALID");
      applySocraticTurn(session, response, state.activeCanvasId);
      if (response.done) await get().finishSocratic();
    } catch (error) {
      failSocratic(error, state.language);
    }
  },
  resumeSocratic: async (cardNodeId) => {
    await get().startSocratic(cardNodeId);
  },
  submitSocraticAnswer: async (answer) => {
    const state = get();
    const session = state.socraticSession;
    const question = state.socraticCurrentQuestion;
    if (!session || !question || state.socraticLoading) return;
    const text = answer.trim();
    if (!text) return;

    const model = state.modelName || state.defaultModel || undefined;
    set({ socraticLoading: true, socraticError: null });

    try {
      const response = await generateSocraticTurn(model, {
        action: "answer",
        source: socraticSourceText(session),
        context: session.context ?? [],
        history: socraticHistory(session),
        answer: text,
        locale: state.language,
      });
      if (!("question" in response)) throw new Error("AI_SOCRATIC_INVALID");

      const round = buildSocraticRound({
        question,
        answer: text,
        card: response.card,
        dimension: response.dimension,
      });
      const withRound = appendSocraticRound(session, round);
      const card = buildNode(buildSocraticCardSeed({ round, index: session.rounds.length }));
      set((current) => ({ socraticNodes: [...current.socraticNodes, card] }));

      const next = applySocraticTurn(withRound, response, state.activeCanvasId);
      if (response.done || next.rounds.length >= MAX_SOCRATIC_ROUNDS) {
        await get().finishSocratic();
      }
    } catch (error) {
      failSocratic(error, state.language);
    }
  },
  finishSocratic: async () => {
    const state = get();
    const session = state.socraticSession;
    if (!session) return;
    if (session.rounds.length === 0) {
      get().discardSocratic();
      return;
    }

    const model = state.modelName || state.defaultModel || undefined;
    set({ socraticLoading: true, socraticError: null });

    try {
      const response = await generateSocraticSummary(model, {
        action: "finish",
        source: socraticSourceText(session),
        history: socraticHistory(session),
        locale: state.language,
      });
      if (!("summary" in response)) throw new Error("AI_SOCRATIC_INVALID");

      const finalSession: SocraticSession = {
        ...session,
        status: "done",
        pendingQuestion: undefined,
        pendingDimension: undefined,
        title: response.title,
        summary: response.summary,
        blindSpots: response.blindSpots,
        updatedAt: new Date().toISOString(),
      };
      const nodes = get().nodes;
      const sourceNode = nodes.find((item) => item.id === session.sourceNodeId);
      const width = WIDTH_BY_KIND.task ?? BASE_NODE_WIDTH;
      const source = sourceNode
        ? {
          id: sourceNode.id,
          x: sourceNode.position.x,
          y: sourceNode.position.y,
          width: sourceNode.data.width ?? width,
        }
        : { id: session.sourceNodeId, x: 0, y: 0, width };
      const x = source.x + (source.width ?? width) + 80;
      const y = findNonOverlappingY(nodes, x, source.y, width, NODE_HEIGHT_BY_KIND.task);
      const seed = buildSocraticSummarySeed({ session: finalSession, source, x, y });
      const card = buildNode(seed);
      const edge = sourceNode
        ? makeEdge({ id: `${source.id}-socratic-${card.id}`, source: source.id, target: card.id })
        : null;

      set((current) => ({
        nodes: [...current.nodes, card],
        edges: edge ? [...current.edges, edge] : current.edges,
        socraticActive: false,
        socraticSourceNodeId: null,
        socraticSession: null,
        socraticNodes: [],
        socraticCurrentQuestion: "",
        socraticCurrentDimension: null,
        socraticLoading: false,
        socraticError: null,
        selectedNodeId: card.id,
        selectedNodeIds: [card.id],
        saveState: "Unsaved",
      }));
      clearSocraticDraft(state.activeCanvasId);
      toast.success(t("socraticSaved", state.language));
    } catch (error) {
      failSocratic(error, state.language);
    }
  },
  discardSocratic: () => {
    clearSocraticDraft(get().activeCanvasId);
    set({
      socraticActive: false,
      socraticSourceNodeId: null,
      socraticSession: null,
      socraticNodes: [],
      socraticCurrentQuestion: "",
      socraticCurrentDimension: null,
      socraticLoading: false,
      socraticError: null,
    });
  },
  closeSocratic: () => {
    const { socraticSession, activeCanvasId } = get();
    if (socraticSession) saveSocraticDraft(activeCanvasId, socraticSession);
    set({
      socraticActive: false,
      socraticSourceNodeId: null,
      socraticSession: null,
      socraticNodes: [],
      socraticCurrentQuestion: "",
      socraticCurrentDimension: null,
      socraticLoading: false,
      socraticError: null,
    });
  },
  setGridVisible: (value) => set({ gridVisible: value }),
  setProfileOpen: (value) => set({ profileOpen: value }),
  setExportOpen: (value) => set({ exportOpen: value }),
  saveCurrentCanvas: async () => {
    const state = get();
    if (!isAuthenticated()) return;
    // Skip if canvas ID is local (not a backend UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(state.activeCanvasId)) return;
    const snapshot = toCanvasStateSnapshot(state);
    const upserts = snapshot.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      title: node.title,
      body: node.body ?? "",
    }));
    try {
      await api.saveSnapshot(state.activeCanvasId, snapshot);
      await api.syncNodes(state.activeCanvasId, upserts, [], true);
      set({ saveState: "Saved" });
    } catch {
      set({ saveState: "Error" });
    }
  },
  setActiveCanvasId: async (canvasId) => {
    const state = get();
    if (canvasId === state.activeCanvasId) return;

    // Record history for back navigation
    const history = [...state.canvasHistory, state.activeCanvasId];

    // Save current canvas state
    const currentSeed = toCanvasStateSnapshot(state);

    const savedCanvases = { ...state.canvases, [state.activeCanvasId]: currentSeed };
    let target = savedCanvases[canvasId];

    // Try loading from backend if not in local map
    if (!target && isAuthenticated()) {
      try {
        const row = await api.getCanvas(canvasId);
        if (row?.snapshot) {
          const snap = row.snapshot;
          target = {
            selectedNodeId: snap.nodes?.[0]?.id,
            nodes: snap.nodes ?? [],
            edges: snap.edges ?? [],
            timeline: [],
            canvasName: row.title ?? "Untitled Canvas",
            guideMode: snap.guideMode === true,
            groups: normalizeGroups(snap.groups),
            concepts: Array.isArray(snap.concepts) ? snap.concepts : [],
          };
          savedCanvases[canvasId] = target;
        }
      } catch { /* canvas not found on backend */ }
    }

    if (!target) return;

    undoStack.length = 0;
    redoStack.length = 0;
    set({
      activeCanvasId: canvasId,
      canvases: savedCanvases,
      canvasHistory: history,
      nodes: target.nodes.map(buildNode),
      edges: target.edges.map((e) => makeEdge(e)),
      timeline: target.timeline,
      groups: target.groups ?? [],
      concepts: target.concepts ?? [],
      conceptPendingIds: [],
      conceptErrors: {},
      conceptSourceNodeId: null,
      brokenInputNodeIds: [],
      selectedNodeId: target.selectedNodeId,
      selectedNodeIds: [],
      mentionPicker: null,
      mentionPicking: null,
      canvasName: target.canvasName ?? "Untitled Canvas",
      guideMode: target.guideMode ?? false,
      runCount: 0,
      pendingTimers: [],
      canUndo: false,
      canRedo: false,
      search: "",
    });
  },
  resetForAuthChange: () => {
    undoStack.length = 0;
    redoStack.length = 0;
    const seed = initialCanvas;
    set({
      nodes: seed.nodes.map(buildNode),
      edges: seed.edges.map((edge) => buildEdge(edge, get().edgeStyle)),
      timeline: seed.timeline,
      groups: [],
      concepts: [],
      conceptPendingIds: [],
      conceptErrors: {},
      conceptSourceNodeId: null,
      brokenInputNodeIds: [],
      activeCanvasId: "canvas-1",
      canvases: { "canvas-1": seed },
      canvasHistory: [],
      selectedNodeId: seed.selectedNodeId,
      selectedNodeIds: [],
      mentionPicker: null,
      mentionPicking: null,
      canvasName: seed.canvasName ?? "Untitled Canvas",
      guideMode: seed.guideMode ?? false,
      runCount: 0,
      pendingTimers: [],
      abortControllers: new Map(),
      canUndo: false,
      canRedo: false,
      userName: "",
      userEmail: "",
      saveState: "Saved",
    });
  },
  createNewCanvas: async () => {
    const state = get();

    // Save current canvas
    const currentSeed = toCanvasStateSnapshot(state);

    // 新画布默认名去重：否则多张 “Untitled Canvas” 在左栏完全分不清。
    let canvasTitle = "Untitled Canvas";
    const usedNames = new Set(
      Object.values(state.canvases)
        .map((canvas) => (canvas.canvasName ?? "").trim())
        .filter(Boolean),
    );
    if (isAuthenticated()) {
      try {
        const rows = await api.listCanvases();
        rows.forEach((row) => {
          const title = (row.title ?? "").trim();
          if (title) usedNames.add(title);
        });
      } catch {
        /* 列表取不到时仍按本地名单去重 */
      }
    }
    let suffix = 2;
    while (usedNames.has(canvasTitle)) {
      canvasTitle = `Untitled Canvas ${suffix}`;
      suffix += 1;
    }

    let newId = `canvas-${Date.now()}`;
    if (isAuthenticated()) {
      try {
        const row = await api.createCanvas(canvasTitle);
        newId = row.id;
      } catch (err) {
        // 云端创建失败（常见是配额 403）时必须停下来：继续生成本地画布会伪装成“已保存”，刷新后内容丢失。
        const message = err instanceof Error ? err.message : "";
        const limitReached = /limit/i.test(message);
        toast.error(t(limitReached ? "canvasLimitReached" : "canvasCreateFailed", state.language), {
          description: t(limitReached ? "canvasLimitHint" : "canvasCreateFailedHint", state.language),
        });
        return;
      }
    }

    const newCanvas: CanvasState = {
      selectedNodeId: "",
      nodes: [],
      edges: [],
      timeline: [],
      canvasName: canvasTitle,
      guideMode: false,
      groups: [],
      concepts: [],
    };

    set({
      activeCanvasId: newId,
      canvases: { ...state.canvases, [state.activeCanvasId]: currentSeed, [newId]: newCanvas },
      nodes: [],
      edges: [],
      timeline: [],
      groups: [],
      concepts: [],
      conceptPendingIds: [],
      conceptErrors: {},
      conceptSourceNodeId: null,
      brokenInputNodeIds: [],
      selectedNodeId: "",
      selectedNodeIds: [],
      canvasName: canvasTitle,
      guideMode: false,
      runCount: 0,
      pendingTimers: [],
      search: "",
    });
  },
  deleteCanvas: async (canvasId: string) => {
    const state = get();
    const remaining = { ...state.canvases };
    delete remaining[canvasId];

    // Try deleting on backend
    if (isAuthenticated() && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(canvasId)) {
      try { await api.deleteCanvas(canvasId); } catch { /* proceed with local delete */ }
    }

    // If deleting active canvas, switch to another
    if (canvasId === state.activeCanvasId) {
      const nextId = Object.keys(remaining)[0];
      if (nextId) {
        const target = remaining[nextId];
        set({
          activeCanvasId: nextId,
          canvases: remaining,
          nodes: target ? target.nodes.map(buildNode) : [],
          edges: target ? target.edges.map((e: CanvasEdgeSeed) => makeEdge(e)) : [],
          canvasName: target?.canvasName ?? "Untitled Canvas",
          guideMode: target?.guideMode ?? false,
          groups: target?.groups ?? [],
          concepts: target?.concepts ?? [],
          conceptPendingIds: [],
          conceptErrors: {},
          conceptSourceNodeId: null,
          selectedNodeId: "",
          selectedNodeIds: [],
        });
      }
    } else {
      set({ canvases: remaining });
    }
  },
  goBackCanvas: () => {
    const history = [...get().canvasHistory];
    if (history.length === 0) return;
    const prevId = history.pop()!;
    const state = get();
    if (!state.canvases[prevId]) return;

    const target = state.canvases[prevId];
    set({
      activeCanvasId: prevId,
      canvasHistory: history,
      nodes: target.nodes.map(buildNode),
      edges: target.edges.map((e: CanvasEdgeSeed) => makeEdge(e)),
      timeline: target.timeline,
      selectedNodeId: target.selectedNodeId,
      selectedNodeIds: [],
      mentionPicker: null,
      mentionPicking: null,
      canvasName: target.canvasName ?? "Untitled Canvas",
      guideMode: target.guideMode ?? false,
      runCount: 0,
    });
  },
  setPanelCollapsed: (value) => set({ panelCollapsed: value }),
  setMobileMenuOpen: (value) => set({ mobileMenuOpen: value }),
  togglePanel: () => set((state) => ({ panelCollapsed: !state.panelCollapsed })),
  setPanelTab: (tab) => set({ panelTab: tab }),
  setCanvasDensity: (value) => set({ canvasDensity: value }),
  setDefaultModel: (value) => set({ defaultModel: value }),
  setApiKey: (value) => {
    localStorage.removeItem("godeeper-api-verified");
    set((state) => ({
      apiKey: value,
      apiTestStatus: "idle",
      apiTestError: "",
      validatedModels: state.validatedModels.filter((m) => m !== state.modelName),
    }));
  },
  setBaseUrl: (value) => {
    localStorage.removeItem("godeeper-api-verified");
    set((state) => ({
      baseUrl: value,
      apiTestStatus: "idle",
      apiTestError: "",
      validatedModels: state.validatedModels.filter((m) => m !== state.modelName),
    }));
  },
  setModelName: (value) => {
    localStorage.removeItem("godeeper-api-verified");
    set((state) => ({
      modelName: value,
      apiTestStatus: "idle",
      apiTestError: "",
      validatedModels: state.validatedModels.filter((m) => m !== value),
    }));
  },
  testAndSaveApi: () => {
    const { baseUrl, apiKey, modelName } = get();
    if (!baseUrl || !apiKey || !modelName) {
      set({ apiTestStatus: "error", apiTestError: "All fields are required" });
      return;
    }
    set({ apiTestStatus: "testing" });
    testConnection(baseUrl, apiKey, modelName)
      .then(async () => {
        if (isAuthenticated()) {
          await api.updateApiKey({ apiKey, provider: "custom", baseUrl, modelName });
        }
        const { validatedModels } = get();
        const updated = validatedModels.includes(modelName)
          ? validatedModels
          : [...validatedModels, modelName];
        // 只有验证成功后才把配置落盘，避免失败配置在下次打开时被当成已连接。
        localStorage.setItem("godeeper-api-key", apiKey);
        localStorage.setItem("godeeper-base-url", baseUrl);
        localStorage.setItem("godeeper-model-name", modelName);
        localStorage.setItem("godeeper-api-verified", JSON.stringify({ baseUrl, modelName }));
        set({
          apiTestStatus: "success",
          apiTestError: "",
          validatedModels: updated,
          defaultModel: get().defaultModel || modelName,
        });
      })
      .catch((err) => {
        set({
          apiTestStatus: "error",
          apiTestError: err instanceof Error ? err.message : "Connection failed",
        });
      });
  },
  clearApiConfig: (modelId) => {
    localStorage.removeItem("godeeper-api-verified");
    set((state) => ({
      validatedModels: state.validatedModels.filter((m) => m !== modelId),
      defaultModel: state.defaultModel === modelId ? "" : state.defaultModel,
    }));
  },
  restoreCanvas: (file) => {
    pushHistory(get().nodes, get().edges);
    const nodes = file.nodes.map(buildNode);
    const edges = file.edges.map((edge) => makeEdge(edge));
    set({
      nodes,
      edges,
      timeline: file.timeline,
      canvasName: file.canvasName,
      guideMode: file.guideMode ?? false,
      groups: normalizeGroups(file.groups),
      concepts: Array.isArray(file.concepts) ? file.concepts : [],
      conceptPendingIds: [],
      conceptErrors: {},
      conceptSourceNodeId: null,
      brokenInputNodeIds: [],
      selectedNodeId: nodes[0]?.id ?? "",
      selectedNodeIds: [],
      saveState: "Unsaved",
      runCount: 0,
      canUndo: undoStack.length > 0,
      canRedo: false,
    });
    const restored = get();
    set({ canvases: { ...restored.canvases, [restored.activeCanvasId]: toCanvasStateSnapshot(restored) } });
  },
  addLinkNodeAt: (input, x, y) => {
    pushHistory(get().nodes, get().edges);
    const language = get().language;
    const id = `n-link-${Date.now()}`;
    const node = buildNode({
      id,
      kind: "link",
      title: input.title,
      body: input.body ?? "",
      x,
      y,
      width: WIDTH_BY_KIND.link,
      metaLeft: input.sourceLabel ?? t("linkNodeKind", language),
      metaRight: metaString("queued", language),
      sourceLabel: input.sourceLabel ?? input.url ?? input.title,
      previewLabel: input.previewLabel ?? t("notAnalyzed", language),
      url: input.url,
      // 空数组表示「已创建但尚未解析」，避免卡片一直显示分析中
      keyPoints: [],
    });
    set((state) => ({
      nodes: [...state.nodes, node],
      selectedNodeId: id,
      selectedNodeIds: [id],
      saveState: "Saved",
    }));
    return id;
  },
  addImageNodeAt: (input, x, y) => {
    pushHistory(get().nodes, get().edges);
    const language = get().language;
    const width = WIDTH_BY_KIND.image ?? BASE_NODE_WIDTH;
    const estimatedHeight = NODE_HEIGHT_BY_KIND.image ?? 280;
    const nodeX = x - width / 2;
    const nodeY = findNonOverlappingY(get().nodes, nodeX, y - estimatedHeight / 2, width, estimatedHeight);
    const id = `n-image-${Date.now()}`;
    const node = buildNode({
      id,
      kind: "image",
      title: input.title,
      body: "",
      width,
      x: nodeX,
      y: nodeY,
      thumbnailUrl: input.imageUrl,
      metaLeft: t("imageNodeKind", language),
      metaRight: "",
    });
    set((state) => ({
      nodes: [...state.nodes, node],
      selectedNodeId: id,
      selectedNodeIds: [id],
      saveState: "Saved",
    }));
    return id;
  },
  importDocumentAt: async (file, x, y) => {
    const language = get().language;
    const lowerName = file.name.toLowerCase();
    const textLike =
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".markdown") ||
      file.type.startsWith("text/");

    let textBody = "";
    if (textLike) {
      try {
        textBody = (await file.text()).slice(0, 4000);
      } catch {
        /* 读取失败时保留文件名，不伪造正文 */
      }
    }

    const nodeId = get().addLinkNodeAt(
      {
        title: file.name,
        body: textBody,
        sourceLabel: file.name,
        previewLabel: textBody ? t("docTextLoaded", language) : t("notAnalyzed", language),
      },
      x,
      y,
    );

    if (!isAuthenticated()) {
      if (!textBody) {
        get().updateNodeData(nodeId, {
          body: t("docSignInHint", language),
          previewLabel: t("notAnalyzed", language),
        });
      }
      return;
    }

    try {
      const result = await importAdapter.importFile(file, 3);
      set((state) => ({
        nodes: applyDecomposeResult(state.nodes, nodeId, result, language),
        saveState: "Saved",
      }));
    } catch (err) {
      get().updateNodeData(nodeId, {
        previewLabel: t("docParseFailed", language),
        body: textBody || `${t("docParseFailed", language)}: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      toast.error(t("docParseFailed", language), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  },
  importTextAt: async (text, x, y) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const language = get().language;
    const title = trimmed.split("\n")[0].slice(0, 80).trim() || t("pastedText", language);
    const width = WIDTH_BY_KIND.text ?? BASE_NODE_WIDTH;
    const desiredY = y - NODE_HEIGHT_BY_KIND.text / 2;
    const nodeX = x - width / 2;
    const nodeY = findNonOverlappingY(
      get().nodes,
      nodeX,
      desiredY,
      width,
      NODE_HEIGHT_BY_KIND.text,
    );
    const id = `n-text-paste-${Date.now()}`;

    pushHistory(get().nodes, get().edges);
    const node = buildNode({
      id,
      kind: "text",
      title,
      body: trimmed.slice(0, 4000),
      width,
      x: nodeX,
      y: nodeY,
      metaLeft: t("pastedText", language),
      metaRight: "",
    });
    set((state) => ({
      nodes: [...state.nodes, node],
      selectedNodeId: id,
      selectedNodeIds: [id],
      saveState: "Saved",
    }));
  },
  importUrl: (url: string, x: number, y: number) => {
    pushHistory(get().nodes, get().edges);
    const language = get().language;
    const nodeId = `n-link-${Date.now()}`;
    const node = buildNode({
      id: nodeId,
      kind: "link",
      title: url,
      body: "",
      x,
      y,
      width: WIDTH_BY_KIND.link,
      metaLeft: "URL",
      metaRight: metaString("queued", language),
      sourceLabel: url,
    });

    set((state) => ({
      nodes: [...state.nodes, node],
      selectedNodeId: nodeId,
      selectedNodeIds: [nodeId],
      saveState: "Importing",
    }));

    const { baseUrl: apiBaseUrl, apiKey, modelName } = get();
    if (!isAuthenticated() || !apiBaseUrl || !apiKey || !modelName) {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  title: url,
                  body: t("urlAnalysisUnavailable", language),
                  previewLabel: t("notAnalyzed", language),
                  keyPoints: [],
                },
              }
            : n
        ),
        saveState: "Saved",
      }));
      return;
    }

    const controller = new AbortController();
    const controllers = new Map(get().abortControllers);
    controllers.set(nodeId, controller);
    set({ abortControllers: controllers });

    analyzeUrl(apiBaseUrl, apiKey, modelName, url, controller.signal, get().language, get().jinaApiKey)
      .then((analysis) => {
        set((state) => {
          const updated = new Map(state.abortControllers);
          updated.delete(nodeId);
          return {
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      title: analysis.title,
                      body: analysis.summary,
                      summary: analysis.summary,
                      keyPoints: analysis.keyPoints,
                      url,
                      previewLabel: t("analyzed", language),
                      metaRight: `${analysis.keyPoints.length} ${t("keyPoints", language)}`,
                    },
                  }
                : n
            ),
            saveState: "Saved",
            abortControllers: updated,
          };
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        set((state) => {
          const updated = new Map(state.abortControllers);
          updated.delete(nodeId);
          return {
            nodes: state.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      title: url,
                      body: `${t("docParseFailed", language)}: ${err instanceof Error ? err.message : "Unknown error"}`,
                      previewLabel: t("docParseFailed", language),
                      keyPoints: [],
                    },
                  }
                : n
            ),
            saveState: "Saved",
            abortControllers: updated,
          };
        });
      });
  },
  expandKeyPoint: (nodeId: string, pointIndex: number) => {
    pushHistory(get().nodes, get().edges);
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const keyPoints = node.data.keyPoints;
    if (!keyPoints || !keyPoints[pointIndex]) return;

    const point = keyPoints[pointIndex];
    if (point.expanded) return;

    const textNodeId = `n-text-${Date.now()}`;
    const textNode = buildNode({
      id: textNodeId,
      kind: "text",
      title: point.text,
      body: point.body,
      x: node.position.x + 560,
      y: node.position.y + pointIndex * 280,
      metaLeft: "Key insight",
      metaRight: metaString("generatedNow", get().language),
    });

    const edge = buildEdge({
      id: `e-expand-${nodeId}-${pointIndex}`,
      source: nodeId,
      sourceHandle: `kp-${pointIndex}`,
      target: textNodeId,
      active: true,
    });

    const updatedKeyPoints = [...keyPoints];
    updatedKeyPoints[pointIndex] = { ...point, expanded: true };

    const updatedNodes = [...get().nodes.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, keyPoints: updatedKeyPoints } } : n
    ), textNode];
    const updatedEdges = [...get().edges, edge];

    const density = get().canvasDensity;
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
      rankdir: "LR",
      nodesep: density === "comfortable" ? 180 : DAGRE_CONFIG.nodesep,
      ranksep: density === "comfortable" ? 300 : DAGRE_CONFIG.ranksep,
      marginx: 100,
      marginy: 100,
    });
    updatedNodes.forEach((n) => {
      const w = n.data.width ?? BASE_NODE_WIDTH;
      const h = NODE_HEIGHT_BY_KIND[n.data.kind] ?? 200;
      dagreGraph.setNode(n.id, { width: w, height: h });
    });
    updatedEdges.forEach((e) => dagreGraph.setEdge(e.source, e.target));
    dagre.layout(dagreGraph);

    // 自动布局仍全量排，但锁定节点的坐标必须原样保留；它们同时作为碰撞消解的 fixed 节点。
    const lockedPositions = new Map(
      updatedNodes
        .filter((n) => n.data.locked === true)
        .map((n) => [n.id, { ...n.position }]),
    );
    const candidates = updatedNodes.map((n) => {
      const locked = lockedPositions.get(n.id);
      if (locked) return { ...n, position: locked };
      const dn = dagreGraph.node(n.id);
      if (!dn) return n;
      const w = n.data.width ?? BASE_NODE_WIDTH;
      const h = NODE_HEIGHT_BY_KIND[n.data.kind] ?? 200;
      return { ...n, position: { x: dn.x - w / 2, y: dn.y - h / 2 } };
    });
    const layoutedNodes = resolveOverlaps(
      candidates,
      new Set(),
      COLLISION_MAX_ITERATIONS,
      new Set(lockedPositions.keys()),
    );

    set({
      nodes: layoutedNodes,
      edges: updatedEdges,
      selectedNodeId: textNodeId,
      selectedNodeIds: [textNodeId],
      saveState: "Saved",
      isLayoutAnimating: true,
    });
    setTimeout(() => set({ isLayoutAnimating: false }), 350);
  },
  runTask: (taskNodeId?: string) => {
    pushHistory(get().nodes, get().edges);
    if (!taskNodeId) return;
    const taskNode = get().nodes.find((node) => node.id === taskNodeId);
    if (!taskNode || taskNode.data.taskStatus === "running") {
      return;
    }

    const taskType = detectTaskType(`${taskNode.data.title}\n${formatMentionsForText(taskNode.data.body)}`);
    get().updateNodeData(taskNodeId, { taskType });

    set((state) => ({
      nodes: updateNodeStatus(state.nodes, taskNodeId, "running", statusLabel("running", get().language), { taskError: null }),
      saveState: "Streaming",
    }));

    const language = get().language;
    const toastId = `task-run-${taskNodeId}`;
    toast.loading(t("running", language), { id: toastId });

    const { baseUrl, apiKey, modelName } = get();
    const activeModel = modelName || taskNode?.data.metaLeft || "";
    const hasBackend = Boolean(process.env.NEXT_PUBLIC_API_URL);
    // 后端存在时必须登录：未登录不再发送无令牌请求，也不用假数据冒充真实结果。
    if (hasBackend && !isAuthenticated()) {
      const message = t("loginExpired", language);
      set((state) => ({
        nodes: updateNodeStatus(state.nodes, taskNodeId, "complete", statusLabel("runTask", language), { taskError: message }),
        saveState: "Error",
      }));
      toast.error(t("taskFailed", language), { id: toastId, description: message });
      return;
    }
    // 登录用户走后端：BYOK 或服务端托管 Key 都由后端决定；无后端时保留本地 mock 演示。
    const hasRealApi = hasBackend;

    if (hasRealApi) {
      const controller = new AbortController();
      const controllers = new Map(get().abortControllers);
      controllers.set(taskNodeId, controller);
      set({ abortControllers: controllers });

      const prompt = taskNode?.data.body
        ? formatMentionsForText(taskNode.data.body)
        : "Analyze this topic";
      const recipe = getContextRecipe(taskType);
      const resolved = resolveTaskContext(get().nodes, get().edges, taskNodeId, {
        ...recipe,
        pinnedIds: taskNode?.data.contextPinnedIds,
        excludedIds: taskNode?.data.contextExcludedIds,
        selectedIds: taskNode?.data.contextSelectionIds,
      });
      // 只有当前节点时回退到旧 chips，兼容 Phase 1 之前创建、没有连线的任务。
      const context =
        resolved.entries.length > 1
          ? contextEntriesToPrompt(resolved.entries)
          : taskNode?.data.chips ?? [];
      const contextText = typeof context === "string" ? context : context.join("\n\n");

      const sourceCatalog = taskNode.data.sourceCatalogId
        ? get().nodes.find((node) => node.id === taskNode.data.sourceCatalogId)
        : undefined;
      const sourceIsDirections = sourceCatalog?.data.catalog?.mode === "directions";
      const isGuideChild =
        taskNode.data.sourceCatalogKind === "guide"
        || (
          taskNode.data.sourceCatalogKind !== "result"
          && Boolean(taskNode.data.sourceCatalogId)
          && (
            sourceIsDirections
            || Boolean(taskNode.data.catalogBackfill)
            || (!sourceCatalog?.data.catalog && get().guideMode)
          )
        );
      const hasResultChildren = get().edges.some((edge) => {
        if (edge.source !== taskNodeId) return false;
        return get().nodes.find((node) => node.id === edge.target)?.data.kind === "result";
      });
      // A7：只对用户创建、尚无结果子节点、且还没有目录的任务生成规划；
      // 已有目录时由 T05 的显式「重新规划」入口处理，避免覆盖已物化的方向 id。
      const useGuidePlan =
        hasCapability(getUser(), "ai.guided")
        && get().guideMode
        && !isGuideChild
        && taskNode.data.author !== "ai"
        && taskNode.data.kind !== "inspire"
        && !hasResultChildren
        && !taskNode.data.catalog;

      // JEV 问题深度判断：与主回答并行，失败静默，不阻塞任务。
      const isUserQuestion =
        taskNode.data.author !== "ai" && taskNode.data.kind !== "inspire";
      if (isUserQuestion) {
        const qualityHash = buildQualityHash(prompt, contextText);
        if (taskNode.data.qualityHash !== qualityHash) {
          const requestId = (qualityRequestSeq.get(taskNodeId) ?? 0) + 1;
          qualityRequestSeq.set(taskNodeId, requestId);

          api
            .evaluateQuestionQuality(prompt, contextText, get().language)
            .then((verdict) => {
              if (qualityRequestSeq.get(taskNodeId) !== requestId) return;
              if (verdict.status !== "qualified" && verdict.status !== "normal") return;
              const current = get().nodes.find((node) => node.id === taskNodeId);
              // 用户已经改了问题：丢弃这次判断
              if (!current || current.data.body !== taskNode.data.body) return;
              // 已经变成引导目录：规划不触发星星，避免判断晚到后重新写回
              if (current.data.catalog?.mode === "directions") return;
              if (current.data.qualityHash === qualityHash) return;
              get().updateNodeData(taskNodeId, {
                qualityStatus: verdict.status,
                qualityConfidence: verdict.confidence,
                qualityHash,
                qualityModel: verdict.model,
                qualityCheckedAt: new Date().toISOString(),
              });
            })
            .catch(() => {});
        }
      }

      runLLMTask(baseUrl, apiKey, activeModel, prompt, context, controller.signal, get().language, taskType, {
        mode: useGuidePlan,
        child: isGuideChild,
      })
        .then((payload) => {
          // 用户已点「停止」：请求可能已发出，但结果绝不能再写回画布。
          if (controller.signal.aborted) return;
          const { results, title, mode, summary, items, backfill } = payload;
          const taskWidth = taskNode?.data.width ?? BASE_NODE_WIDTH;
          const baseX = taskNode.position.x + taskWidth + 60;
          const baseY = taskNode.position.y;

          // 新任务初始没有标题；首次运行后由 AI 用用户问题提炼标题。
          const currentNode = get().nodes.find((node) => node.id === taskNodeId);
          if (title && currentNode && !currentNode.data.title.trim()) {
            get().updateNodeData(taskNodeId, { title: title.trim().slice(0, 60) });
          }

          if (mode === "plan" && summary && items && items.length >= 3) {
            // 锚点变成引导目录：只写 catalog，不覆盖用户原问题（body）。
            const catalogItems: CatalogItem[] = items.map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              ...(item.why ? { why: item.why } : {}),
              ...(item.dependsOn?.length ? { dependsOn: item.dependsOn } : {}),
              ...(item.role ? { role: item.role } : {}),
              ...(item.recommended ? { recommended: true } : {}),
              ...(item.source ? { source: item.source } : {}),
            }));

            get().updateNodeData(taskNodeId, {
              catalog: { mode: "directions", items: catalogItems, collapsed: false, summary },
              catalogSourceHash: buildQualityHash(prompt, contextText),
              catalogStale: false,
              // 规划不触发星星；清掉可能已经写入的深度判断
              qualityStatus: undefined,
              qualityConfidence: undefined,
              qualityHash: undefined,
              qualityModel: undefined,
              qualityCheckedAt: undefined,
            });

            set((state) => {
              const updated = new Map(state.abortControllers);
              updated.delete(taskNodeId);
              return {
                nodes: updateNodeStatus(state.nodes, taskNodeId, "complete", statusLabel("runAgain", language)),
                saveState: "Saved",
                runCount: state.runCount + 1,
                abortControllers: updated,
              };
            });
            toast.success(t("taskCompleted", language), {
              id: toastId,
              description: `${catalogItems.length} ${t("guideDirections", language)}`,
            });
            get().focusNode(taskNodeId);
            return;
          }

          let lastResultId = "";
          if (results.length >= 2) {
            // 多条答案收进一张目录卡，避免在画布右侧铺开一大片
            const catalogId = uniqueResultId(`${taskNodeId}-catalog`);
            const items: CatalogItem[] = results.map((result, index) => ({
              id: `${catalogId}-item-${index}`,
              title: result.title,
              body: result.body,
            }));
            const catalogHeight = estimateCatalogHeight(items);
            const slot = findFreeSlot(
              nodePlacementRect(taskNode),
              RESULT_CATALOG_WIDTH,
              catalogHeight,
              visiblePlacementRects(get().nodes),
              { preferred: "right", gap: 60 },
            );
            const catalogNode = buildNode({
              id: catalogId,
              kind: "result",
              title: title?.trim() || taskNode.data.title || results[0]?.title || t("resultCatalogTitle", language),
              body: buildCatalogBody(items),
              x: slot.x,
              y: slot.y,
              width: RESULT_CATALOG_WIDTH,
              metaLeft: activeModel,
              metaRight: metaString("parallelBranch", language),
              catalog: { mode: "answers", items, collapsed: false },
            });
            const catalogEdge = makeEdge({
              id: `${catalogId}-edge`,
              source: taskNodeId,
              target: catalogId,
              active: true,
            });

            set((state) => ({
              nodes: [...state.nodes, catalogNode],
              edges: [...state.edges, catalogEdge],
              selectedNodeId: catalogId,
              timeline: appendTimelineItem(state.timeline, taskRerun(catalogId, language)),
            }));
            lastResultId = catalogId;
          } else {
            // 单条结果仍用普通卡片，避免为了统一而统一
            const columns = 1;
            results.forEach((result, index) => {
              const resultId = uniqueResultId(`${taskNodeId}-llm`);
              const col = index % columns;
              const row = Math.floor(index / columns);
              const resultX = baseX + col * (BASE_NODE_WIDTH + 48);
              const resDesiredY = baseY + row * POSITION_OFFSETS.runResult.yStep;
              const resY = findNonOverlappingY(get().nodes, resultX, resDesiredY, BASE_NODE_WIDTH, NODE_HEIGHT_BY_KIND.result);
              const resultNode = buildNode({
                id: resultId,
                kind: "result",
                title: result.title,
                body: result.body,
                x: resultX,
                y: resY,
                metaLeft: activeModel,
                metaRight: metaString("parallelBranch", language),
              });

              const resultEdge = makeEdge({
                id: `${resultId}-edge`,
                source: taskNodeId,
                target: resultId,
                active: true,
              });

              set((state) => ({
                nodes: [...state.nodes, resultNode],
                edges: [...state.edges, resultEdge],
                selectedNodeId: resultId,
                timeline: appendTimelineItem(state.timeline, taskRerun(resultId, language)),
              }));
              lastResultId = resultId;
            });
          }

          set((state) => {
            const updated = new Map(state.abortControllers);
            updated.delete(taskNodeId);
            return {
              nodes: updateNodeStatus(state.nodes, taskNodeId, "complete", statusLabel("runAgain", language)),
              saveState: "Saved",
              runCount: state.runCount + 1,
              abortControllers: updated,
            };
          });
          if (isGuideChild && backfill) {
            get().updateNodeData(taskNodeId, { catalogBackfill: backfill });
          }
          toast.success(t("taskCompleted", language), {
            id: toastId,
            description: `${results.length} ${t("nodes", language)}`,
          });
          if (lastResultId) get().focusNode(lastResultId);
        })
        .catch((err) => {
          if ((err instanceof DOMException && err.name === "AbortError") || controller.signal.aborted) {
            set((state) => {
              const updated = new Map(state.abortControllers);
              updated.delete(taskNodeId);
              return { abortControllers: updated };
            });
            return;
          }
          const message = aiErrorMessage(
            err instanceof Error ? err.message : "Failed",
            language,
          );
          set((state) => {
            const updated = new Map(state.abortControllers);
            updated.delete(taskNodeId);
            return {
              nodes: updateNodeStatus(state.nodes, taskNodeId, "complete", statusLabel("runTask", language), { taskError: message }),
              saveState: "Error",
              abortControllers: updated,
            };
          });
          toast.error(t("taskFailed", language), { id: toastId, description: message });
        });
      return;
    }

    // Fallback: mock behavior
    const timers: ReturnType<typeof setTimeout>[] = [];

    const taskWidth = taskNode?.data.width ?? BASE_NODE_WIDTH;
    const mockBaseX = taskNode.position.x + taskWidth + 60;
    const mockBaseY = taskNode.position.y;

    GENERATED_BRANCHES.forEach((branch, index) => {
      const timer = setTimeout(() => {
        const desiredY = mockBaseY + index * POSITION_OFFSETS.runResult.yStep;
        const y = findNonOverlappingY(get().nodes, mockBaseX, desiredY, BASE_NODE_WIDTH, NODE_HEIGHT_BY_KIND.result);
        const nodeId = uniqueResultId(`${taskNodeId}-generated`);
        const resultNode = buildNode({
          id: nodeId,
          kind: "result",
          title: branch.title,
          body: branch.body,
          x: mockBaseX,
          y,
          metaLeft: metaString("generatedNow", get().language),
          metaRight: metaString("parallelBranch", get().language),
        });

        const resultEdge = makeEdge({
          id: `${nodeId}-edge`,
          source: taskNodeId,
          target: nodeId,
          active: true,
        });

        set((state) => ({
          nodes: [...state.nodes, resultNode],
          edges: [...state.edges, resultEdge],
          selectedNodeId: nodeId,
          timeline: appendTimelineItem(state.timeline, taskRerun(nodeId, language)),
        }));
      }, 450 + index * 500);
      timers.push(timer);
    });

    const finishTimer = setTimeout(() => {
      set((state) => ({
        nodes: updateNodeStatus(state.nodes, taskNodeId, "complete", statusLabel("runAgain", language)),
        saveState: "Saved",
        runCount: state.runCount + 1,
        pendingTimers: state.pendingTimers.filter((timer) => !timers.includes(timer)),
      }));
      toast.success(t("taskCompleted", language), {
        id: toastId,
        description: `${GENERATED_BRANCHES.length} ${t("nodes", language)}`,
      });
    }, 1600);
    timers.push(finishTimer);

    set((state) => ({ pendingTimers: [...state.pendingTimers, ...timers] }));
  },
  cancelTask: (taskNodeId: string) => {
    toast.dismiss(`task-run-${taskNodeId}`);
    const timers = get().pendingTimers;
    timers.forEach((t) => clearTimeout(t));
    get().abortControllers.get(taskNodeId)?.abort();
    set((state) => {
      const updated = new Map(state.abortControllers);
      updated.delete(taskNodeId);
      return {
        nodes: updateNodeStatus(state.nodes, taskNodeId, "complete", statusLabel("runAgain", get().language)),
        saveState: "Saved",
        pendingTimers: [],
        abortControllers: updated,
      };
    });
  },
  createTaskFromSelection: () => {
    pushHistory(get().nodes, get().edges);
    const selectedIds = get().selectedNodeIds;
    if (selectedIds.length === 0) return;

    const selectedNodes = get().nodes.filter((n) => selectedIds.includes(n.id));
    const selectionBox = boundingBox(selectedNodes.map(nodePlacementRect));
    const avgX = selectedNodes.reduce((sum, n) => sum + n.position.x, 0) / selectedNodes.length;
    const maxY = Math.max(...selectedNodes.map((n) => n.position.y));

    const taskId = `n-task-${Date.now()}`;
    const taskWidth = WIDTH_BY_KIND.task ?? BASE_NODE_WIDTH;
    const taskHeight = NODE_HEIGHT_BY_KIND.task;
    const anchor = selectionBox ?? {
      x: avgX,
      y: maxY,
      width: BASE_NODE_WIDTH,
      height: NODE_HEIGHT_BY_KIND.text,
    };
    const slot = findFreeSlot(anchor, taskWidth, taskHeight, visiblePlacementRects(get().nodes), {
      preferred: "right",
      gap: 48,
    });
    const taskX = slot.x;
    const taskY = slot.y;
    const taskNode = buildNode({
      id: taskId,
      kind: "task",
      title: "",
      body: "请基于这些选中节点进行联合推理。",
      x: taskX,
      y: taskY,
      width: WIDTH_BY_KIND.task,
      metaLeft: get().defaultModel || get().modelName || "",
      metaRight: statusLabel("runTask", get().language),
      chips: selectedNodes.map((n) => n.data.title.slice(0, 20)),
      taskStatus: "idle",
      taskType: "question",
      author: "user",
      adopted: true,
      // 选中建任务 = 用户显式指定上下文，resolver 会以这组节点覆盖默认祖先链。
      contextSelectionIds: [...selectedIds],
    });

    const taskEdges = selectedIds.map((sourceId, index) => {
      const srcNode = get().nodes.find((n) => n.id === sourceId);
      return makeEdge({
        id: `${taskId}-ctx-${index}`,
        source: sourceId,
        target: taskId,
        sourceHandle: srcNode?.data.kind === "link" ? "main" : undefined,
        active: true,
      });
    });

    set((state) => ({
      nodes: [...state.nodes, taskNode],
      edges: [...state.edges, ...taskEdges],
      selectedNodeId: taskId,
      selectedNodeIds: [taskId],
      timeline: appendTimelineItem(state.timeline, taskFromSelectionTimeline(taskId, selectedIds.length, get().language)),
    }));
  },
  createAiQuestionFromTask: async (taskNodeId) => {
    const { nodes, edges, baseUrl, apiKey, modelName, defaultModel, language } = get();
    const taskNode = nodes.find((n) => n.id === taskNodeId);
    if (!taskNode) return;

    const activeModel = modelName || defaultModel || taskNode.data.metaLeft || "";
    if (!isAuthenticated() && (!baseUrl || !apiKey || !activeModel)) {
      toast.error(t("aiAskQuestionFailed", language), { description: t("noModelsConfigured", language) });
      return;
    }

    const existingQuestions = collectAiQuestionTexts(nodes.map((n) => n.data));
    const path = get().getReasoningPath(taskNodeId);
    const ancestors = path.slice(0, -1).slice(-3).map((n) => ({
      title: n.data.title,
      body: n.data.body,
    }));

    const buildContext = (extra?: string) =>
      buildTaskInquiryContext(taskNode.data, ancestors, existingQuestions, extra);
    const isDuplicate = (question: string) =>
      existingQuestions.some((q) => normalizeQuestionText(q) === normalizeQuestionText(question));

    try {
      let result = await generateInspiration(
        baseUrl,
        apiKey,
        activeModel,
        buildContext(),
        undefined,
        language,
      );

      if (isDuplicate(result.question)) {
        result = await generateInspiration(
          baseUrl,
          apiKey,
          activeModel,
          buildContext("上一次的问题与画布上已有的问题重复了。这次必须提出一个完全不同的新问题。"),
          undefined,
          language,
        );
      }

      if (!result.question.trim() || isDuplicate(result.question)) {
        toast.error(t("aiAskQuestionFailed", language), {
          description: t("aiAskQuestionDuplicate", language),
        });
        return;
      }

      const id = `n-task-ai-${Date.now()}`;
      const width = WIDTH_BY_KIND.task ?? BASE_NODE_WIDTH;
      const newX = taskNode.position.x + POSITION_OFFSETS.sibling.x;
      const newY = findNonOverlappingY(
        nodes,
        newX,
        taskNode.position.y,
        width,
        NODE_HEIGHT_BY_KIND.task,
      );

      const seed = buildAiQuestionSeed({
        id,
        question: result.question,
        reason: result.reason,
        prerequisites: result.prerequisites,
        modelName: activeModel,
        metaRight: statusLabel("runTask", language),
        x: newX,
        y: newY,
        width,
      });

      pushHistory(nodes, edges);
      const newNode = buildNode(seed);
      const edge = makeEdge({
        id: `${taskNodeId}-ai-${id}`,
        source: taskNodeId,
        target: id,
      });

      set((state) => ({
        nodes: [...state.nodes, newNode],
        edges: [...state.edges, edge],
        selectedNodeId: id,
        selectedNodeIds: [id],
        saveState: "Unsaved",
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      toast.error(t("aiAskQuestionFailed", language), {
        description: message ? aiErrorMessage(message, language) : t("unknownError", language),
      });
    }
  },
  requestCritique: async (taskNodeId) => {
    const { nodes, edges, baseUrl, apiKey, modelName, defaultModel, language } = get();
    const taskNode = nodes.find((node) => node.id === taskNodeId);
    if (!taskNode) return;

    const activeModel = modelName || defaultModel || taskNode.data.metaLeft || "";
    if (!isAuthenticated() && (!baseUrl || !apiKey || !activeModel)) {
      toast.error(t("critiqueFailed", language), { description: t("noModelsConfigured", language) });
      return;
    }

    const input = buildCritiqueInput(nodes, edges, taskNodeId);
    if (!input) return;

    // 预览阶段不写画布；只清空旧预览并记录本次目标节点。
    set({
      critiquePreview: { taskId: taskNodeId, findings: [] },
      critiqueLoading: true,
      critiqueError: null,
    });

    try {
      const result = await generateCritique(activeModel, { ...input, locale: language });
      set({
        critiquePreview: { taskId: taskNodeId, findings: result.findings },
        critiqueLoading: false,
        critiqueError: null,
      });
      if (get().panelCollapsed) get().togglePanel();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      toast.error(t("critiqueFailed", language), {
        description: message ? aiErrorMessage(message, language) : t("unknownError", language),
      });
      set({ critiquePreview: null, critiqueLoading: false, critiqueError: message || "unknown" });
    }
  },
  acceptCritiqueFinding: (index) => {
    const preview = get().critiquePreview;
    if (!preview) return;
    const finding = preview.findings[index];
    if (!finding) return;

    const claimNode = get().nodes.find((node) => node.id === preview.taskId);
    if (!claimNode) return;

    const { nodes, edges, language } = get();
    get().pushHistory();

    const id = `n-task-critique-${Date.now()}-${index}`;
    const width = WIDTH_BY_KIND.task ?? BASE_NODE_WIDTH;
    const newX = claimNode.position.x + POSITION_OFFSETS.sibling.x;
    const newY = findNonOverlappingY(nodes, newX, claimNode.position.y, width, NODE_HEIGHT_BY_KIND.task);

    const newNode = buildNode({
      id,
      kind: "task",
      title: finding.title,
      body: finding.body,
      x: newX,
      y: newY,
      width,
      metaLeft: get().modelName || get().defaultModel || claimNode.data.metaLeft,
      metaRight: statusLabel("runTask", language),
      taskStatus: "idle",
      taskType: "critique",
      author: "ai",
      adopted: true,
      adoptedAt: new Date().toISOString(),
      editedByUser: false,
    });
    const edge = makeEdge({
      id: `${preview.taskId}-critique-${id}`,
      source: preview.taskId,
      target: id,
    });

    const remaining = preview.findings.filter((_, i) => i !== index);
    set({
      nodes: [...nodes, newNode],
      edges: [...edges, edge],
      selectedNodeId: id,
      selectedNodeIds: [id],
      saveState: "Unsaved",
      critiquePreview: remaining.length > 0 ? { taskId: preview.taskId, findings: remaining } : null,
    });
  },
  dismissCritique: () => set({ critiquePreview: null, critiqueLoading: false, critiqueError: null }),
  autoLayout: () => {
    pushHistory(get().nodes, get().edges);
    const nodes = get().nodes;
    const edges = get().edges;
    const density = get().canvasDensity;

    const config = {
      ...DAGRE_CONFIG,
      nodesep: density === "comfortable" ? 180 : DAGRE_CONFIG.nodesep,
      ranksep: density === "comfortable" ? 300 : DAGRE_CONFIG.ranksep,
    };

    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph(config);

    nodes.forEach((node) => {
      const width = node.data.width ?? BASE_NODE_WIDTH;
      const height = NODE_HEIGHT_BY_KIND[node.data.kind] ?? 200;
      dagreGraph.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
      const dagreNode = dagreGraph.node(node.id);
      if (!dagreNode) return node;
      const width = node.data.width ?? BASE_NODE_WIDTH;
      const height = NODE_HEIGHT_BY_KIND[node.data.kind] ?? 200;
      return {
        ...node,
        position: {
          x: dagreNode.x - width / 2,
          y: dagreNode.y - height / 2,
        },
      };
    });

    set({
      nodes: layoutedNodes,
      saveState: "Saved",
      isLayoutAnimating: true,
      layoutVersion: get().layoutVersion + 1,
    });
    setTimeout(() => set({ isLayoutAnimating: false }), 350);
  },
  returnToBranchPoint: () => {
    const selectedId = get().selectedNodeId;
    const parentEdge = get().edges.find((e) => e.target === selectedId);
    if (!parentEdge) return;
    const parentId = parentEdge.source;
    set((state) => ({
      selectedNodeId: parentId,
      selectedNodeIds: [parentId],
      // 不只是移动选框：把视口快速定位到父节点
      focusNodeId: parentId,
      nodes: state.nodes.map((n) => ({
        ...n,
        selected: n.id === parentId,
      })),
    }));
    setTimeout(() => set({ focusNodeId: null }), 600);
  },
  deleteSelectedNodes: () => {
    const selectedIds = get().selectedNodeIds;
    if (selectedIds.length === 0) return;
    pushHistory(get().nodes, get().edges);

    set((state) => {
      const nodes = state.nodes.filter((n) => !selectedIds.includes(n.id));
      const edges = state.edges.filter((e) => !selectedIds.includes(e.source) && !selectedIds.includes(e.target));
      // 删除节点后同步清理分组里的失效成员；空组自动消失。
      const groups = pruneGroups(state.groups, new Set(nodes.map((node) => node.id)));
      const brokenInputNodeIds = nextBrokenInputIds({
        edgesBefore: state.edges,
        edgesAfter: edges,
        nodesAfter: nodes,
        existing: state.brokenInputNodeIds,
      });
      return {
        nodes,
        groups,
        edges,
        brokenInputNodeIds,
        selectedNodeId: nodes.find((n) => !selectedIds.includes(n.id))?.id ?? "",
        selectedNodeIds: [],
        saveState: "Saved",
        canUndo: undoStack.length > 0,
        timeline: appendTimelineItem(state.timeline, nodesDeleted(`delete-${Date.now()}`, selectedIds.length, get().language)),
      };
    });
  },
  mergeResultNodes: (nodeIds) => {
    const state = get();
    const unique = new Set(nodeIds);
    const targets = state.nodes
      .filter((node) => unique.has(node.id) && node.data.kind === "result")
      .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
    if (targets.length < 2) return;

    const items: CatalogItem[] = [];
    targets.forEach((node) => {
      if (node.data.catalog?.items.length) {
        node.data.catalog.items.forEach((item, index) => {
          items.push({ ...item, id: `${node.id}-merged-${index}` });
        });
        return;
      }
      const title = node.data.title?.trim() ?? "";
      const body = node.data.body ?? "";
      if (!title && !body.trim()) return;
      items.push({ id: `${node.id}-merged`, title, body });
    });
    if (items.length < 2) return;

    pushHistory(state.nodes, state.edges);

    const removed = new Set(targets.map((node) => node.id));
    const remaining = state.nodes.filter((node) => !removed.has(node.id));
    const catalogId = `result-catalog-${Date.now()}`;
    const x = Math.min(...targets.map((node) => node.position.x));
    const desiredY = Math.min(...targets.map((node) => node.position.y));
    const y = findNonOverlappingY(remaining, x, desiredY, RESULT_CATALOG_WIDTH, estimateCatalogHeight(items));

    const catalogNode = buildNode({
      id: catalogId,
      kind: "result",
      title: t("resultCatalogTitle", state.language),
      body: buildCatalogBody(items),
      x,
      y,
      width: RESULT_CATALOG_WIDTH,
      metaLeft: targets[0]?.data.metaLeft,
      metaRight: metaString("parallelBranch", state.language),
      catalog: { mode: "answers", items, collapsed: false },
    });

    const keptEdges = state.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target));
    const inboundSources = Array.from(new Set(
      state.edges
        .filter((edge) => removed.has(edge.target) && !removed.has(edge.source))
        .map((edge) => edge.source),
    ));
    const mergedEdges = inboundSources.map((source, index) => makeEdge({
      id: `${catalogId}-edge-${index}`,
      source,
      target: catalogId,
      active: true,
    }));

    set({
      nodes: [...remaining, catalogNode],
      edges: [...keptEdges, ...mergedEdges],
      selectedNodeId: catalogId,
      selectedNodeIds: [catalogId],
      timeline: appendTimelineItem(state.timeline, taskRerun(catalogId, state.language)),
    });
  },
  materializeCatalogItem: (catalogId, itemId) => {
    const state = get();
    const catalog = state.nodes.find((node) => node.id === catalogId);
    const item = catalog?.data.catalog?.items.find((entry) => entry.id === itemId);
    if (!catalog || !item) return null;

    const existing = state.nodes.find(
      (node) =>
        node.data.kind === "task"
        && node.data.sourceCatalogId === catalogId
        && (node.data.sourceCatalogItemId === itemId || node.data.sourceResultItemId === itemId),
    );
    if (existing) {
      get().selectNode(existing.id);
      get().focusNode(existing.id);
      return existing.id;
    }

    pushHistory(state.nodes, state.edges);

    const catalogWidth = catalog.data.width ?? RESULT_CATALOG_WIDTH;
    const childCount = state.nodes.filter((node) => node.data.sourceCatalogId === catalogId && node.data.catalogHidden !== true).length;
    const childWidth = WIDTH_BY_KIND.task ?? 380;
    const childHeight = NODE_HEIGHT_BY_KIND.task ?? 360;
    const anchor: PlacementRect = {
      x: catalog.position.x,
      y: catalog.position.y + childCount * (childHeight + 40),
      width: catalogWidth,
      height: childHeight,
    };
    const slot = findFreeSlot(anchor, childWidth, childHeight, visiblePlacementRects(state.nodes), {
      preferred: "right",
      gap: 48,
    });
    const desiredX = slot.x;
    const y = slot.y;

    const childId = `catalog-extend-${catalogId}-${itemId}-${Date.now()}`;
    const title = item.title.trim() || item.body.trim().slice(0, 40) || t("resultItemExtend", state.language);
    const isDirections = catalog.data.catalog?.mode === "directions";
    const childBody = isDirections
      ? item.body
      : `请基于下面这条要点，输出可执行步骤、检查清单和一个具体例子，并说明适用条件与风险：\n\n${item.body}`;

    const childNode = buildNode({
      id: childId,
      kind: "task",
      title,
      body: childBody,
      x: desiredX,
      y,
      author: "ai",
      metaLeft: catalog.data.metaLeft,
      metaRight: t("resultItemFromCatalog", state.language),
      sourceCatalogId: catalogId,
      sourceCatalogKind: isDirections ? "guide" : "result",
      sourceCatalogItemId: itemId,
      // 只带这一条答案：把目录卡排除出上下文，避免其他答案串味
      contextExcludedIds: [catalogId],
    });
    const childEdge = makeEdge({
      id: `${childId}-edge`,
      source: catalogId,
      target: childId,
      active: true,
    });

    set({
      nodes: [...state.nodes, childNode],
      edges: [...state.edges, childEdge],
      selectedNodeId: childId,
      selectedNodeIds: [childId],
      saveState: "Saved",
    });
    get().focusNode(childId);
    return childId;
  },
  toggleCatalogChild: (catalogId, itemId) => {
    const state = get();
    const child = state.nodes.find(
      (node) =>
        node.data.kind === "task"
        && node.data.sourceCatalogId === catalogId
        && (node.data.sourceCatalogItemId === itemId || node.data.sourceResultItemId === itemId),
    );
    if (!child) {
      get().materializeCatalogItem(catalogId, itemId);
      return;
    }

    get().pushHistory();
    const nextHidden = child.data.catalogHidden !== true;
    set((current) => ({
      nodes: current.nodes.map((node) =>
        node.id === child.id
          ? { ...node, hidden: nextHidden, data: { ...node.data, catalogHidden: nextHidden } }
          : node,
      ),
      edges: current.edges.map((edge) =>
        edge.source === catalogId && edge.target === child.id
          ? { ...edge, hidden: nextHidden }
          : edge,
      ),
      saveState: "Saved",
    }));

    if (!nextHidden) {
      get().selectNode(child.id);
      get().focusNode(child.id);
    }
  },
  duplicateNode: (nodeId: string) => {
    pushHistory(get().nodes, get().edges);
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const newId = `${nodeId}-copy-${Date.now()}`;
    const newNode: GoDeeperFlowNode = {
      ...node,
      id: newId,
      position: {
        x: node.position.x + POSITION_OFFSETS.duplicate.x,
        y: node.position.y + POSITION_OFFSETS.duplicate.y,
      },
      data: {
        ...node.data,
        locked: false,
        metaLeft: metaString("duplicated", get().language),
        // 星星属于原问题的判断结果，复制节点不继承
        qualityStatus: undefined,
        qualityConfidence: undefined,
        qualityHash: undefined,
        qualityModel: undefined,
        qualityCheckedAt: undefined,
      },
      draggable: true,
      selected: false,
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
      selectedNodeId: newId,
      selectedNodeIds: [newId],
      saveState: "Saved",
      timeline: appendTimelineItem(state.timeline, nodeDuplicated(newId, node.data.title.slice(0, 30), get().language)),
    }));
  },
  updateNodeData: (nodeId: string, data: Partial<GoDeeperNodeData>) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              draggable: data.locked === undefined ? node.draggable : !data.locked,
              data: {
                ...node.data,
                ...data,
              },
            }
          : node
      ),
      saveState: "Saved",
    }));
  },
  toggleNodeLock: (nodeId) => {
    const node = get().nodes.find((item) => item.id === nodeId);
    if (!node) return;
    get().updateNodeData(nodeId, { locked: node.data.locked !== true });
  },
  createGroupFromSelection: () => {
    const ids = get().selectedNodeIds;
    if (ids.length < 2) return;
    const language = get().language;
    const index = get().groups.length + 1;
    const group: CanvasGroup = {
      id: `group-${Date.now()}`,
      title: `${t("groupDefaultTitle", language)} ${index}`,
      color: DEFAULT_GROUP_COLOR,
      nodeIds: [...ids],
    };
    set((state) => ({
      groups: [...state.groups, group],
      saveState: "Unsaved",
    }));
    toast.success(t("groupCreated", language), { description: group.title });
  },
  toggleGroupSelection: () => {
    const ids = get().selectedNodeIds;
    if (ids.length < 2) return;
    const groups = get().groups;
    const containing = groups.filter(
      (group) => ids.every((id) => group.nodeIds.includes(id)) && ids.length === group.nodeIds.length,
    );
    if (containing.length === 1) {
      get().deleteGroup(containing[0].id);
      return;
    }
    get().createGroupFromSelection();
  },
  ungroupSelected: () => {
    const ids = new Set(get().selectedNodeIds);
    if (ids.size === 0) return;
    set((state) => {
      const groups = pruneGroups(
        state.groups.map((group) => ({
          ...group,
          nodeIds: group.nodeIds.filter((id) => !ids.has(id)),
        })),
        new Set(state.nodes.map((node) => node.id)),
      );
      return { groups, saveState: "Unsaved" };
    });
  },
  renameGroup: (groupId, title) => {
    const next = title.trim().slice(0, 80);
    if (!next) return;
    set((state) => ({
      groups: state.groups.map((group) =>
        group.id === groupId ? { ...group, title: next } : group
      ),
      saveState: "Unsaved",
    }));
  },
  setGroupColor: (groupId, color) => {
    set((state) => ({
      groups: state.groups.map((group) =>
        group.id === groupId ? { ...group, color } : group
      ),
      saveState: "Unsaved",
    }));
  },
  deleteGroup: (groupId) => {
    set((state) => ({
      groups: state.groups.filter((group) => group.id !== groupId),
      saveState: "Unsaved",
    }));
    toast.success(t("groupRemoved", get().language));
  },
  setConceptSourceNodeId: (nodeId) => set({ conceptSourceNodeId: nodeId }),
  createConceptFromSelection: async (term, sourceNodeId) => {
    const language = get().language;
    if (!hasCapability(getUser(), "ai.concept")) {
      toast.error(t("proFeatureRequired", language));
      return;
    }
    const cleanTerm = term.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!cleanTerm) return;

    const existing = findConceptByTerm(get().concepts, cleanTerm);
    if (existing) {
      toast.info(t("conceptExists", language));
      get().focusConceptSource(existing.id);
      return;
    }

    const sourceId = sourceNodeId || get().selectedNodeId;
    const sourceNode = get().nodes.find((node) => node.id === sourceId);
    const concept: KeyConcept = {
      id: `concept-${Date.now()}`,
      term: cleanTerm,
      explanation: "",
      points: [],
      sourceNodeId: sourceId,
      sourceNodeTitle: sourceNode?.data.title?.slice(0, 200) ?? "",
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      concepts: [concept, ...state.concepts],
      // 创建后直接把右侧栏切到「概念」并展开，让用户立刻看到卡片。
      panelTab: "concepts",
      panelCollapsed: false,
      saveState: "Unsaved",
    }));
    await fillConceptExplanation(concept);
  },
  retryConcept: async (conceptId) => {
    const concept = get().concepts.find((item) => item.id === conceptId);
    if (!concept) return;
    await fillConceptExplanation(concept);
  },
  deleteConcept: (conceptId) => {
    set((state) => {
      const nextErrors = { ...state.conceptErrors };
      delete nextErrors[conceptId];
      return {
        concepts: state.concepts.filter((item) => item.id !== conceptId),
        conceptPendingIds: state.conceptPendingIds.filter((id) => id !== conceptId),
        conceptErrors: nextErrors,
        saveState: "Unsaved",
      };
    });
  },
  focusConceptSource: (conceptId) => {
    const concept = get().concepts.find((item) => item.id === conceptId);
    if (!concept) return;
    if (!get().nodes.some((node) => node.id === concept.sourceNodeId)) {
      toast(t("conceptSourceMissing", get().language));
      return;
    }
    get().focusNode(concept.sourceNodeId);
  },
  addNode: (x: number, y: number, kind: NodeKind = "text") => {
    pushHistory(get().nodes, get().edges);
    const id = `n-${kind}-${Date.now()}`;
    const node = buildNode({
      id,
      kind,
      title: kind === "task"
        ? ""
        : kind === "note"
          ? t("newNote", get().language)
          : kind === "free"
            ? defaultNodeTitle("thought", get().language)
            : defaultNodeTitle("idea", get().language),
      body: "",
      x,
      y,
      metaLeft: kind === "task" || kind === "note" ? "" : undefined,
      metaRight: kind === "task" || kind === "note" ? "" : undefined,
    });
    set((state) => ({
      nodes: [...state.nodes, node],
      selectedNodeId: id,
      selectedNodeIds: [id],
      saveState: "Saved",
    }));
    return id;
  },
  addConnectedNode: ({ fromNodeId, fromHandleId, fromHandleType, x, y, kind }) => {
    pushHistory(get().nodes, get().edges);
    const width = WIDTH_BY_KIND[kind] ?? BASE_NODE_WIDTH;
    const height = NODE_HEIGHT_BY_KIND[kind] ?? 200;
    const id = `n-${kind}-${Date.now()}`;
    const node = buildNode({
      id,
      kind,
      title: kind === "task"
        ? ""
        : kind === "free"
          ? defaultNodeTitle("thought", get().language)
          : defaultNodeTitle("idea", get().language),
      body: "",
      x: x - width / 2,
      y: y - height / 2,
      metaLeft: kind === "task" ? "" : undefined,
      metaRight: kind === "task" ? "" : undefined,
    });
    const connectsFromSource = fromHandleType !== "target";
    const edge = makeEdge({
      id: `e-connect-${Date.now()}`,
      source: connectsFromSource ? fromNodeId : id,
      target: connectsFromSource ? id : fromNodeId,
      sourceHandle: connectsFromSource ? fromHandleId ?? undefined : undefined,
    });
    set((state) => ({
      nodes: [...state.nodes, node],
      edges: [...state.edges, edge],
      selectedNodeId: id,
      selectedNodeIds: [id],
      saveState: "Saved",
    }));
    return id;
  },
  addSiblingNode: (nodeId: string) => {
    pushHistory(get().nodes, get().edges);
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const id = `n-text-${Date.now()}`;
    const newNodeX = node.position.x + POSITION_OFFSETS.sibling.x;
    const newNodeY = findNonOverlappingY(get().nodes, newNodeX, node.position.y, BASE_NODE_WIDTH, NODE_HEIGHT_BY_KIND.text);
    const newNode = buildNode({
      id,
      kind: "text",
      title: defaultNodeTitle("idea", get().language),
      body: "",
      x: newNodeX,
      y: newNodeY,
    });
    const edge = makeEdge({
      id: `e-sibling-${Date.now()}`,
      source: nodeId,
      target: id,
      sourceHandle: node.data.kind === "link" ? "main" : undefined,
    });
    set((state) => ({
      nodes: [...state.nodes, newNode],
      edges: [...state.edges, edge],
      selectedNodeId: id,
      selectedNodeIds: [id],
      autoEditNodeId: id,
      saveState: "Saved",
    }));
  },
  addChildNode: (nodeId, kind = "text") => {
    pushHistory(get().nodes, get().edges);
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return "";
    const id = kind === "task" ? `n-task-${Date.now()}` : `n-text-${Date.now()}`;
    const width = WIDTH_BY_KIND[kind] ?? BASE_NODE_WIDTH;
    const newNodeX = node.position.x + POSITION_OFFSETS.child.x;
    const newNodeY = findNonOverlappingY(
      get().nodes,
      newNodeX,
      node.position.y + POSITION_OFFSETS.child.y,
      width,
      NODE_HEIGHT_BY_KIND[kind] ?? NODE_HEIGHT_BY_KIND.text,
    );
    const newNode = buildNode({
      id,
      kind,
      title: kind === "task" ? "" : defaultNodeTitle("subIdea", get().language),
      body: "",
      width,
      x: newNodeX,
      y: newNodeY,
      metaLeft: kind === "task" ? "" : undefined,
      metaRight: kind === "task" ? statusLabel("runTask", get().language) : undefined,
    });
    const edge = makeEdge({
      id: `e-child-${Date.now()}`,
      source: nodeId,
      target: id,
      sourceHandle: node.data.kind === "link" ? "main" : undefined,
    });
    set((state) => ({
      nodes: [...state.nodes, newNode],
      edges: [...state.edges, edge],
      selectedNodeId: id,
      selectedNodeIds: [id],
      autoEditNodeId: kind === "text" ? id : null,
      saveState: "Saved",
    }));
    return id;
  },
  createInspireActionCard: (action) => {
    const { selectedNodeId, nodes, language } = get();
    if (!selectedNodeId) return;

    const selectedNode = nodes.find((node) => node.id === selectedNodeId);
    if (!selectedNode) return;

    const config = action === "challenge"
      ? {
          title: "找出这个观点的漏洞",
          body: "请找出这个观点中的漏洞、反例和缺失证据，并说明它们为什么成立。",
          inspireAction: "challenge" as const,
        }
      : {
          title: "反驳这个观点",
          body: "请对这个观点给出具体反驳：指出它为什么不成立，并提供一个反例或替代解释。",
          inspireAction: "rebut" as const,
        };
    const taskType = detectTaskType(config.body);
    const width = WIDTH_BY_KIND.task ?? BASE_NODE_WIDTH;
    const newX = selectedNode.position.x + POSITION_OFFSETS.sibling.x;
    const newY = findNonOverlappingY(
      nodes,
      newX,
      selectedNode.position.y,
      width,
      NODE_HEIGHT_BY_KIND.task,
    );
    const id = `n-${action}-${Date.now()}`;

    pushHistory(nodes, get().edges);
    const node = buildNode({
      id,
      kind: "task",
      title: config.title,
      body: config.body,
      x: newX,
      y: newY,
      width,
      metaLeft: get().modelName || get().defaultModel || "",
      metaRight: statusLabel("runTask", language),
      taskStatus: "idle",
      taskType,
      author: "ai",
      adopted: true,
      adoptedAt: new Date().toISOString(),
      inspireAction: config.inspireAction,
    });
    const edge = makeEdge({
      id: `${selectedNodeId}-${action}-${id}`,
      source: selectedNodeId,
      target: id,
    });

    set((state) => ({
      nodes: [...state.nodes, node],
      edges: [...state.edges, edge],
      selectedNodeId: id,
      selectedNodeIds: [id],
      saveState: "Unsaved",
    }));
  },
  removeChip: (nodeId: string, chip: string) => {
    pushHistory(get().nodes, get().edges);
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, chips: (node.data.chips ?? []).filter((c) => c !== chip) } }
          : node
      ),
    }));
  },
  getReasoningPath: (nodeId: string) => {
    const { nodes, edges } = get();
    const path: GoDeeperFlowNode[] = [];
    const visited = new Set<string>();
    let currentId: string | undefined = nodeId;

    // onConnect 目前允许成环；有 visited 保护后追问不会再让主循环无限执行。
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node = nodes.find((n) => n.id === currentId);
      if (!node) break;
      path.unshift(node);
      const parentEdge = edges.find((e) => e.target === currentId);
      currentId = parentEdge?.source;
    }

    return path;
  },
  exportReport: () => {
    set({ exportOpen: true });
  },
});});
