/**
 * 托管 AI 成本估算。
 *
 * 价格基准：OpenAI 当前最强通用模型 GPT-6 Astra（gpt-6-astra）的标准 API 价格。
 * 来源：https://platform.openai.com/docs/pricing（2026-11-03 读取）
 *
 * - 输入：$10.00 / 1M tokens
 * - 输出：$50.00 / 1M tokens
 *
 * 说明：
 * - 系统没有单独记录 cached / batch / fast token，因此只按普通输入/输出估算。
 * - BYOK 调用由用户自己付费，平台成本记 0，不走这里。
 * - 实际托管模型可能比 GPT-6 Astra 便宜；这里按最强模型价格做保守估算。
 */
export const HOSTED_AI_COST_MODEL = "gpt-6-astra";
export const HOSTED_AI_INPUT_USD_PER_1M = 10;
export const HOSTED_AI_OUTPUT_USD_PER_1M = 50;

export function estimateHostedAiCostUsd(
  inputTokens?: number,
  outputTokens?: number,
): string | undefined {
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  const cost =
    (inputTokens ?? 0) * HOSTED_AI_INPUT_USD_PER_1M / 1_000_000 +
    (outputTokens ?? 0) * HOSTED_AI_OUTPUT_USD_PER_1M / 1_000_000;
  return cost.toFixed(6);
}
