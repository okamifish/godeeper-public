import { db } from "../db";
import { aiUsage, riskEvents } from "../db/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { getRiskConfig } from "../lib/settings";

async function recordRiskEvent(userId: string, eventType: string, detail: string) {
  await db.insert(riskEvents).values({ userId, eventType, detail, status: "open" });
}

export async function checkBurstAbuse(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const config = await getRiskConfig();
  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const [row] = await db.select({ count: sql<number>`count(*)` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, oneMinuteAgo)));

  if (Number(row.count) >= config.burstPerMinute) {
    await recordRiskEvent(
      userId,
      "burst",
      `${row.count} AI calls in 1 minute (limit: ${config.burstPerMinute})`,
    );
    return { allowed: false, reason: "Rate limited: too many requests in a short time" };
  }
  return { allowed: true };
}

export async function checkDailyAbuse(userId: string, membership: string): Promise<void> {
  if (membership !== "free") return;

  const config = await getRiskConfig();
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.select({ count: sql<number>`count(*)` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.date, today)));

  if (Number(row.count) >= config.dailyWatchLimitFree) {
    await recordRiskEvent(
      userId,
      "daily_exceed",
      `Free user made ${row.count} calls today (watch: ${config.dailyWatchLimitFree})`,
    );
  }
}

export async function checkFailureRate(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const config = await getRiskConfig();
  const [stats] = await db.execute(sql`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE status = 'failed') AS failed
    FROM task_runs
    WHERE user_id = ${userId} AND created_at >= now() - interval '1 hour'
  `);
  // postgres-js 的 db.execute() 直接返回行对象数组；解构出的 stats 已经是第一行，
  // 字段名沿用 SQL 别名（total / failed），不要再次按 [0] 索引。
  const row = stats as unknown as Record<string, unknown>;
  const total = Number(row.total ?? 0);
  const failed = Number(row.failed ?? 0);

  if (total >= config.failureMinSamples && failed / total >= config.failureRateThreshold) {
    await recordRiskEvent(
      userId,
      "high_fail_rate",
      `${failed}/${total} tasks failed in last hour (${Math.round(failed / total * 100)}%)`,
    );
    return { allowed: false, reason: "Too many failed tasks — check your configuration" };
  }
  return { allowed: true };
}
