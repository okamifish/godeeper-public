import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Variables } from "../types";
import * as authService from "../services/auth.service";
import { authMiddleware } from "../middleware/auth";
import { getPlanSnapshot } from "../middleware/membership";
import { capabilitiesFor } from "../lib/capabilities";
import { isSafeBaseUrl } from "../lib/base-url";

const auth = new Hono<{ Variables: Variables }>();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const apiKeySchema = z.object({
  apiKey: z.string().min(1),
  provider: z.enum(["openrouter", "openai", "anthropic", "siliconflow", "custom"]).default("openrouter"),
  baseUrl: z.string().refine((value) => isSafeBaseUrl(value), { message: "Invalid baseUrl" }).optional(),
  modelName: z.string().min(1).max(120).optional(),
});

auth.post("/register", zValidator("json", registerSchema), async (c) => {
  const { email, password, displayName } = c.req.valid("json");
  try {
    const result = await authService.register(email, password, displayName);
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed";
    if (message === "ACCOUNT_DELETED") {
      return c.json({
        error: "This email belongs to a disabled account. Contact an administrator to restore it within 30 days.",
      }, 409);
    }
    if (/already|registered|exists/i.test(message)) {
      return c.json({ error: "This email is already registered" }, 409);
    }
    return c.json({ error: "Unable to create account. Check your email and password." }, 400);
  }
});

auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  try {
    const result = await authService.login(email, password);
    return c.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "ACCOUNT_DELETED") {
      return c.json({ error: "This account has been disabled" }, 403);
    }
    // 不区分「邮箱不存在」与「密码错误」，避免账号探测
    return c.json({ error: "Email or password is incorrect" }, 401);
  }
});

auth.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  const fullUser = await authService.getUser(user.id);
  // 能力列表由服务端计算，前端只负责按能力渲染，不自己推断会员权限。
  return c.json({
    ...fullUser,
    capabilities: capabilitiesFor(fullUser?.membership ?? user.membership),
  });
});
auth.get("/me/plan", authMiddleware, async (c) => {
  const user = c.get("user");
  const snapshot = await getPlanSnapshot(user.id, user.membership);
  return c.json(snapshot);
});
auth.put("/api-key", authMiddleware, zValidator("json", apiKeySchema), async (c) => {
  const user = c.get("user");
  const { apiKey, provider, baseUrl, modelName } = c.req.valid("json");
  await authService.updateApiKey(user.id, apiKey, provider, baseUrl, modelName);
  return c.json({ ok: true });
});

auth.post("/logout", authMiddleware, async (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.slice(7);
  if (token) {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
    await supabase.auth.admin.signOut(token);
  }
  return c.json({ ok: true });
});

export default auth;
