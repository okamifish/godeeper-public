import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { getDecryptedApiKey } from "../services/auth.service";
import { evaluateQuestionDepth, qualityMockStatus } from "../services/jev.service";
import type { Variables } from "../types";

/**
 * 问题深度判断（JEV）。
 * 只做认证，不要求用户配置 AI；BYOK 用户第一期跳过判断。
 * 所有非异常情况都返回 200，前端不需要处理错误态。
 */
const quality = new Hono<{ Variables: Variables }>();
quality.use("/*", authMiddleware);

const evaluateSchema = z.object({
  question: z.string().min(1).max(2000),
  context: z.string().max(4000).optional().default(""),
});

quality.post("/evaluate", zValidator("json", evaluateSchema), async (c) => {
  const user = c.get("user");
  const { question, context } = c.req.valid("json");

  // 第一期只支持平台托管 JEV；BYOK 自配 JEV 放第二期。
  // 联调 Mock 模式例外：BYOK 用户也返回固定结果，方便本地测试。
  if (!qualityMockStatus()) {
    const keyInfo = await getDecryptedApiKey(user.id);
    if (keyInfo) {
      return c.json({ status: "byok_not_supported", confidence: 0, model: "" });
    }
  }

  const verdict = await evaluateQuestionDepth({ userId: user.id, question, context });
  return c.json(verdict);
});

export default quality;
