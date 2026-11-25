import type { Context, Next } from "hono";
import { getDecryptedApiKey } from "../services/auth.service";
import { resolveDefaultModel } from "../lib/model-defaults";

/**
 * MVP 使用 BYOK：没有配置模型 Key 的账号不允许调用 AI 接口，
 * 避免后端静默回退到默认模型（用户会以为自己的配置生效了）。
 */
export async function requireAiConfig(c: Context, next: Next) {
  const user = c.get("user");
  const keyInfo = await getDecryptedApiKey(user.id);
  if (keyInfo) {
    c.set("aiModel", keyInfo.modelName || resolveDefaultModel(keyInfo.provider, keyInfo.baseUrl));
    await next();
    return;
  }

  // 托管 AI：用户没有 BYOK 时，服务端 Key 可用则允许调用（会扣 credits）。
  if (process.env.HOSTED_AI_API_KEY) {
    c.set(
      "aiModel",
      process.env.HOSTED_AI_MODEL
        || resolveDefaultModel(process.env.HOSTED_AI_PROVIDER ?? "openai", process.env.HOSTED_AI_BASE_URL),
    );
    await next();
    return;
  }

  return c.json({
    error: "AI_NOT_CONFIGURED",
    message: "Please configure your own AI model in Settings before running AI tasks.",
  }, 400);
}
