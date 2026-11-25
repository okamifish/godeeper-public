import type { ReportGraphInput } from "@/lib/report-graph";

export interface ReportTokenEstimate {
  inputTokens: number;
  outputTokens: { min: number; max: number };
  contextLimit: number;
  contextUsage: number;
  contextOk: boolean;
  contextWarning: boolean;
  credits: number;
  byok: boolean;
  nodeCount: number;
  edgeCount: number;
}

const CJK = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/;

/** 保守估算：中文按 1 token/字，其他按 3.5 字符/token。 */
export function estimateTextTokens(value: string): number {
  let cjk = 0;
  let other = 0;
  for (const char of value) {
    if (CJK.test(char)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk * 1.08 + other / 3.5);
}

/** 常见模型的保守上下文上限；未知模型按 64k 处理，宁可提前提醒。 */
export function getModelContextLimit(model?: string): number {
  const name = (model ?? "").toLowerCase();
  if (name.includes("claude")) return 200_000;
  if (name.includes("deepseek")) return 128_000;
  if (name.includes("kimi") || name.includes("moonshot")) return 128_000;
  if (name.includes("glm") || name.includes("zhipu")) return 128_000;
  if (name.includes("gpt") || name.includes("o3") || name.includes("o4")) return 128_000;
  return 64_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 生成前预估。输入按完整序列化后的 payload 估算；输出只包含结构、叙述和 id，
 * 不重复卡片正文，所以输出量主要随阶段/里程碑/闪光点增长，而不是随正文线性增长。
 */
export function estimateReportRequest(
  graph: ReportGraphInput,
  options: { model?: string; byok?: boolean } = {},
): ReportTokenEstimate {
  const payload = JSON.stringify(graph);
  // 加上提示词、格式说明与 JSON 包装的固定开销。
  const inputTokens = estimateTextTokens(payload) + 1_400;

  const nodeCount = graph.nodes.length;
  const edgeCount = graph.edges.length;
  const stageCount = clamp(Math.ceil(nodeCount / 6), 3, 10);
  const milestoneCount = clamp(Math.round(stageCount * 0.8), 3, 6);
  const brightSpotCount = clamp(Math.round(stageCount * 0.8), 3, 6);
  const openQuestionCount = clamp(Math.ceil(nodeCount / 20), 0, 5);

  const baseOutput =
    800
    + stageCount * 180
    + milestoneCount * 60
    + brightSpotCount * 90
    + openQuestionCount * 50
    + nodeCount * 6;

  const outputTokens = {
    min: Math.round(baseOutput * 0.75),
    max: Math.round(baseOutput * 1.3),
  };

  const contextLimit = getModelContextLimit(options.model);
  const contextUsage = (inputTokens + outputTokens.max) / contextLimit;
  const byok = Boolean(options.byok);

  return {
    inputTokens,
    outputTokens,
    contextLimit,
    contextUsage,
    // 90% 以上就提醒，100% 以上禁止发起；不静默截断。
    contextOk: contextUsage <= 0.9,
    contextWarning: contextUsage > 0.75,
    // 当前商业化前按次扣 1 个 summary credit；BYOK 不扣。
    credits: byok ? 0 : 1,
    byok,
    nodeCount,
    edgeCount,
  };
}
