import { normalizeQuestionText } from "@/lib/task-model";

export type QualityEvaluationStatus =
  | "qualified"
  | "normal"
  | "disabled"
  | "skipped"
  | "rate_limited"
  | "byok_not_supported";

export interface QualityEvaluation {
  status: QualityEvaluationStatus;
  confidence: number;
  model: string;
}

/**
 * 问题 + 上下文的稳定指纹，用于同题去重。
 * 归一化会去掉空白、标点、符号并转小写，避免“改个标点”就重新判断。
 */
export function buildQualityHash(question: string, context: string): string {
  const normalized = `${normalizeQuestionText(question)}|${normalizeQuestionText(context)}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
