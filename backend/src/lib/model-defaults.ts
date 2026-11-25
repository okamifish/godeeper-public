const DEEPSEEK_DEFAULT_MODEL = "deepseek-flash";
const OPENAI_DEFAULT_MODEL = "gpt-4o";

/**
 * 用户没有显式填写模型名时的回退值。
 * DeepSeek 兼容接口不接受 gpt-4o，因此按 provider 或 Base URL 识别。
 */
export function resolveDefaultModel(provider?: string | null, baseUrl?: string | null): string {
  const haystack = `${provider ?? ""} ${baseUrl ?? ""}`.toLowerCase();
  if (haystack.includes("deepseek")) return DEEPSEEK_DEFAULT_MODEL;
  return OPENAI_DEFAULT_MODEL;
}
