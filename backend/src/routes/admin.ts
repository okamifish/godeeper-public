import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { adminMiddleware } from "../middleware/admin";
import type { Variables } from "../types";
import { db } from "../db";
import { users, canvases, nodes, canvasShares, aiUsage, taskRuns, modelConfigs, promptTemplates, plans, credits, creditTransactions, riskEvents } from "../db/schema";
import { eq, desc, sql, and, gte, like } from "drizzle-orm";
import { getRiskConfig, updateRiskConfig } from "../lib/settings";
import { PROMPT_CATALOG, PROMPT_CATALOG_BY_ID, SEED_PROMPTS, validatePromptContent } from "../prompts/catalog";
import { getEffectivePrompt } from "../prompts/resolver";
import {
  AiNotConfiguredError,
  previewPrompt,
  runPromptComparison,
  suggestPromptImprovement,
} from "../services/ai.service";

const admin = new Hono<{ Variables: Variables }>();

admin.use("/*", authMiddleware);
admin.use("/*", adminMiddleware);

// ─── Dashboard Stats (enhanced) ───

admin.get("/stats", async (c) => {
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [canvasCount] = await db.select({ count: sql<number>`count(*)` }).from(canvases);
  const [nodeCount] = await db.select({ count: sql<number>`count(*)` }).from(nodes);

  const today = new Date().toISOString().slice(0, 10);
  const [todayAi] = await db
    .select({ total: sql<number>`coalesce(count(*),0)` })
    .from(aiUsage)
    .where(eq(aiUsage.date, today));

  const [todayUsers] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(gte(users.createdAt, sql`current_date`));

  return c.json({
    users: userCount.count,
    canvases: canvasCount.count,
    nodes: nodeCount.count,
    todayAiCalls: todayAi.total,
    todayNewUsers: todayUsers.count,
  });
});

// 30-day trend (optionally 7/30/90 via ?days=)
admin.get("/stats/trend", async (c) => {
  const requested = parseInt(c.req.query("days") ?? "30");
  const days = Number.isFinite(requested) ? Math.min(90, Math.max(7, requested)) : 30;
  const rows = await db.execute(sql`
    SELECT d::date::text AS date,
      (SELECT count(*) FROM users WHERE date(created_at) = d) AS new_users,
      (SELECT count(*) FROM canvases WHERE date(created_at) = d) AS new_canvases,
      (SELECT count(*) FROM ai_usage WHERE ai_usage.date = d::text) AS ai_calls
    FROM generate_series(current_date - interval '1 day' * ${days - 1}, current_date, interval '1 day') d
    ORDER BY d
  `);
  return c.json(rows);
});

// Node kind distribution
admin.get("/stats/node-distribution", async (c) => {
  const rows = await db
    .select({ kind: nodes.kind, count: sql<number>`count(*)` })
    .from(nodes)
    .groupBy(nodes.kind);
  return c.json(rows);
});

// Recent 10 users
admin.get("/stats/recent-users", async (c) => {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      membership: users.membership,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(10);
  return c.json(rows);
});

// Top 5 canvases by node count
admin.get("/stats/top-canvases", async (c) => {
  const rows = await db
    .select({
      id: canvases.id,
      title: canvases.title,
      ownerEmail: users.email,
      nodeCount: canvases.nodeCount,
      updatedAt: canvases.updatedAt,
    })
    .from(canvases)
    .innerJoin(users, eq(canvases.userId, users.id))
    .orderBy(desc(canvases.nodeCount))
    .limit(5);
  return c.json(rows);
});

// ─── Users (enhanced) ───

admin.get("/users", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50");
  const offset = parseInt(c.req.query("offset") ?? "0");
  const search = c.req.query("search") ?? "";

  const conditions = search
    ? [like(users.email, `%${search}%`)]
    : [];

  const list = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      membership: users.membership,
      createdAt: users.createdAt,
      canvasCount: sql<number>`(SELECT count(*) FROM canvases WHERE canvases.user_id = users.id)`,
      nodeCount: sql<number>`(SELECT count(*) FROM nodes WHERE nodes.user_id = users.id)`,
      lastActiveAt: sql<string | null>`GREATEST(
        (SELECT max(updated_at) FROM canvases WHERE canvases.user_id = users.id),
        (SELECT max(created_at) FROM ai_usage WHERE ai_usage.user_id = users.id)
      )`,
    })
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const today = new Date().toISOString().slice(0, 10);
  const listWithAi = await Promise.all(
    list.map(async (u) => {
      const [row] = await db
        .select({ count: sql<number>`coalesce(count(*),0)` })
        .from(aiUsage)
        .where(and(eq(aiUsage.userId, u.id), eq(aiUsage.date, today)));
      return { ...u, todayAiCalls: row.count };
    })
  );

  return c.json(listWithAi);
});

admin.put("/users/:id/membership", async (c) => {
  const { membership } = await c.req.json();
  if (!["free", "pro", "team"].includes(membership)) {
    return c.json({ error: "Invalid membership" }, 400);
  }
  await db.update(users)
    .set({ membership, updatedAt: new Date() })
    .where(eq(users.id, c.req.param("id")));
  return c.json({ ok: true });
});

admin.delete("/users/:id", async (c) => {
  await db.delete(users).where(eq(users.id, c.req.param("id")));
  return c.json({ ok: true });
});

admin.get("/users/:id", async (c) => {
  const id = c.req.param("id");

  const [user] = await db.select({
    id: users.id, email: users.email, displayName: users.displayName,
    avatarUrl: users.avatarUrl, membership: users.membership,
    apiProvider: users.apiProvider, createdAt: users.createdAt, updatedAt: users.updatedAt,
    lastActiveAt: sql<string | null>`GREATEST(
      (SELECT max(updated_at) FROM canvases WHERE canvases.user_id = users.id),
      (SELECT max(created_at) FROM ai_usage WHERE ai_usage.user_id = users.id)
    )`,
  }).from(users).where(eq(users.id, id));
  if (!user) return c.json({ error: "Not found" }, 404);

  const [canvasCount] = await db.select({ count: sql<number>`count(*)` })
    .from(canvases).where(eq(canvases.userId, id));

  const [recentCanvasCount] = await db.select({ count: sql<number>`count(*)` })
    .from(canvases)
    .where(and(eq(canvases.userId, id), gte(canvases.createdAt, sql`current_date - interval '30 days'`)));

  const [nodeCount] = await db.select({ count: sql<number>`count(*)` })
    .from(nodes).where(eq(nodes.userId, id));

  const [aiTotal] = await db.select({ total: sql<number>`coalesce(count(*),0)` })
    .from(aiUsage).where(eq(aiUsage.userId, id));

  const today = new Date().toISOString().slice(0, 10);
  const [aiToday] = await db.select({ total: sql<number>`coalesce(count(*),0)` })
    .from(aiUsage).where(and(eq(aiUsage.userId, id), eq(aiUsage.date, today)));

  const [costRow] = await db.select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}),'0')` })
    .from(aiUsage).where(eq(aiUsage.userId, id));

  const [monthCostRow] = await db.select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}),'0')` })
    .from(aiUsage)
    .where(and(
      eq(aiUsage.userId, id),
      // ai_usage.date 是 text 类型，直接和 date_trunc 的 timestamp 比较会报类型错误
      sql`${aiUsage.date} >= to_char(date_trunc('month', current_date), 'YYYY-MM-DD')`,
    ));

  return c.json({
    ...user,
    stats: {
      canvases: canvasCount.count,
      canvasesRecent30: recentCanvasCount.count,
      nodes: nodeCount.count,
      aiTotal: aiTotal.total,
      aiToday: aiToday.total,
      totalCostUsd: costRow.total,
      monthCostUsd: monthCostRow.total,
    },
  });
});

admin.get("/users/:id/activity", async (c) => {
  const id = c.req.param("id");
  const limit = parseInt(c.req.query("limit") ?? "30");

  const recentCanvases = await db.select({ id: canvases.id, title: canvases.title, createdAt: canvases.createdAt })
    .from(canvases).where(eq(canvases.userId, id))
    .orderBy(desc(canvases.createdAt)).limit(10);

  const recentAi = await db.select({ feature: aiUsage.feature, model: aiUsage.model, costUsd: aiUsage.costUsd, createdAt: aiUsage.createdAt })
    .from(aiUsage).where(eq(aiUsage.userId, id))
    .orderBy(desc(aiUsage.createdAt)).limit(20);

  const recentRuns = await db.select({ taskId: taskRuns.taskId, model: taskRuns.model, status: taskRuns.status, durationMs: taskRuns.durationMs, errorMsg: taskRuns.errorMsg, createdAt: taskRuns.createdAt })
    .from(taskRuns).where(eq(taskRuns.userId, id))
    .orderBy(desc(taskRuns.createdAt)).limit(20);

  const activities = [
    ...recentCanvases.map((c) => ({ type: "canvas_created" as const, detail: c.title, createdAt: c.createdAt })),
    ...recentAi.map((a) => ({
      type: "ai_call" as const,
      detail: a.feature,
      model: a.model,
      costUsd: a.costUsd,
      createdAt: a.createdAt,
    })),
    ...recentRuns.map((r) => ({
      type: "task_run" as const,
      detail: r.taskId.slice(0, 8),
      status: r.status,
      model: r.model,
      durationMs: r.durationMs,
      errorMsg: r.errorMsg,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);

  return c.json(activities);
});

// ─── Canvases ───

admin.get("/canvases", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50");
  const offset = parseInt(c.req.query("offset") ?? "0");
  const search = c.req.query("search") ?? "";
  const isPublic = c.req.query("public");

  const conditions = [];
  if (search) conditions.push(like(users.email, `%${search}%`));
  if (isPublic !== undefined) conditions.push(eq(canvases.isPublic, isPublic === "true"));

  const rows = await db
    .select({
      id: canvases.id,
      title: canvases.title,
      ownerEmail: users.email,
      nodeCount: canvases.nodeCount,
      isPublic: canvases.isPublic,
      createdAt: canvases.createdAt,
      updatedAt: canvases.updatedAt,
      shareCount: sql<number>`(SELECT count(*) FROM canvas_shares WHERE canvas_shares.canvas_id = canvases.id)`,
    })
    .from(canvases)
    .innerJoin(users, eq(canvases.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(canvases.updatedAt))
    .limit(limit)
    .offset(offset);

  return c.json(rows);
});

admin.get("/canvases/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await db
    .select({
      id: canvases.id,
      title: canvases.title,
      ownerEmail: users.email,
      nodeCount: canvases.nodeCount,
      isPublic: canvases.isPublic,
      snapshot: canvases.snapshot,
      createdAt: canvases.createdAt,
      updatedAt: canvases.updatedAt,
    })
    .from(canvases)
    .innerJoin(users, eq(canvases.userId, users.id))
    .where(eq(canvases.id, id));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

admin.put("/canvases/:id", async (c) => {
  const { title, isPublic } = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (isPublic !== undefined) updates.isPublic = isPublic;
  await db.update(canvases)
    .set(updates)
    .where(eq(canvases.id, c.req.param("id")));
  return c.json({ ok: true });
});

admin.delete("/canvases/:id", async (c) => {
  await db.delete(canvases).where(eq(canvases.id, c.req.param("id")));
  return c.json({ ok: true });
});

admin.get("/canvases/:id/shares", async (c) => {
  const rows = await db
    .select({
      id: canvasShares.id,
      shareToken: canvasShares.shareToken,
      expiresAt: canvasShares.expiresAt,
      createdAt: canvasShares.createdAt,
    })
    .from(canvasShares)
    .where(eq(canvasShares.canvasId, c.req.param("id")));
  return c.json(rows);
});

// ─── AI Usage ───

admin.get("/ai-usage/overview", async (c) => {
  const today = new Date().toISOString().slice(0, 10);

  const [totalRow] = await db
    .select({ total: sql<number>`coalesce(count(*),0)` })
    .from(aiUsage);

  const [todayRow] = await db
    .select({ total: sql<number>`coalesce(count(*),0)` })
    .from(aiUsage)
    .where(eq(aiUsage.date, today));

  const [activeRow] = await db
    .select({ count: sql<number>`count(distinct ${aiUsage.userId})` })
    .from(aiUsage)
    .where(eq(aiUsage.date, today));

  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);

  return c.json({
    totalCalls: totalRow.total,
    todayCalls: todayRow.total,
    activeUsersToday: activeRow.count,
    avgPerUser: userCount.count > 0 ? Number((totalRow.total / userCount.count).toFixed(1)) : 0,
  });
});

admin.get("/ai-usage/trend", async (c) => {
  const rows = await db.execute(sql`
    SELECT d::date::text AS date,
      coalesce((SELECT count(*) FROM ai_usage WHERE ai_usage.date = d::text),0) AS calls
    FROM generate_series(current_date - interval '29 days', current_date, interval '1 day') d
    ORDER BY d
  `);
  return c.json(rows);
});

admin.get("/ai-usage/ranking", async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const limit = parseInt(c.req.query("limit") ?? "20");

  const rows = await db
    .select({
      email: users.email,
      membership: users.membership,
      todayCalls: sql<number>`coalesce((SELECT count(*) FROM ${aiUsage} WHERE ${aiUsage.userId} = ${users.id} AND ${aiUsage.date} = ${today}),0)`,
      totalCalls: sql<number>`coalesce((SELECT count(*) FROM ${aiUsage} WHERE ${aiUsage.userId} = ${users.id}),0)`,
    })
    .from(users)
    .orderBy(desc(sql`coalesce((SELECT count(*) FROM ${aiUsage} WHERE ${aiUsage.userId} = ${users.id}),0)`))
    .limit(limit);

  return c.json(rows);
});

admin.get("/ai-usage/quota-hit", async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const dailyLimit = 10;

  const [freeTotal] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.membership, "free"));

  const [hitTotal] = await db.execute(sql`
    SELECT count(*) AS count FROM users u
    WHERE u.membership = 'free'
    AND (SELECT count(*) FROM ai_usage au WHERE au.user_id = u.id AND au.date = ${today}) >= ${dailyLimit}
  `);

  // db.execute() 返回的每行就是记录对象，解构出的 hitTotal 已是第一行
  const hitCount = Number((hitTotal as unknown as Record<string, unknown>).count ?? 0);
  const freeCount = freeTotal.count;

  return c.json({
    freeUsers: freeCount,
    hitLimit: hitCount,
    hitRate: freeCount > 0 ? `${Math.round((hitCount / freeCount) * 100)}%` : "0%",
  });
});

// ─── AI Cost Breakdown ───

admin.get("/ai-usage/by-feature", async (c) => {
  const days = parseInt(c.req.query("days") ?? "30");
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const rows = await db
    .select({
      feature: aiUsage.feature,
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)`,
      costUsd: sql<string>`coalesce(sum(${aiUsage.costUsd}),'0')`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.date, since))
    .groupBy(aiUsage.feature);

  return c.json(rows);
});

admin.get("/ai-usage/by-model", async (c) => {
  const days = parseInt(c.req.query("days") ?? "30");
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const rows = await db
    .select({
      model: aiUsage.model,
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)`,
      costUsd: sql<string>`coalesce(sum(${aiUsage.costUsd}),'0')`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.date, since))
    .groupBy(aiUsage.model);

  return c.json(rows);
});

// ─── Task Runs ───

admin.get("/task-runs", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50");
  const offset = parseInt(c.req.query("offset") ?? "0");
  const status = c.req.query("status");
  const model = c.req.query("model");

  const conditions = [];
  if (status) conditions.push(eq(taskRuns.status, status));
  if (model) conditions.push(eq(taskRuns.model, model));

  const rows = await db
    .select({
      id: taskRuns.id,
      taskId: taskRuns.taskId,
      email: users.email,
      model: taskRuns.model,
      inputTokens: taskRuns.inputTokens,
      outputTokens: taskRuns.outputTokens,
      durationMs: taskRuns.durationMs,
      status: taskRuns.status,
      errorMsg: taskRuns.errorMsg,
      createdAt: taskRuns.createdAt,
    })
    .from(taskRuns)
    .innerJoin(users, eq(taskRuns.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(taskRuns.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json(rows);
});

// ─── Model Configs ───

admin.get("/models", async (c) => {
  const rows = await db.select().from(modelConfigs).orderBy(desc(modelConfigs.createdAt));
  return c.json(rows);
});

admin.post("/models", async (c) => {
  const body = await c.req.json();
  const row = await db.insert(modelConfigs).values({
    name: body.name,
    provider: body.provider ?? "openrouter",
    modelName: body.modelName,
    inputPricePer1k: body.inputPricePer1k,
    outputPricePer1k: body.outputPricePer1k,
    enabled: body.enabled ?? true,
    allowedPlans: body.allowedPlans,
  }).returning();
  return c.json(row[0], 201);
});

admin.put("/models/:id", async (c) => {
  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["name", "provider", "modelName", "inputPricePer1k", "outputPricePer1k", "enabled", "allowedPlans"]) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  await db.update(modelConfigs).set(updates).where(eq(modelConfigs.id, c.req.param("id")));
  return c.json({ ok: true });
});

admin.delete("/models/:id", async (c) => {
  await db.delete(modelConfigs).where(eq(modelConfigs.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ─── Prompt Templates ───

const MAX_PROMPT_LENGTH = 20_000;
const MAX_TEST_INPUT_LENGTH = 8_000;
const MAX_TEST_OUTPUT_LENGTH = 4_000;

function promptValidationError(id: string, content: unknown): string | null {
  if (typeof content !== "string" || content.trim().length === 0) {
    return "提示词正文不能为空";
  }
  if (content.length > MAX_PROMPT_LENGTH) {
    return `提示词正文不能超过 ${MAX_PROMPT_LENGTH} 字符`;
  }
  const result = validatePromptContent(id, content);
  if (!result.ok) {
    const parts: string[] = [];
    if (result.missing.length) {
      parts.push(`缺少必填变量：${result.missing.map((name) => `{{${name}}}`).join("、")}`);
    }
    if (result.unknown.length) {
      parts.push(`出现未声明变量：${result.unknown.map((name) => `{{${name}}}`).join("、")}`);
    }
    return parts.join("；") || "该提示词不在目录中";
  }
  return null;
}

async function hasPromptOverride(feature: string, excludeId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: promptTemplates.id })
    .from(promptTemplates)
    .where(eq(promptTemplates.feature, feature));
  return rows.some((row) => row.id !== excludeId);
}

function mapPromptServiceError(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof AiNotConfiguredError) {
    return {
      status: 400,
      body: {
        error: "AI_NOT_CONFIGURED",
        message: "当前没有可用的模型凭据：管理员未配置 API Key，服务端也未配置托管 AI。",
      },
    };
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message === "USER_TEMPLATE_NOT_RUNNABLE") {
    return {
      status: 400,
      body: { error: message, message: "用户消息模板只能预览，不能单独交给模型运行。" },
    };
  }
  if (message.startsWith("UNKNOWN_PROMPT_TEMPLATE")) {
    return { status: 400, body: { error: "UNKNOWN_PROMPT_TEMPLATE", message: "提示词不存在。" } };
  }
  if (message.startsWith("MISSING_PROMPT_VARIABLE")) {
    return { status: 400, body: { error: message, message: "预览缺少模板变量。" } };
  }
  return { status: 500, body: { error: "PROMPT_TEST_FAILED", message } };
}

admin.get("/prompts", async (c) => {
  const feature = c.req.query("feature");
  const conditions = feature ? [eq(promptTemplates.feature, feature)] : [];

  let rows = await db.select().from(promptTemplates)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(promptTemplates.createdAt));

  // Auto-seed defaults when DB is empty
  if (rows.length === 0 && !feature) {
    await db.insert(promptTemplates).values(SEED_PROMPTS);
    rows = await db.select().from(promptTemplates).orderBy(desc(promptTemplates.createdAt));
  }

  return c.json(rows);
});

// 只读：提示词目录与调用位置，供后台调试时对照
admin.get("/prompts/catalog", async (c) => {
  return c.json(PROMPT_CATALOG);
});

// 单条生效版本：后台覆盖优先，否则代码默认
admin.get("/prompts/effective", async (c) => {
  const feature = c.req.query("feature");
  if (!feature) return c.json({ error: "缺少 feature 参数" }, 400);
  try {
    return c.json(await getEffectivePrompt(feature));
  } catch {
    return c.json({ error: "UNKNOWN_PROMPT_TEMPLATE", message: "提示词不存在。" }, 400);
  }
});

// 预览最终系统提示词与用户消息，不调用模型
admin.post("/prompts/preview", async (c) => {
  const body = await c.req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id || !PROMPT_CATALOG_BY_ID[id]) {
    return c.json({ error: "UNKNOWN_PROMPT_TEMPLATE", message: "提示词不存在。" }, 400);
  }

  const content = typeof body?.content === "string" ? body.content : undefined;
  if (content !== undefined) {
    const validationError = promptValidationError(id, content);
    if (validationError) return c.json({ error: "INVALID_PROMPT", message: validationError }, 400);
  }

  try {
    const preview = await previewPrompt({
      id,
      content,
      variables: body?.variables,
      taskType: body?.taskType,
      input: typeof body?.input === "string" ? body.input.slice(0, MAX_TEST_INPUT_LENGTH) : undefined,
      context: Array.isArray(body?.context) ? body.context.slice(0, 10) : undefined,
    });
    return c.json(preview);
  } catch (error) {
    const mapped = mapPromptServiceError(error);
    return c.json(mapped.body, mapped.status as any);
  }
});

// 测试台：同一输入分别跑已保存版本（A）与草稿（B）
admin.post("/prompts/test", async (c) => {
  const body = await c.req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id || !PROMPT_CATALOG_BY_ID[id]) {
    return c.json({ error: "UNKNOWN_PROMPT_TEMPLATE", message: "提示词不存在。" }, 400);
  }
  if (typeof body?.input !== "string" || body.input.trim().length === 0) {
    return c.json({ error: "INVALID_INPUT", message: "测试内容不能为空。" }, 400);
  }
  if (body.input.length > MAX_TEST_INPUT_LENGTH) {
    return c.json({ error: "INVALID_INPUT", message: `测试内容不能超过 ${MAX_TEST_INPUT_LENGTH} 字符。` }, 400);
  }

  for (const key of ["contentA", "contentB"] as const) {
    if (body[key] !== undefined) {
      const validationError = promptValidationError(id, body[key]);
      if (validationError) {
        return c.json({ error: "INVALID_PROMPT", message: `${key === "contentA" ? "A" : "B"} 路正文无效：${validationError}` }, 400);
      }
    }
  }

  try {
    const effective = await getEffectivePrompt(id);
    const result = await runPromptComparison(c.get("user").id, {
      id,
      contentA: typeof body.contentA === "string" ? body.contentA : effective.content,
      contentB: typeof body.contentB === "string" ? body.contentB : (typeof body.contentA === "string" ? body.contentA : effective.content),
      input: body.input,
      context: Array.isArray(body.context)
        ? body.context.filter((item: unknown) => typeof item === "string").slice(0, 10)
        : undefined,
      variables: body.variables && typeof body.variables === "object" ? body.variables : undefined,
      taskType: typeof body.taskType === "string" ? body.taskType : undefined,
      model: typeof body.model === "string" ? body.model.slice(0, 200) : undefined,
    });
    return c.json(result);
  } catch (error) {
    const mapped = mapPromptServiceError(error);
    return c.json(mapped.body, mapped.status as any);
  }
});

// AI 优化建议：问题清单 + 完整改写
admin.post("/prompts/suggest", async (c) => {
  const body = await c.req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id || !PROMPT_CATALOG_BY_ID[id]) {
    return c.json({ error: "UNKNOWN_PROMPT_TEMPLATE", message: "提示词不存在。" }, 400);
  }
  const validationError = promptValidationError(id, body?.content);
  if (validationError) return c.json({ error: "INVALID_PROMPT", message: validationError }, 400);

  try {
    const suggestion = await suggestPromptImprovement(c.get("user").id, {
      id,
      content: body.content,
      input: typeof body.input === "string" ? body.input.slice(0, MAX_TEST_INPUT_LENGTH) : undefined,
      taskType: typeof body.taskType === "string" ? body.taskType : undefined,
      model: typeof body.model === "string" ? body.model.slice(0, 200) : undefined,
      resultA: typeof body.resultA === "string" ? body.resultA.slice(0, MAX_TEST_OUTPUT_LENGTH) : undefined,
      resultB: typeof body.resultB === "string" ? body.resultB.slice(0, MAX_TEST_OUTPUT_LENGTH) : undefined,
    });
    return c.json(suggestion);
  } catch (error) {
    const mapped = mapPromptServiceError(error);
    return c.json(mapped.body, mapped.status as any);
  }
});

admin.post("/prompts", async (c) => {
  const body = await c.req.json().catch(() => null);
  const feature = typeof body?.feature === "string" ? body.feature : "";
  if (!feature || !PROMPT_CATALOG_BY_ID[feature]) {
    return c.json({ error: "UNKNOWN_PROMPT_TEMPLATE", message: "请选择目录中的提示词。" }, 400);
  }
  const validationError = promptValidationError(feature, body?.content);
  if (validationError) return c.json({ error: "INVALID_PROMPT", message: validationError }, 400);
  if (await hasPromptOverride(feature)) {
    return c.json({ error: "DUPLICATE_PROMPT_FEATURE", message: "该提示词已有后台覆盖版本，请编辑现有版本。" }, 400);
  }

  const definition = PROMPT_CATALOG_BY_ID[feature];
  const row = await db.insert(promptTemplates).values({
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : definition.name,
    content: body.content,
    feature,
    enabled: body.enabled ?? true,
  }).returning();
  return c.json(row[0], 201);
});

admin.put("/prompts/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  const id = c.req.param("id");
  const [existing] = await db
    .select({ feature: promptTemplates.feature, content: promptTemplates.content })
    .from(promptTemplates)
    .where(eq(promptTemplates.id, id))
    .limit(1);
  if (!existing) return c.json({ error: "PROMPT_NOT_FOUND", message: "覆盖版本不存在。" }, 404);

  const nextFeature = typeof body?.feature === "string" ? body.feature : existing.feature;
  if (!PROMPT_CATALOG_BY_ID[nextFeature]) {
    return c.json({ error: "UNKNOWN_PROMPT_TEMPLATE", message: "目标提示词不在目录中。" }, 400);
  }
  if (nextFeature !== existing.feature && await hasPromptOverride(nextFeature, id)) {
    return c.json({ error: "DUPLICATE_PROMPT_FEATURE", message: "该提示词已有后台覆盖版本。" }, 400);
  }

  const nextContent = body?.content !== undefined ? body.content : existing.content;
  const validationError = promptValidationError(nextFeature, nextContent);
  if (validationError) return c.json({ error: "INVALID_PROMPT", message: validationError }, 400);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body?.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (body?.content !== undefined) {
    updates.content = body.content;
    updates.version = sql`${promptTemplates.version} + 1`;
  }
  if (nextFeature !== existing.feature) updates.feature = nextFeature;
  if (body?.enabled !== undefined) updates.enabled = Boolean(body.enabled);
  await db.update(promptTemplates).set(updates).where(eq(promptTemplates.id, id));
  return c.json({ ok: true });
});

admin.delete("/prompts/:id", async (c) => {
  await db.delete(promptTemplates).where(eq(promptTemplates.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ─── Dashboard Enhancement ───

admin.get("/stats/enhanced", async (c) => {
  const today = new Date().toISOString().slice(0, 10);

  // DAU: users with AI calls today
  const [dau] = await db.select({ count: sql<number>`count(distinct ${aiUsage.userId})` })
    .from(aiUsage).where(eq(aiUsage.date, today));

  // Depth Score: task_nodes*3 + result_nodes*1 + non_auto_edges*2
  const [depth] = await db.execute(sql`
    SELECT coalesce(
      (SELECT count(*) FROM nodes WHERE kind = 'task') * 3 +
      (SELECT count(*) FROM nodes WHERE kind = 'result') * 1 +
      (SELECT count(*) * 2 FROM node_links WHERE is_auto = false), 0
    ) AS score
  `);
  const depthScore = Number((depth as unknown as Record<string, unknown>).score ?? 0);

  // Today AI cost
  const [costRow] = await db.select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}),'0')` })
    .from(aiUsage).where(eq(aiUsage.date, today));
  const todayCostUsd = Number(costRow.total).toFixed(4);

  // Heavy users count (>20 calls today)
  const [heavyCount] = await db.execute(sql`
    SELECT count(*) AS cnt FROM (
      SELECT user_id FROM ai_usage WHERE date = ${today}
      GROUP BY user_id HAVING count(*) > 20
    ) sub
  `);

  // Failed tasks count today
  const [failCount] = await db.select({ count: sql<number>`count(*)` })
    .from(taskRuns).where(and(eq(taskRuns.status, "failed"), gte(taskRuns.createdAt, sql`CURRENT_DATE`)));

  // Open risk alerts count
  const [alertCount] = await db.select({ count: sql<number>`count(*)` })
    .from(riskEvents).where(eq(riskEvents.status, "open"));

  return c.json({
    dau: dau.count,
    depthScore,
    todayCostUsd,
    heavyUsers: Number((heavyCount as unknown as Record<string, unknown>).cnt ?? 0),
    failedTasks: failCount.count,
    riskAlerts: alertCount.count,
  });
});

// ─── Plans CRUD ───

admin.get("/plans", async (c) => {
  const rows = await db.select().from(plans).orderBy(plans.name);
  return c.json(rows);
});

admin.post("/plans", async (c) => {
  const body = await c.req.json();
  const row = await db.insert(plans).values({
    name: body.name, priceCents: body.priceCents ?? 0,
    canvasesLimit: body.canvasesLimit ?? 3, nodesPerCanvas: body.nodesPerCanvas ?? 50,
    aiTasksPerDay: body.aiTasksPerDay ?? 10, isUnlimited: body.isUnlimited ?? false,
    stripePriceId: body.stripePriceId,
  }).returning();
  return c.json(row[0], 201);
});

admin.put("/plans/:id", async (c) => {
  const body = await c.req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["name", "priceCents", "canvasesLimit", "nodesPerCanvas", "aiTasksPerDay", "isUnlimited", "stripePriceId"]) {
    if (body[k] !== undefined) updates[k] = body[k];
  }
  await db.update(plans).set(updates).where(eq(plans.id, c.req.param("id")));
  return c.json({ ok: true });
});

// ─── Credits ───

admin.post("/users/:id/adjust-credits", async (c) => {
  const body = await c.req.json();
  const userId = c.req.param("id");
  const feature = body.feature as keyof typeof credits.$inferInsert;
  const amount = body.amount as number;
  const reason = body.reason as string | undefined;

  // Upsert credits
  const [existing] = await db.select().from(credits).where(eq(credits.userId, userId));
  if (existing) {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (feature in existing) updates[feature] = sql`${credits[feature]} + ${amount}`;
    await db.update(credits).set(updates).where(eq(credits.userId, userId));
  } else {
    await db.insert(credits).values({ userId, [feature]: amount });
  }

  await db.insert(creditTransactions).values({ userId, feature: String(feature), amount, reason });
  return c.json({ ok: true });
});

admin.get("/users/:id/credits", async (c) => {
  const [row] = await db.select().from(credits).where(eq(credits.userId, c.req.param("id")));
  return c.json(row ?? { userId: c.req.param("id"), taskRun: 0, inspire: 0, summary: 0 });
});

admin.get("/risk-config", async (c) => {
  const config = await getRiskConfig();
  return c.json({ config, updatedAt: null });
});

admin.put("/risk-config", async (c) => {
  const body = await c.req.json();
  const config = await updateRiskConfig(body);
  return c.json({ config, updatedAt: new Date().toISOString() });
});

// ─── Risk Events ───

admin.get("/risk/events", async (c) => {
  const status = c.req.query("status");
  const conditions = status ? [eq(riskEvents.status, status)] : [];
  const rows = await db.select({
    id: riskEvents.id, userId: riskEvents.userId, email: users.email, eventType: riskEvents.eventType,
    detail: riskEvents.detail, status: riskEvents.status, createdAt: riskEvents.createdAt,
  }).from(riskEvents)
    .innerJoin(users, eq(riskEvents.userId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(riskEvents.createdAt)).limit(50);
  return c.json(rows);
});

admin.put("/risk/events/:id", async (c) => {
  const { status } = await c.req.json();
  await db.update(riskEvents).set({ status }).where(eq(riskEvents.id, c.req.param("id")));
  return c.json({ ok: true });
});

admin.get("/risk/alerts", async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  // Users with >20 AI calls today
  const heavy = await db.execute(sql`
    SELECT u.email, count(*) AS calls
    FROM ai_usage au JOIN users u ON u.id = au.user_id
    WHERE au.date = ${today} GROUP BY u.email HAVING count(*) > 20 ORDER BY calls DESC
  `);
  // Failed tasks in last hour
  const [failCount] = await db.select({ count: sql<number>`count(*)` })
    .from(taskRuns).where(and(eq(taskRuns.status, "failed"), gte(taskRuns.createdAt, sql`now() - interval '1 hour'`)));
  return c.json({ heavyUsers: heavy as unknown as Record<string, unknown>[], recentFailCount: failCount.count });
});

export default admin;
