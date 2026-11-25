import { t } from "@/lib/i18n";

/** 把后端 AI 错误码转成用户能看懂的一句话 */
export function aiErrorMessage(message: string, language: "zh" | "en"): string {
  if (message.includes("INSUFFICIENT_CREDITS")) return t("insufficientCredits", language);
  if (message.includes("AI_DAILY_LIMIT")) return t("aiDailyLimit", language);
  if (message.includes("AI_NOT_CONFIGURED")) return t("noModelsConfigured", language);
  if (message.includes("AI_SOCRATIC_INVALID")) return t("socraticInvalid", language);
  // 常见 SDK / 网关错误：统一转成可执行的中文提示，避免把英文原文抛给用户。
  if (/no output generated|empty (response|completion)|stream/i.test(message)) {
    return t("aiEmptyResponse", language);
  }
  if (/failed to fetch|fetch failed|econnrefused|network ?error|networkerror/i.test(message)) {
    return t("aiNetworkError", language);
  }
  if (/\b40[13]\b|unauthorized|invalid api key|incorrect api key|api key.*(invalid|missing)/i.test(message)) {
    return t("aiAuthError", language);
  }
  if (/\b404\b|model.*(not found|does not exist|not supported)/i.test(message)) {
    return t("aiModelNotFound", language);
  }
  return message;
}
