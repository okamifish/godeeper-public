import type { GoDeeperFlowEdge, GoDeeperFlowNode } from "@/lib/types";

export interface CritiqueInput {
  claim: { title: string; body?: string; taskType?: string };
  evidence: Array<{ title: string; text: string }>;
}

const MAX_EVIDENCE = 8;
const MAX_EVIDENCE_TEXT = 600;
const MAX_CLAIM_BODY = 1500;

function evidenceText(node: GoDeeperFlowNode): string {
  const data = node.data;
  const keyPoints = (data.keyPoints ?? []).map((point) => point.text).join("\n");
  return (data.summary || keyPoints || data.body || "").trim().slice(0, MAX_EVIDENCE_TEXT);
}

/**
 * 对抗性反驳只带「主张 + 直接证据」。
 * 直接证据仅认直接连入的 link 节点；result（答案）与任务节点一律排除，避免回声与循环论证。
 */
export function buildCritiqueInput(
  nodes: GoDeeperFlowNode[],
  edges: GoDeeperFlowEdge[],
  taskId: string,
): CritiqueInput | null {
  const claimNode = nodes.find((node) => node.id === taskId);
  if (!claimNode) return null;

  const evidence: CritiqueInput["evidence"] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (edge.target !== taskId) continue;
    if (seen.has(edge.source)) continue;
    const source = nodes.find((node) => node.id === edge.source);
    if (!source || source.data.kind !== "link") continue;

    seen.add(edge.source);
    evidence.push({
      title: (source.data.title || "").trim().slice(0, 200),
      text: evidenceText(source),
    });
    if (evidence.length >= MAX_EVIDENCE) break;
  }

  return {
    claim: {
      title: (claimNode.data.title || "").trim().slice(0, 300),
      body: (claimNode.data.body || "").trim().slice(0, MAX_CLAIM_BODY) || undefined,
      taskType: claimNode.data.taskType,
    },
    evidence,
  };
}
