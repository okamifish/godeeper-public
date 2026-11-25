import type { GoDeeperFlowEdge, GoDeeperFlowNode, TaskType } from "@/lib/types";

import { formatMentionsForText } from "@/lib/mentions";

export type ContextReason =
  | "current"
  | "ancestor"
  | "evidence"
  | "pinned"
  | "sibling"
  | "descendant"
  | "selected"
  | "connected";

export type ContextLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";

export interface ContextEntry {
  node: GoDeeperFlowNode;
  reason: ContextReason;
  level: ContextLevel;
  tokens: number;
}

export interface ResolveOptions {
  /** 向上追溯父节点的最大层数，1 = 只看直接父节点 */
  ancestorDepth?: number;
  pinnedIds?: string[];
  excludedIds?: string[];
  selectedIds?: string[];
  includeSiblings?: boolean;
  includeDescendants?: boolean;
  includeWholeComponent?: boolean;
  includeResults?: boolean;
  maxTokens?: number;
}

export interface ResolvedContext {
  entries: ContextEntry[];
  totalTokens: number;
  truncated: boolean;
  usedIds: string[];
}

export interface ContextRecipe {
  includeResults: boolean;
  ancestorDepth: number;
}

const DEFAULT_ANCESTOR_DEPTH = 3;
const DEFAULT_MAX_TOKENS = 6000;

/** 需要 AI 回看已有结果的任务类型（总结/对比/报告/分析） */
const RESULT_RECIPES: ReadonlySet<TaskType> = new Set<TaskType>([
  "summary",
  "compare",
  "report",
  "analysis",
]);

export function getContextRecipe(taskType: TaskType): ContextRecipe {
  return {
    includeResults: RESULT_RECIPES.has(taskType),
    ancestorDepth: DEFAULT_ANCESTOR_DEPTH,
  };
}

const CJK_PATTERN =
  /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/;

/** 中文/日文/韩文字符约 0.8 token，其他字符约 4 个 1 token（近似值，仅用于预算提示） */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (CJK_PATTERN.test(char)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk * 0.8 + other / 4);
}

function nodeText(node: GoDeeperFlowNode): string {
  const data = node.data;
  return [
    data.title,
    data.body,
    data.summary,
    (data.chips ?? []).join("\n"),
    (data.keyPoints ?? []).map((point) => point.text).join("\n"),
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .map((part) => formatMentionsForText(part))
    .join("\n");
}

function countNodeTokens(node: GoDeeperFlowNode): number {
  return estimateTokens(nodeText(node));
}

export function contextEntriesToPrompt(entries: ContextEntry[]): string[] {
  return entries.map((entry) => {
    const title = entry.node.data.title ?? "";
    const body = formatMentionsForText(entry.node.data.body ?? "");
    return body.trim().length > 0 ? `${title}\n${body}` : title;
  });
}

function buildEdgeIndex(edges: GoDeeperFlowEdge[]) {
  const incoming = new Map<string, GoDeeperFlowEdge[]>();
  const outgoing = new Map<string, GoDeeperFlowEdge[]>();
  for (const edge of edges) {
    const inList = incoming.get(edge.target);
    if (inList) inList.push(edge);
    else incoming.set(edge.target, [edge]);

    const outList = outgoing.get(edge.source);
    if (outList) outList.push(edge);
    else outgoing.set(edge.source, [edge]);
  }
  return { incoming, outgoing };
}

/** 无向连通分量（用于 L5“整个分量”） */
function collectComponent(startId: string, edges: GoDeeperFlowEdge[]): Set<string> {
  const neighbours = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = neighbours.get(a);
    if (list) list.push(b);
    else neighbours.set(a, [b]);
  };
  for (const edge of edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  const component = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of neighbours.get(current) ?? []) {
      if (component.has(next)) continue;
      component.add(next);
      queue.push(next);
    }
  }
  return component;
}

export function resolveTaskContext(
  nodes: GoDeeperFlowNode[],
  edges: GoDeeperFlowEdge[],
  taskId: string,
  options: ResolveOptions = {},
): ResolvedContext {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const currentNode = byId.get(taskId);
  if (!currentNode) {
    return { entries: [], totalTokens: 0, truncated: false, usedIds: [] };
  }

  const ancestorDepth = Math.max(1, options.ancestorDepth ?? DEFAULT_ANCESTOR_DEPTH);
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const excluded = new Set(options.excludedIds ?? []);
  const { incoming, outgoing } = buildEdgeIndex(edges);

  const entryOf = (node: GoDeeperFlowNode, reason: ContextReason, level: ContextLevel): ContextEntry => ({
    node,
    reason,
    level,
    tokens: countNodeTokens(node),
  });

  // L0：当前任务始终在上下文里，即使它出现在 excludedIds 中。
  const currentEntry = entryOf(currentNode, "current", "L0");

  // L3：用户手动 pin 的上下文（排在证据/祖先之前）。
  const pinnedEntries: ContextEntry[] = [];
  for (const id of options.pinnedIds ?? []) {
    const node = byId.get(id);
    if (!node || excluded.has(id)) continue;
    pinnedEntries.push(entryOf(node, "pinned", "L3"));
  }

  // L1/L2：沿所有入边向上；link 节点算证据，其余算祖先。
  const ancestorCandidates: Array<{ node: GoDeeperFlowNode; reason: "evidence" | "ancestor" }> = [];
  const traversalIds = new Set<string>([taskId]);
  let frontier: string[] = [taskId];
  for (let depth = 1; depth <= ancestorDepth; depth += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const edge of incoming.get(id) ?? []) {
        if (traversalIds.has(edge.source)) continue;
        const node = byId.get(edge.source);
        if (!node) continue;
        traversalIds.add(edge.source);
        ancestorCandidates.push({
          node,
          reason: node.data.kind === "link" ? "evidence" : "ancestor",
        });
        next.push(edge.source);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  // 显式框选覆盖默认解析（仍保留 L0 和 pinned）。
  const selectionIds = options.selectedIds ?? [];
  const hasSelection = selectionIds.length > 0;

  const evidenceEntries = hasSelection
    ? []
    : ancestorCandidates
        .filter((candidate) => candidate.reason === "evidence")
        .map((candidate) => entryOf(candidate.node, "evidence", "L2"));
  const ancestorEntries = hasSelection
    ? []
    : ancestorCandidates
        .filter((candidate) => candidate.reason === "ancestor")
        .map((candidate) => entryOf(candidate.node, "ancestor", "L1"));

  const selectedEntries: ContextEntry[] = [];
  for (const id of selectionIds) {
    const node = byId.get(id);
    if (!node || excluded.has(id)) continue;
    selectedEntries.push(entryOf(node, "selected", "L1"));
  }

  const sharedParents = (incoming.get(taskId) ?? []).map((edge) => edge.source);
  const includeSiblings =
    options.includeSiblings === true || options.includeWholeComponent === true;
  const includeResults = options.includeResults === true;
  const includeDescendants = options.includeDescendants === true;
  const includeWholeComponent = options.includeWholeComponent === true;

  // L4：与当前共享父节点的兄弟任务。
  const siblingEntries: ContextEntry[] = [];
  if (includeSiblings) {
    for (const parentId of sharedParents) {
      for (const edge of outgoing.get(parentId) ?? []) {
        if (edge.target === taskId) continue;
        const node = byId.get(edge.target);
        if (!node || node.data.kind === "result") continue;
        siblingEntries.push(entryOf(node, "sibling", "L4"));
      }
    }
  }

  // 每个任务的第一条 result 出边视为“主结果”；其余 result 节点只是碰巧连过来的卡片，
  // 只有在显式开启下游/整图时才进入上下文，避免 recipe 把无关结果一起带上。
  const primaryResultIds = new Set<string>();
  const seenSource = new Set<string>();
  for (const edge of edges) {
    if (seenSource.has(edge.source)) continue;
    const target = byId.get(edge.target);
    if (!target || target.data.kind !== "result") continue;
    seenSource.add(edge.source);
    primaryResultIds.add(edge.target);
  }

  // L4：当前的下游节点；默认跳过 result，除非任务 recipe 明确要结果。
  const descendantEntries: ContextEntry[] = [];
  if (includeDescendants || includeResults || includeWholeComponent) {
    const visited = new Set<string>([taskId]);
    const queue = [taskId];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      for (const edge of outgoing.get(id) ?? []) {
        if (visited.has(edge.target)) continue;
        visited.add(edge.target);
        const node = byId.get(edge.target);
        if (!node) continue;
        const isPrimaryResult = primaryResultIds.has(node.id);
        const shouldEmit =
          includeWholeComponent ||
          (includeResults && isPrimaryResult) ||
          (includeDescendants && !isPrimaryResult);
        if (shouldEmit) descendantEntries.push(entryOf(node, "descendant", "L4"));
        // result 下游仍可继续遍历，保证“整条链”不会被一个结果节点截断。
        queue.push(edge.target);
      }
    }
  }

  // L5：显式开启时补齐整个无向连通分量。
  const connectedEntries: ContextEntry[] = [];
  if (includeWholeComponent) {
    const component = collectComponent(taskId, edges);
    for (const node of nodes) {
      if (!component.has(node.id)) continue;
      connectedEntries.push(entryOf(node, "connected", "L5"));
    }
  }

  // 按优先级拼装并去重：同一节点只保留最先出现的（更强）reason。
  const ordered: ContextEntry[] = [];
  const seen = new Set<string>();
  for (const entry of [
    currentEntry,
    ...pinnedEntries,
    ...evidenceEntries,
    ...ancestorEntries,
    ...selectedEntries,
    ...siblingEntries,
    ...descendantEntries,
    ...connectedEntries,
  ]) {
    const id = entry.node.id;
    if (id !== taskId && excluded.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(entry);
  }

  // 裁剪：超过预算从尾部丢弃，current 永远保留。
  const kept: ContextEntry[] = [];
  let totalTokens = 0;
  let truncated = false;
  for (const entry of ordered) {
    if (kept.length === 0) {
      kept.push(entry);
      totalTokens += entry.tokens;
      if (totalTokens > maxTokens) truncated = true;
      continue;
    }
    if (totalTokens + entry.tokens > maxTokens) {
      truncated = true;
      break;
    }
    kept.push(entry);
    totalTokens += entry.tokens;
  }

  return {
    entries: kept,
    totalTokens,
    truncated,
    usedIds: kept.map((entry) => entry.node.id),
  };
}
