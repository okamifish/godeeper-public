import type { Edge, Node } from "@xyflow/react";
import type { NodeCatalog, ResultCatalogItem } from "./node-body";

export type NodeKind = "text" | "task" | "link" | "result" | "free" | "inspire" | "note" | "image";
export type TaskStatus = "idle" | "running" | "complete";
export type TaskAuthor = "user" | "ai";
export type TaskType =
  | "question"
  | "verify"
  | "research"
  | "summary"
  | "report"
  | "analysis"
  | "compare"
  | "derive"
  | "critique";

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  question: "提问",
  verify: "核实",
  research: "调研",
  summary: "总结",
  report: "报告生成",
  analysis: "分析",
  compare: "对比",
  derive: "推导",
  critique: "反驳",
};

export interface KeyPoint {
  text: string;
  body: string;
  expanded?: boolean;
}

export type NoteOcrStatus = "idle" | "running" | "done" | "error";

/** 苏格拉底追问的五个方向：定义、依据、假设、反例、后果 */
export type SocraticDimension =
  | "definition"
  | "evidence"
  | "assumption"
  | "counterexample"
  | "consequence";

export interface SocraticRound {
  question: string;
  answer: string;
  cardTitle: string;
  cardBody: string;
  dimension: SocraticDimension;
  createdAt: string;
}

export interface SocraticSession {
  id: string;
  sourceNodeId: string;
  sourceTitle: string;
  sourceBody: string;
  context?: string[];
  rounds: SocraticRound[];
  status: "asking" | "done";
  pendingQuestion?: string;
  pendingDimension?: SocraticDimension;
  title?: string;
  summary?: string;
  blindSpots?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteBlock {
  idx: number;
  type: string;
  bbox: [number, number, number, number];
  content: string;
  format?: string;
}

/** 笔记卡片的一页：一张原图 + 该页的识别结果 */
export interface NotePage {
  id: string;
  imageDataUrl: string;
  fileName?: string;
  width: number;
  height: number;
  /** OXR 原始识别 Markdown，始终保留，便于恢复 */
  ocrMarkdown: string;
  /** 用户双击修正后的 Markdown；为空时显示 ocrMarkdown */
  editedMarkdown?: string;
  /** 该页的文字块坐标，为后续「文字 ↔ 原图区域」联动预留 */
  blocks?: NoteBlock[];
  status: NoteOcrStatus;
  error?: string;
}

export interface GoDeeperNodeData extends Record<string, unknown> {
  kind: NodeKind;
  title: string;
  body: string;
  width?: number;
  metaLeft?: string;
  metaRight?: string;
  /** 任务运行失败时的完整原因；与 metaRight 分开，避免把错误塞进运行按钮 */
  taskError?: string;
  sourceLabel?: string;
  chips?: string[];
  taskStatus?: TaskStatus;
  taskType?: TaskType;
  author?: TaskAuthor;
  adopted?: boolean;
  adoptedAt?: string;
  editedByUser?: boolean;
  /** Old canvases used kind="inspire"; this keeps their provenance explicit. */
  legacyKind?: "inspire";
  /** 启发类任务卡的来源动作：启发 / 找漏洞 / 反驳 / 苏格拉底追问 */
  inspireAction?: "inspire" | "challenge" | "rebut" | "socratic";
  previewLabel?: string;
  thumbnailUrl?: string;
  summary?: string;
  keyPoints?: KeyPoint[];
  url?: string;
  inspireQuestion?: string;
  inspireReason?: string;
  inspirePrerequisites?: string[];
  /** 正文是否被用户手动收起（随画布快照落库，默认展开） */
  bodyCollapsed?: boolean;
  /** 统一目录卡数据：结果卡与引导卡共用 */
  catalog?: NodeCatalog;
  /** 引导模式：规划依据（问题正文 + 上下文）的哈希 */
  catalogSourceHash?: string;
  /** 引导模式：正文变化后路径可能失配 */
  catalogStale?: boolean;
  /** 引导模式：子任务完成后的一句话贡献说明 */
  catalogBackfill?: string;
  /** @deprecated 旧结果目录字段，读取时会归一化到 catalog */
  resultItems?: ResultCatalogItem[];
  /** @deprecated 旧折叠字段，读取时会归一化到 catalog.collapsed */
  catalogCollapsed?: boolean;
  /** 从目录卡条目物化出的任务：来源目录卡 id */
  sourceCatalogId?: string;
  /** 来源类型：引导目录展开 vs 结果目录延伸 */
  sourceCatalogKind?: "guide" | "result";
  /** 从目录卡条目物化出的任务：来源条目 id */
  sourceCatalogItemId?: string;
  /** 结果目录延伸项被用户收起：节点保留但不在画布显示 */
  catalogHidden?: boolean;
  /** @deprecated 旧字段，读取时会兼容到 sourceCatalogItemId */
  sourceResultItemId?: string;
  /** 仅锁位置：不可拖动、不被碰撞推移、不被自动布局移动 */
  locked?: boolean;
  /** Phase 2：用户手动固定的上下文节点 */
  contextPinnedIds?: string[];
  /** Phase 2：用户手动移除的上下文节点 */
  contextExcludedIds?: string[];
  /** Phase 2：框选/多选后显式覆盖的上下文节点 */
  contextSelectionIds?: string[];
  /** 笔记卡片：多页原图与该页识别结果 */
  notePages?: NotePage[];
  /** 笔记卡片当前展示页，随画布快照保存 */
  noteActivePage?: number;
  /** JEV 问题深度判断结果；只有 qualified 才显示星星 */
  qualityStatus?: "qualified" | "normal";
  qualityConfidence?: number;
  /** 判断时的问题 + 上下文哈希，用于同题去重 */
  qualityHash?: string;
  qualityModel?: string;
  qualityCheckedAt?: string;
  /** 追问卡：完整会话记录；旧版本会忽略该字段 */
  socraticSession?: SocraticSession;
}

export type GoDeeperFlowNode = Node<GoDeeperNodeData>;
export type GoDeeperFlowEdge = Edge;

export interface CanvasNodeSeed extends GoDeeperNodeData {
  id: string;
  x: number;
  y: number;
}

export interface CanvasEdgeSeed {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  active?: boolean;
  /** 结果目录延伸项收起时，对应连线一并隐藏 */
  hidden?: boolean;
}

export interface TraceItem {
  id: string;
  title: string;
  body: string;
}

/** 画布软分组：只描述区域框与成员，不改变节点坐标 */
export interface CanvasGroup {
  id: string;
  title: string;
  color: string;
  nodeIds: string[];
}

export interface CanvasState {
  nodes: CanvasNodeSeed[];
  edges: CanvasEdgeSeed[];
  selectedNodeId: string;
  timeline: TraceItem[];
  canvasName?: string;
  groups?: CanvasGroup[];
  concepts?: KeyConcept[];
  /** 引导模式：画布级开关，随快照保存 */
  guideMode?: boolean;
}

/** 用户手动创建、AI 结合当前语境补充解释的关键概念卡 */
export interface KeyConcept {
  id: string;
  term: string;
  explanation: string;
  points: string[];
  sourceNodeId: string;
  sourceNodeTitle: string;
  createdAt: string;
}
