import type { CanvasEdgeSeed, CanvasGroup, CanvasNodeSeed, KeyConcept, KeyPoint, NodeKind, TaskStatus, TaskType, TraceItem } from "@/lib/types";
import { normalizeGroups } from "@/lib/group-model";
import { normalizeTaskNodeFields } from "@/lib/task-model";
import { TASK_TYPE_LABELS } from "@/lib/types";
import type { SocraticSession } from "@/lib/types";
import { clampNotePageIndex, normalizeNotePages } from "@/lib/note-pages";
import { normalizeNodeCatalog } from "@/lib/node-body";

/** 画布导出文件标识，用于区分「本项目的 JSON」与任意 JSON */
export const CANVAS_FILE_FORMAT = "godeeper.canvas";
/** 导出结构版本。结构变更（非新增可选字段）时才递增 */
export const CANVAS_FILE_VERSION = 1;

export interface CanvasViewportSnapshot {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasExportFile {
  format: typeof CANVAS_FILE_FORMAT;
  version: typeof CANVAS_FILE_VERSION;
  exportedAt: string;
  canvasName: string;
  viewport: CanvasViewportSnapshot | null;
  nodes: CanvasNodeSeed[];
  edges: CanvasEdgeSeed[];
  timeline: TraceItem[];
  groups?: CanvasGroup[];
  concepts?: KeyConcept[];
  /** 引导模式：画布级开关 */
  guideMode?: boolean;
}

const NODE_KINDS: NodeKind[] = ["text", "task", "link", "result", "free", "inspire", "note", "image"];
const TASK_STATUSES: TaskStatus[] = ["idle", "running", "complete"];

export interface CreateCanvasExportInput {
  canvasName: string;
  viewport?: CanvasViewportSnapshot | null;
  nodes: CanvasNodeSeed[];
  edges: CanvasEdgeSeed[];
  timeline?: TraceItem[];
  groups?: CanvasGroup[];
  concepts?: KeyConcept[];
  guideMode?: boolean;
}

/**
 * 生成可被「拖回画布」恢复的导出文件。
 * 节点坐标、宽度、全部 data 字段、连线 sourceHandle、视口、画布名与时间线都会写入。
 */
export function createCanvasExport(input: CreateCanvasExportInput): CanvasExportFile {
  return {
    format: CANVAS_FILE_FORMAT,
    version: CANVAS_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    canvasName: input.canvasName,
    viewport: normalizeViewport(input.viewport ?? null),
    nodes: input.nodes.map((node) => normalizeTaskNodeFields(cloneNode(node))),
    edges: input.edges.map((edge) => ({ ...edge })),
    timeline: (input.timeline ?? []).map((item) => ({ ...item })),
    groups: normalizeGroups(input.groups),
    concepts: Array.isArray(input.concepts) ? input.concepts : [],
    ...(input.guideMode === true ? { guideMode: true } : {}),
  };
}

/**
 * 解析并校验拖入的 JSON 文件。
 * 只接受本项目导出的 `format + version`，遇到未知字段一律忽略，避免把任意 JSON 塞进画布。
 */
export function parseCanvasExport(raw: unknown): CanvasExportFile {
  const parsed = typeof raw === "string" ? safeParse(raw) : raw;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Not a GoDeeper canvas file");
  }

  const file = parsed as Record<string, unknown>;
  if (file.format !== CANVAS_FILE_FORMAT) {
    throw new Error("Missing or unknown format field");
  }
  if (file.version !== CANVAS_FILE_VERSION) {
    throw new Error(`Unsupported canvas file version: ${String(file.version)}`);
  }
  if (!Array.isArray(file.nodes)) {
    throw new Error("Missing nodes array");
  }
  if (!Array.isArray(file.edges)) {
    throw new Error("Missing edges array");
  }

  const nodes: CanvasNodeSeed[] = [];
  const nodeIds = new Set<string>();
  file.nodes.forEach((rawNode, index) => {
    const node = normalizeNode(rawNode);
    if (!node) return;
    if (nodeIds.has(node.id)) {
      throw new Error(`Duplicate node id: ${node.id} (index ${index})`);
    }
    nodeIds.add(node.id);
    nodes.push(node);
  });
  if (nodes.length === 0) {
    throw new Error("Canvas file contains no valid nodes");
  }

  const edges: CanvasEdgeSeed[] = [];
  const edgeIds = new Set<string>();
  file.edges.forEach((rawEdge) => {
    const edge = normalizeEdge(rawEdge, nodeIds);
    if (!edge || edgeIds.has(edge.id)) return;
    edgeIds.add(edge.id);
    edges.push(edge);
  });

  const groups = normalizeGroups(file.groups)
    .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => nodeIds.has(id)) }))
    .filter((group) => group.nodeIds.length > 0);

  return {
    format: CANVAS_FILE_FORMAT,
    version: CANVAS_FILE_VERSION,
    exportedAt: typeof file.exportedAt === "string" ? file.exportedAt : new Date().toISOString(),
    canvasName: normalizeName(file.canvasName),
    viewport: normalizeViewport(file.viewport),
    nodes,
    edges,
    timeline: normalizeTimeline(file.timeline),
    groups,
    concepts: normalizeConcepts(file.concepts),
    ...(typeof file.guideMode === "boolean" ? { guideMode: file.guideMode } : {}),
  };
}

function normalizeConcepts(value: unknown): KeyConcept[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: toText(item.id),
      term: toText(item.term).slice(0, 80),
      explanation: toText(item.explanation).slice(0, 600),
      points: Array.isArray(item.points)
        ? item.points.map((point) => toText(point).slice(0, 160)).filter(Boolean)
        : [],
      sourceNodeId: toText(item.sourceNodeId),
      sourceNodeTitle: toText(item.sourceNodeTitle).slice(0, 200),
      createdAt: toText(item.createdAt) || new Date().toISOString(),
    }))
    .filter((concept) => concept.id && concept.term)
    .slice(0, 300);
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("File is not valid JSON");
  }
}

function normalizeName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  return name ? name.slice(0, 120) : "Untitled Canvas";
}

function normalizeViewport(value: unknown): CanvasViewportSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const viewport = value as Record<string, unknown>;
  const x = Number(viewport.x);
  const y = Number(viewport.y);
  const zoom = Number(viewport.zoom);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) {
    return null;
  }
  return { x, y, zoom: Math.min(Math.max(zoom, 0.05), 4) };
}

function normalizeTimeline(value: unknown): TraceItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: toText(item.id),
      title: toText(item.title),
      body: toText(item.body),
    }))
    .filter((item) => item.id || item.title)
    .slice(-200);
}

function normalizeNode(value: unknown): CanvasNodeSeed | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const node = value as Record<string, unknown>;
  const id = toText(node.id).trim();
  if (!id) return null;

  const x = Number(node.x);
  const y = Number(node.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const kind = NODE_KINDS.includes(node.kind as NodeKind) ? (node.kind as NodeKind) : "text";
  const width = Number(node.width);

  const parsed: CanvasNodeSeed = {
    id,
    kind,
    x,
    y,
    title: toText(node.title) || defaultTitle(kind),
    body: toText(node.body),
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    metaLeft: toOptionalText(node.metaLeft),
    metaRight: toOptionalText(node.metaRight),
    sourceLabel: toOptionalText(node.sourceLabel),
    chips: Array.isArray(node.chips) ? node.chips.map(toText).filter(Boolean) : undefined,
    taskStatus: TASK_STATUSES.includes(node.taskStatus as TaskStatus)
      ? (node.taskStatus as TaskStatus)
      : undefined,
    taskType: isTaskType(node.taskType) ? (node.taskType as TaskType) : undefined,
    author: node.author === "user" || node.author === "ai" ? node.author : undefined,
    adopted: typeof node.adopted === "boolean" ? node.adopted : undefined,
    adoptedAt: toOptionalText(node.adoptedAt),
    editedByUser: typeof node.editedByUser === "boolean" ? node.editedByUser : undefined,
    legacyKind: node.legacyKind === "inspire" ? "inspire" : undefined,
    inspireAction:
      node.inspireAction === "inspire" || node.inspireAction === "challenge" || node.inspireAction === "rebut" || node.inspireAction === "socratic"
        ? node.inspireAction
        : undefined,
    previewLabel: toOptionalText(node.previewLabel),
    thumbnailUrl: toOptionalText(node.thumbnailUrl),
    summary: toOptionalText(node.summary),
    keyPoints: normalizeKeyPoints(node.keyPoints),
    url: toOptionalText(node.url),
    inspireQuestion: toOptionalText(node.inspireQuestion),
    inspireReason: toOptionalText(node.inspireReason),
    inspirePrerequisites: Array.isArray(node.inspirePrerequisites)
      ? node.inspirePrerequisites.map(toText).filter(Boolean)
      : undefined,
    bodyCollapsed: typeof node.bodyCollapsed === "boolean" ? node.bodyCollapsed : undefined,
    catalog: normalizeNodeCatalog({
      catalog: node.catalog,
      resultItems: node.resultItems,
      catalogCollapsed: node.catalogCollapsed,
    }),
    sourceCatalogId: toOptionalText(node.sourceCatalogId),
    sourceCatalogKind: node.sourceCatalogKind === "guide" || node.sourceCatalogKind === "result"
      ? node.sourceCatalogKind
      : undefined,
    sourceCatalogItemId: toOptionalText(node.sourceCatalogItemId) ?? toOptionalText(node.sourceResultItemId),
    catalogHidden: typeof node.catalogHidden === "boolean" ? node.catalogHidden : undefined,
    catalogSourceHash: toOptionalText(node.catalogSourceHash),
    catalogStale: typeof node.catalogStale === "boolean" ? node.catalogStale : undefined,
    catalogBackfill: toOptionalText(node.catalogBackfill),
    contextPinnedIds: normalizeIdList(node.contextPinnedIds),
    contextExcludedIds: normalizeIdList(node.contextExcludedIds),
    contextSelectionIds: normalizeIdList(node.contextSelectionIds),
    notePages: normalizeNotePages(node.notePages),
    noteActivePage: typeof node.noteActivePage === "number" ? node.noteActivePage : undefined,
    socraticSession: normalizeSocraticSession(node.socraticSession),
  };

  if (parsed.notePages) {
    parsed.noteActivePage = clampNotePageIndex(parsed.noteActivePage, parsed.notePages.length);
  }

  return normalizeTaskNodeFields(parsed);
}

function normalizeIdList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.map(toText).filter((id) => id.length > 0);
  return ids.length > 0 ? ids : undefined;
}

function normalizeKeyPoints(value: unknown): KeyPoint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((point): point is Record<string, unknown> => Boolean(point) && typeof point === "object")
    .map((point) => ({
      text: toText(point.text),
      body: toText(point.body),
      expanded: typeof point.expanded === "boolean" ? point.expanded : undefined,
    }))
    .filter((point) => point.text || point.body);
}

/** 追问卡只在字段形状完整时导入，避免坏数据把画布卡住。 */
function normalizeSocraticSession(value: unknown): SocraticSession | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const session = value as Record<string, unknown>;
  if (typeof session.id !== "string" || typeof session.sourceNodeId !== "string") return undefined;
  if (!Array.isArray(session.rounds)) return undefined;
  return value as SocraticSession;
}

function normalizeEdge(value: unknown, nodeIds: Set<string>): CanvasEdgeSeed | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const edge = value as Record<string, unknown>;
  const source = toText(edge.source);
  const target = toText(edge.target);
  if (!nodeIds.has(source) || !nodeIds.has(target)) return null;

  return {
    id: toText(edge.id) || `e-${source}-${target}`,
    source,
    target,
    sourceHandle: toOptionalText(edge.sourceHandle),
    active: typeof edge.active === "boolean" ? edge.active : undefined,
    hidden: typeof edge.hidden === "boolean" ? edge.hidden : undefined,
  };
}

function cloneNode(node: CanvasNodeSeed): CanvasNodeSeed {
  return {
    ...node,
    chips: node.chips ? [...node.chips] : undefined,
    keyPoints: node.keyPoints
      ? node.keyPoints.map((point) => ({ ...point }))
      : undefined,
    inspirePrerequisites: node.inspirePrerequisites ? [...node.inspirePrerequisites] : undefined,
    contextPinnedIds: node.contextPinnedIds ? [...node.contextPinnedIds] : undefined,
    contextExcludedIds: node.contextExcludedIds ? [...node.contextExcludedIds] : undefined,
    contextSelectionIds: node.contextSelectionIds ? [...node.contextSelectionIds] : undefined,
    notePages: node.notePages
      ? node.notePages.map((page) => ({
          ...page,
          blocks: page.blocks ? page.blocks.map((block) => ({ ...block, bbox: [...block.bbox] as [number, number, number, number] })) : undefined,
        }))
      : undefined,
    socraticSession: node.socraticSession
      ? {
        ...node.socraticSession,
        rounds: node.socraticSession.rounds.map((round) => ({ ...round })),
        blindSpots: node.socraticSession.blindSpots ? [...node.socraticSession.blindSpots] : undefined,
        context: node.socraticSession.context ? [...node.socraticSession.context] : undefined,
      }
      : undefined,
    catalog: node.catalog
      ? {
          ...node.catalog,
          items: node.catalog.items.map((item) => ({
            ...item,
            dependsOn: item.dependsOn ? [...item.dependsOn] : undefined,
          })),
        }
      : undefined,
  };
}

function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && value in TASK_TYPE_LABELS;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function defaultTitle(kind: NodeKind): string {
  switch (kind) {
    case "task":
      return "Task";
    case "link":
      return "Source";
    case "result":
      return "Result";
    case "free":
      return "Idea";
    case "inspire":
      return "Inspiration";
    case "note":
      return "Note";
    case "image":
      return "Image";
    default:
      return "Untitled";
  }
}
