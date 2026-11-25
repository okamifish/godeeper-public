import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "50000000-0000-4000-8000-000000000006",
      email: "admin-user-detail@godeeper.local",
      display_name: null,
      membership: "pro",
      api_key_enc: null,
      api_provider: null,
    });
    await next();
  },
}));

vi.mock("../../src/middleware/admin", () => ({
  adminMiddleware: async (_c: any, next: any) => {
    await next();
  },
}));

import { app } from "../../src/app";
import { db } from "../../src/db";
import { aiUsage, users } from "../../src/db/schema";

const createdUserIds: string[] = [];

afterEach(async () => {
  for (const id of createdUserIds.splice(0)) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describe("admin user detail", () => {
  it("returns stats when the user has usage rows", async () => {
    const userId = randomUUID();
    createdUserIds.push(userId);

    await db.insert(users).values({
      id: userId,
      email: `detail-${userId}@godeeper.local`,
      displayName: "Detail Test",
      membership: "free",
    });
    await db.insert(aiUsage).values({
      userId,
      date: new Date().toISOString().slice(0, 10),
      feature: "task",
      costUsd: "0.001",
    });

    const res = await app.request(`/admin/users/${userId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      id: string;
      stats: { aiTotal: number; monthCostUsd: string; totalCostUsd: string };
    };
    expect(body.id).toBe(userId);
    expect(Number(body.stats.aiTotal)).toBe(1);
    expect(Number(body.stats.totalCostUsd)).toBeCloseTo(0.001, 6);
    expect(Number(body.stats.monthCostUsd)).toBeCloseTo(0.001, 6);
  });
});
