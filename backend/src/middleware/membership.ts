import type { Context, Next } from "hono";
import { db } from "../db";
import { canvases, nodes, aiUsage, plans, users, credits, creditTransactions } from "../db/schema";
import { eq, and, sql, inArray, gte, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { estimateHostedAiCostUsd } from "../lib/pricing";
import { normalizePlanLimits, type PlanLimits } from "../lib/plan-limits";
import { capabilitiesFor, type CapabilityId } from "../lib/capabilities";

async function getLimits(membership: string): Promise<PlanLimits> {
  const [row] = await db.select().from(plans).where(eq(plans.name, membership)).limit(1);
  if (row) {
    return normalizePlanLimits(row);
  }

  // 套餐没 seed 时仍能工作，但会记录告警，方便发现部署遗漏
  console.warn(`[membership] No plan row for "${membership}", using fallback limits`);
  const FALLBACKS: Record<string, PlanLimits> = {
    free: { canvases: 1, nodesPerCanvas: Infinity, aiTasksPerDay: 10 },
    pro: { canvases: Infinity, nodesPerCanvas: 500, aiTasksPerDay: Infinity },
    team: { canvases: Infinity, nodesPerCanvas: 500, aiTasksPerDay: Infinity },
  };
  return FALLBACKS[membership] ?? FALLBACKS.free;
}

/**
 * 额度统一以 plans 表为准。
 * free 的“1 张云画布、节点不限、每日 10 次”由 seed/后台配置表达，不再在代码里覆盖。
 */
async function getEffectiveLimits(membership: string): Promise<PlanLimits> {
  return getLimits(membership);
}

export interface PlanSnapshot {
  membership: string;
  capabilities: CapabilityId[];
  limits: {
    canvases: number | null;
    nodesPerCanvas: number | null;
    aiTasksPerDay: number | null;
  };
  usage: {
    canvases: number;
    aiTasksToday: number;
  };
  credits: {
    taskRun: number;
    inspire: number;
    summary: number;
  };
  byok: {
    configured: boolean;
    dailyAiUnlimited: boolean;
  };
}

function serializeLimit(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

/** 用户侧只读方案/额度快照；不扣任何额度 */
export async function getPlanSnapshot(userId: string, membership: string): Promise<PlanSnapshot> {
  const limits = await getEffectiveLimits(membership);
  const date = today();

  const [canvasRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(canvases)
    .where(and(eq(canvases.userId, userId), isNull(canvases.deletedAt)));
  const [aiRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiUsage)
    .where(and(
      eq(aiUsage.userId, userId),
      eq(aiUsage.date, date),
      sql`${aiUsage.status} <> 'failed'`,
    ));
  const [creditRow] = await db.select().from(credits).where(eq(credits.userId, userId));
  const [userRow] = await db
    .select({ hasApiKey: sql<boolean>`(${users.apiKeyEnc} is not null)` })
    .from(users)
    .where(eq(users.id, userId));

  const byok = Boolean(userRow?.hasApiKey);

  return {
    membership,
    capabilities: capabilitiesFor(membership),
    limits: {
      canvases: serializeLimit(limits.canvases),
      nodesPerCanvas: serializeLimit(limits.nodesPerCanvas),
      aiTasksPerDay: byok ? null : serializeLimit(limits.aiTasksPerDay),
    },
    usage: {
      canvases: Number(canvasRow?.count ?? 0),
      aiTasksToday: Number(aiRow?.count ?? 0),
    },
    credits: {
      taskRun: creditRow?.taskRun ?? 0,
      inspire: creditRow?.inspire ?? 0,
      summary: creditRow?.summary ?? 0,
    },
    byok: {
      configured: byok,
      dailyAiUnlimited: byok,
    },
  };
}

export interface AiUsageRecord {
  feature?: "task" | "inspire" | "source" | "summary" | "expand" | "critique" | "concept" | "socratic";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: string;
}

export interface AiUsageReservation {
  allowed: boolean;
  current: number;
  limit: number;
  reservationId?: string;
  reason?: "daily_limit" | "insufficient_credits";
}

/** 托管 AI 的 feature → credits 余额桶 */
const CREDIT_BUCKET_BY_FEATURE: Record<string, "taskRun" | "inspire" | "summary"> = {
  task: "taskRun",
  source: "taskRun",
  expand: "taskRun",
  inspire: "inspire",
  summary: "summary",
  // 对抗性反驳与启发同属“挑战当前思考”，暂复用 inspire 桶；不新增 schema。
  critique: "inspire",
  // 概念解释属于“理解当前思考”，同样暂复用 inspire 桶。
  concept: "inspire",
  // 苏格拉底追问与启发同属“推动思考”，暂复用 inspire 桶。
  socratic: "inspire",
};

export function creditBucketForFeature(feature: string): "taskRun" | "inspire" | "summary" {
  return CREDIT_BUCKET_BY_FEATURE[feature] ?? "taskRun";
}

export function aiUsageFailure(usage: AiUsageReservation): {
  status: 402 | 429;
  body: { error: string; message: string };
} {
  if (usage.reason === "insufficient_credits") {
    return {
      status: 402,
      body: {
        error: "INSUFFICIENT_CREDITS",
        message: "Not enough credits for hosted AI. Configure your own API key or top up credits.",
      },
    };
  }
  return {
    status: 429,
    body: {
      error: "AI_DAILY_LIMIT",
      message: `AI task limit reached (${usage.limit}/day)`,
    },
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkCanvasLimit(c: Context, next: Next) {
  const user = c.get("user");
  const limit = await getEffectiveLimits(user.membership);

  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(canvases)
    .where(and(eq(canvases.userId, user.id), isNull(canvases.deletedAt)));

  if (Number(result.count) >= limit.canvases) {
    return c.json({ error: `Canvas limit reached (${limit.canvases})` }, 403);
  }
  await next();
}

/**
 * 节点限额按「保存后最终数量」判断：
 * - 普通保存：已有数量 + 本次新增 id 数
 * - replace=true：以本次提交的 id 集合为准（旧节点会被删除）
 */
export async function checkNodeLimit(
  canvasId: string,
  userId: string,
  membership: string,
  incoming?: { upsertIds: string[]; replace: boolean },
) {
  const limit = await getEffectiveLimits(membership);
  if (limit.nodesPerCanvas === Infinity) return;

  const [result] = await db.select({ count: sql<number>`count(*)` })
    .from(nodes)
    .where(and(eq(nodes.canvasId, canvasId), eq(nodes.userId, userId)));
  const current = Number(result?.count ?? 0);

  let projected = current;
  if (incoming) {
    const ids = Array.from(new Set(incoming.upsertIds));
    if (incoming.replace) {
      projected = ids.length;
    } else if (ids.length > 0) {
      const existing = await db.select({ id: nodes.id })
        .from(nodes)
        .where(and(
          eq(nodes.canvasId, canvasId),
          eq(nodes.userId, userId),
          inArray(nodes.id, ids),
        ));
      const existingIds = new Set(existing.map((row) => row.id));
      projected = current + ids.filter((id) => !existingIds.has(id)).length;
    }
  }

  return {
    allowed: projected <= limit.nodesPerCanvas,
    current,
    projected,
    limit: limit.nodesPerCanvas,
  };
}

/**
 * 原子占位：先拿用户级 advisory lock，再数当日次数并插入占位行。
 * 并发请求会被串行化，不会出现「同时通过、超出上限」。
 * 失败调用由 releaseAiUsage 删除占位（决策：AI 失败不消耗额度）。
 */
export async function checkAndIncrementAiUsage(
  userId: string,
  membership: string,
  record?: AiUsageRecord,
): Promise<AiUsageReservation> {
  const limit = await getEffectiveLimits(membership);
  const [userRow] = await db
    .select({ hasApiKey: sql<boolean>`(${users.apiKeyEnc} is not null)` })
    .from(users)
    .where(eq(users.id, userId));
  const byok = Boolean(userRow?.hasApiKey);
  const feature = record?.feature ?? "task";
  const bucket = creditBucketForFeature(feature);
  const date = today();
  const reservationId = randomUUID();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId})::bigint)`);

    const [row] = await tx
      .select({ total: sql<number>`count(*)` })
      .from(aiUsage)
      .where(and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.date, date),
        sql`${aiUsage.status} <> 'failed'`,
      ));

    const current = Number(row?.total ?? 0);
    // BYOK 不占每日 AI 次数，也不扣 credits。
    if (!byok && limit.aiTasksPerDay !== Infinity && current >= limit.aiTasksPerDay) {
      return { allowed: false, current, limit: limit.aiTasksPerDay, reason: "daily_limit" as const };
    }

    if (!byok) {
      // 托管 AI：先原子扣 1 个 credit；余额不足则不产生占位。
      let balance: number | undefined;
      if (bucket === "taskRun") {
        const [updated] = await tx.update(credits)
          .set({ taskRun: sql`${credits.taskRun} - 1` })
          .where(and(eq(credits.userId, userId), gte(credits.taskRun, 1)))
          .returning({ balance: credits.taskRun });
        balance = updated?.balance;
      } else if (bucket === "inspire") {
        const [updated] = await tx.update(credits)
          .set({ inspire: sql`${credits.inspire} - 1` })
          .where(and(eq(credits.userId, userId), gte(credits.inspire, 1)))
          .returning({ balance: credits.inspire });
        balance = updated?.balance;
      } else {
        const [updated] = await tx.update(credits)
          .set({ summary: sql`${credits.summary} - 1` })
          .where(and(eq(credits.userId, userId), gte(credits.summary, 1)))
          .returning({ balance: credits.summary });
        balance = updated?.balance;
      }

      if (balance === undefined) {
        return { allowed: false, current, limit: limit.aiTasksPerDay, reason: "insufficient_credits" as const };
      }

      await tx.insert(creditTransactions).values({
        userId,
        feature,
        amount: -1,
        reason: `reserve:${reservationId}`,
      });
    }

    await tx.insert(aiUsage).values({
      id: reservationId,
      userId,
      date,
      feature,
      model: record?.model,
      status: "reserved",
      inputTokens: record?.inputTokens,
      outputTokens: record?.outputTokens,
      // 托管：先占位为 null，成功后再按 token 估算成本；BYOK：平台成本固定为 0。
      costUsd: byok ? "0" : (record?.costUsd ?? null),
    });

    return {
      allowed: true,
      current: current + 1,
      limit: byok ? Infinity : limit.aiTasksPerDay,
      reservationId,
    };
  });
}

export async function markAiUsageSuccess(reservationId: string, usage?: {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: string;
}) {
  const [row] = await db
    .select({ costUsd: aiUsage.costUsd })
    .from(aiUsage)
    .where(eq(aiUsage.id, reservationId))
    .limit(1);

  // 只有托管占位（null）才按最强模型价格估算；BYOK 占位是 "0"，不估算。
  const estimated = row?.costUsd === null
    ? estimateHostedAiCostUsd(usage?.inputTokens, usage?.outputTokens)
    : undefined;
  const costUsd = usage?.costUsd ?? estimated;

  await db.update(aiUsage)
    .set({
      status: "success",
      ...(usage?.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage?.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
      ...(costUsd !== undefined ? { costUsd } : {}),
    })
    .where(eq(aiUsage.id, reservationId));
}

/** 失败时删除占位，并退还托管 AI 已预扣的 1 个 credit（幂等） */
export async function releaseAiUsage(reservationId: string) {
  await db.transaction(async (tx) => {
    const reserveReason = `reserve:${reservationId}`;
    const refundReason = `refund:${reservationId}`;
    const [charge] = await tx
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.reason, reserveReason))
      .limit(1);
    const [refunded] = await tx
      .select({ id: creditTransactions.id })
      .from(creditTransactions)
      .where(eq(creditTransactions.reason, refundReason))
      .limit(1);

    if (charge && !refunded) {
      const bucket = creditBucketForFeature(charge.feature);
      if (bucket === "taskRun") {
        await tx.update(credits)
          .set({ taskRun: sql`${credits.taskRun} + 1` })
          .where(eq(credits.userId, charge.userId));
      } else if (bucket === "inspire") {
        await tx.update(credits)
          .set({ inspire: sql`${credits.inspire} + 1` })
          .where(eq(credits.userId, charge.userId));
      } else {
        await tx.update(credits)
          .set({ summary: sql`${credits.summary} + 1` })
          .where(eq(credits.userId, charge.userId));
      }
      await tx.insert(creditTransactions).values({
        userId: charge.userId,
        feature: charge.feature,
        amount: 1,
        reason: refundReason,
      });
    }

    await tx.delete(aiUsage).where(eq(aiUsage.id, reservationId));
  });
}

/**
 * 执行 AI 调用并结算占位：
 * - 成功：标记 success
 * - 抛错：删除占位（决策 9：失败不消耗额度），再把错误抛给调用方
 */
export async function completeAiUsage<T>(
  reservationId: string | undefined,
  run: () => Promise<T>,
  usage?: () => { inputTokens?: number; outputTokens?: number; costUsd?: string } | undefined,
): Promise<T> {
  try {
    const value = await run();
    if (reservationId) await markAiUsageSuccess(reservationId, usage?.());
    return value;
  } catch (err) {
    if (reservationId) await releaseAiUsage(reservationId);
    throw err;
  }
}
