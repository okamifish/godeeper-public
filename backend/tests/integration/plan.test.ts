import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "30000000-0000-4000-8000-000000000003",
      email: "plan-unit@godeeper.local",
      display_name: null,
      membership: "free",
      api_key_enc: null,
      api_provider: null,
    });
    await next();
  },
}));

import { app } from "../../src/app";
import { db } from "../../src/db";
import { aiUsage, canvases, credits, creditTransactions, nodes, plans, users } from "../../src/db/schema";
import { checkAndIncrementAiUsage, checkNodeLimit, releaseAiUsage } from "../../src/middleware/membership";
import { createCanvasFor, removeUser, resetUser } from "../helpers/db";

const USER_ID = "30000000-0000-4000-8000-000000000003";

function post(body: unknown) {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  };
}

describe("free plan limits and plan snapshot", () => {
  beforeAll(async () => {
    await resetUser(USER_ID, "plan-unit@godeeper.local", "free");
  });

  afterAll(async () => {
    await removeUser(USER_ID);
  });

  it("returns a read-only plan snapshot for a free user", async () => {
    await createCanvasFor(USER_ID, "free-canvas");
    const res = await app.request("/auth/me/plan");
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.membership).toBe("free");
    expect(body.limits.canvases).toBe(1);
    expect(body.limits.nodesPerCanvas).toBeNull();
    expect(body.usage.canvases).toBe(1);
    expect(body.credits).toEqual({ taskRun: 0, inspire: 0, summary: 0 });
    expect(body.byok.configured).toBe(false);
    expect(body.byok.dailyAiUnlimited).toBe(false);
  });

  it("blocks a second cloud canvas for a free user", async () => {
    const res = await app.request("/canvas", post({ title: "second-canvas" }));
    expect(res.status).toBe(403);
  });

  it("does not enforce a node count limit for free users", async () => {
    const canvas = await createCanvasFor(USER_ID, "many-nodes");
    const rows = Array.from({ length: 60 }, (_, index) => ({
      id: `limit-node-${index}-${randomUUID()}`,
      canvasId: canvas.id,
      userId: USER_ID,
      kind: "text" as const,
      title: `node ${index}`,
      body: "",
    }));
    await db.insert(nodes).values(rows);

    const result = await checkNodeLimit(canvas.id, USER_ID, "free", {
      upsertIds: ["extra-node"],
      replace: false,
    });
    expect(result).toBeUndefined();
  });

  it("rejects hosted AI when credits are exhausted", async () => {
    await db.delete(aiUsage).where(eq(aiUsage.userId, USER_ID));
    await db.delete(credits).where(eq(credits.userId, USER_ID));
    await db.update(users).set({ apiKeyEnc: null }).where(eq(users.id, USER_ID));

    const result = await checkAndIncrementAiUsage(USER_ID, "free", { feature: "task" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("insufficient_credits");
  });

  it("charges hosted AI credits and refunds on failure", async () => {
    await db.delete(aiUsage).where(eq(aiUsage.userId, USER_ID));
    await db.delete(credits).where(eq(credits.userId, USER_ID));
    await db.insert(credits).values({ userId: USER_ID, taskRun: 2 });

    const first = await checkAndIncrementAiUsage(USER_ID, "free", { feature: "task" });
    const second = await checkAndIncrementAiUsage(USER_ID, "free", { feature: "task" });
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);

    const [afterTwo] = await db.select().from(credits).where(eq(credits.userId, USER_ID));
    expect(afterTwo.taskRun).toBe(0);

    const third = await checkAndIncrementAiUsage(USER_ID, "free", { feature: "task" });
    expect(third.allowed).toBe(false);
    expect(third.reason).toBe("insufficient_credits");

    await releaseAiUsage(first.reservationId as string);
    const [afterRefund] = await db.select().from(credits).where(eq(credits.userId, USER_ID));
    expect(afterRefund.taskRun).toBe(1);

    // 重复释放不应该重复退款
    await releaseAiUsage(first.reservationId as string);
    const [afterDuplicate] = await db.select().from(credits).where(eq(credits.userId, USER_ID));
    expect(afterDuplicate.taskRun).toBe(1);

    const transactions = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, USER_ID));
    expect(transactions.filter((row) => row.amount === -1)).toHaveLength(2);
    expect(transactions.filter((row) => row.amount === 1)).toHaveLength(1);

    await db.delete(aiUsage).where(eq(aiUsage.userId, USER_ID));
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, USER_ID));
    await db.delete(credits).where(eq(credits.userId, USER_ID));
  });

  it("keeps the daily AI limit for hosted users with credits", async () => {
    await db.delete(aiUsage).where(eq(aiUsage.userId, USER_ID));
    await db.delete(credits).where(eq(credits.userId, USER_ID));
    await db.insert(credits).values({ userId: USER_ID, taskRun: 20 });

    const results = [];
    for (let index = 0; index < 11; index += 1) {
      results.push(await checkAndIncrementAiUsage(USER_ID, "free", { feature: "task" }));
    }
    const last = results[results.length - 1];
    expect(last.allowed).toBe(false);
    expect(last.reason).toBe("daily_limit");

    for (const result of results) {
      if (result.reservationId) await releaseAiUsage(result.reservationId);
    }
    await db.delete(aiUsage).where(eq(aiUsage.userId, USER_ID));
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, USER_ID));
    await db.delete(credits).where(eq(credits.userId, USER_ID));
  });

  it("does not enforce the daily AI limit for BYOK users", async () => {
    await db.update(users).set({ apiKeyEnc: "test-encrypted-key" }).where(eq(users.id, USER_ID));

    const results = [];
    for (let index = 0; index < 12; index += 1) {
      results.push(await checkAndIncrementAiUsage(USER_ID, "free", { feature: "task" }));
    }
    expect(results.every((result) => result.allowed)).toBe(true);

    for (const result of results) {
      if (result.reservationId) await releaseAiUsage(result.reservationId);
    }
    await db.delete(aiUsage).where(eq(aiUsage.userId, USER_ID));
    await db.update(users).set({ apiKeyEnc: null }).where(eq(users.id, USER_ID));
  });

  it("uses the free plan row from the plans table", async () => {
    const [freePlan] = await db.select().from(plans).where(eq(plans.name, "free"));
    if (!freePlan) throw new Error("free plan missing; run backend/scripts/seed-plans.mjs first");

    const original = {
      canvasesLimit: freePlan.canvasesLimit,
      nodesPerCanvas: freePlan.nodesPerCanvas,
      aiTasksPerDay: freePlan.aiTasksPerDay,
      isUnlimited: freePlan.isUnlimited,
    };

    try {
      await db.update(plans)
        .set({ canvasesLimit: 2, nodesPerCanvas: -1, aiTasksPerDay: 10, isUnlimited: false })
        .where(eq(plans.id, freePlan.id));
      await db.delete(canvases).where(eq(canvases.userId, USER_ID));

      const snapshotRes = await app.request("/auth/me/plan");
      expect(snapshotRes.status).toBe(200);
      const snapshot = await snapshotRes.json() as any;
      expect(snapshot.limits.canvases).toBe(2);
      expect(snapshot.limits.nodesPerCanvas).toBeNull();
      expect(snapshot.limits.aiTasksPerDay).toBe(10);

      const first = await app.request("/canvas", post({ title: "configured-canvas-1" }));
      expect(first.status).toBe(201);
      const second = await app.request("/canvas", post({ title: "configured-canvas-2" }));
      expect(second.status).toBe(201);
      const third = await app.request("/canvas", post({ title: "configured-canvas-3" }));
      expect(third.status).toBe(403);
    } finally {
      await db.update(plans).set(original).where(eq(plans.id, freePlan.id));
    }
  });
});
