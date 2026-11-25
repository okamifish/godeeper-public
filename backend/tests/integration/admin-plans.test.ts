import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "50000000-0000-4000-8000-000000000005",
      email: "admin-plans@godeeper.local",
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
import { plans } from "../../src/db/schema";

const createdPlanIds: string[] = [];

function jsonRequest(method: string, body: unknown) {
  return {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  };
}

afterEach(async () => {
  for (const id of createdPlanIds.splice(0)) {
    await db.delete(plans).where(eq(plans.id, id));
  }
});

describe("admin plan configuration", () => {
  it("persists isUnlimited when creating a plan", async () => {
    const name = `test-plan-${randomUUID()}`;
    const res = await app.request("/admin/plans", jsonRequest("POST", {
      name,
      priceCents: 0,
      canvasesLimit: 2,
      nodesPerCanvas: 50,
      aiTasksPerDay: 10,
      isUnlimited: true,
    }));

    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; isUnlimited: boolean };
    expect(body.isUnlimited).toBe(true);
    createdPlanIds.push(body.id);
  });

  it("persists isUnlimited when updating a plan", async () => {
    const name = `test-plan-${randomUUID()}`;
    const created = await app.request("/admin/plans", jsonRequest("POST", {
      name,
      priceCents: 0,
      canvasesLimit: 1,
      nodesPerCanvas: -1,
      aiTasksPerDay: 10,
      isUnlimited: false,
    }));
    const body = await created.json() as { id: string };
    createdPlanIds.push(body.id);

    const updated = await app.request(`/admin/plans/${body.id}`, jsonRequest("PUT", {
      isUnlimited: true,
      canvasesLimit: 3,
    }));
    expect(updated.status).toBe(200);

    const [row] = await db.select().from(plans).where(eq(plans.id, body.id));
    expect(row.isUnlimited).toBe(true);
    expect(row.canvasesLimit).toBe(3);
  });
});
