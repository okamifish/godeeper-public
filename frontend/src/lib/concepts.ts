import type { GoDeeperFlowEdge, GoDeeperFlowNode, KeyConcept } from "@/lib/types";
import { contextEntriesToPrompt, resolveTaskContext } from "@/lib/context-resolver";

/** 术语归一化：小写、压缩空白、去掉首尾与常见标点，用于去重 */
export function normalizeConceptTerm(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[，。；：、,.!?;:'"“”‘’（）()\[\]【】《》<>·—\-_]/g, "")
    .trim();
}

export function findConceptByTerm(concepts: KeyConcept[], term: string): KeyConcept | undefined {
  const key = normalizeConceptTerm(term);
  if (!key) return undefined;
  return concepts.find((concept) => normalizeConceptTerm(concept.term) === key);
}

/**
 * 概念解释的语境：来源卡片 + 祖先链 + 直接证据。
 * 与反驳一样不带主结果，避免用“答案”去解释概念。
 */
export function buildConceptContext(
  nodes: GoDeeperFlowNode[],
  edges: GoDeeperFlowEdge[],
  sourceNodeId: string,
): string[] {
  if (!nodes.some((node) => node.id === sourceNodeId)) return [];
  const resolved = resolveTaskContext(nodes, edges, sourceNodeId, { ancestorDepth: 3 });
  return contextEntriesToPrompt(resolved.entries)
    .map((entry) => entry.slice(0, 1200))
    .slice(0, 10);
}
