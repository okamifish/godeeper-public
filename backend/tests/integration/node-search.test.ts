import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "40000000-0000-4000-8000-000000000004",
      email: "search-unit@godeeper.local",
      display_name: null,
      membership: c.req.header("x-test-membership") ?? "pro",
      api_key_enc: null,
      api_provider: null,
    });
    await next();
  },
}));

import { app } from "../../src/app";
import { db } from "../../src/db";
import { canvases } from "../../src/db/schema";
import {
  createCanvasFor,
  createNodeFor,
  deleteCanvas,
  removeUser,
  resetUser,
} from "../helpers/db";
import * as proBackend from "@godeeper/pro-backend";

const USER_ID = "40000000-0000-4000-8000-000000000004";
const OTHER_USER_ID = "40000000-0000-4000-8000-000000000005";
const proEnabled = (proBackend as { edition?: string }).edition === "pro";

function search(query: string, membership?: string) {
  return app.request(`/node/search?q=${encodeURIComponent(query)}`, {
    headers: membership ? { "x-test-membership": membership } : undefined,
  });
}

describe("cross-canvas node search", () => {
  let canvasA: Awaited<ReturnType<typeof createCanvasFor>>;
  let canvasB: Awaited<ReturnType<typeof createCanvasFor>>;

  beforeAll(async () => {
    await resetUser(USER_ID, "search-unit@godeeper.local");
    await resetUser(OTHER_USER_ID, "search-other@godeeper.local", "free");

    canvasA = await createCanvasFor(USER_ID, "Alpha Canvas");
    canvasB = await createCanvasFor(USER_ID, "Beta Canvas");

    await createNodeFor(canvasA.id, USER_ID, "search-node-a");
    await db.update(canvases).set({ deletedAt: new Date() }).where(eq(canvases.id, canvasB.id));
    await createNodeFor(canvasB.id, USER_ID, "search-node-b");
    await createNodeFor(canvasA.id, OTHER_USER_ID, "search-node-other");
  });

  afterAll(async () => {
    await removeUser(USER_ID);
    await removeUser(OTHER_USER_ID);
  });

  it.skipIf(!proEnabled)("returns own nodes with canvas titles for pro members", async () => {
    const res = await search("unit node");
    expect(res.status).toBe(200);
    const body = await res.json() as {
      locked: boolean;
      results: Array<{ id: string; canvasId: string; canvasTitle: string; body: string }>;
    };
    expect(body.locked).toBe(false);
    const ids = body.results.map((row) => row.id);
    expect(ids).toContain("search-node-a");
    expect(ids).not.toContain("search-node-b");
    expect(ids).not.toContain("search-node-other");
    const hit = body.results.find((row) => row.id === "search-node-a")!;
    expect(hit.canvasId).toBe(canvasA.id);
    expect(hit.canvasTitle).toBe("Alpha Canvas");
  });

  it("does not include nodes from soft-deleted canvases", async () => {
    const res = await search("unit node");
    expect(res.status).toBe(200);
    const body = await res.json() as { results: Array<{ canvasId: string }> };
    expect(body.results.some((row) => row.canvasId === canvasB.id)).toBe(false);
  });

  it("returns locked title previews instead of a raw 403 for free members", async () => {
    const res = await search("unit node", "free");
    expect(res.status).toBe(200);
    const body = await res.json() as {
      locked: boolean;
      results: Array<{ id: string; body: string; canvasTitle: string }>;
    };
    expect(body.locked).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].canvasTitle).toBe("Alpha Canvas");
    expect(body.results.every((row) => row.body === "")).toBe(true);
  });

  it.skipIf(proEnabled)("falls back to previews when Pro services are absent", async () => {
    const res = await search("unit node");
    expect(res.status).toBe(200);
    const body = await res.json() as {
      locked: boolean;
      results: Array<{ body: string }>;
    };
    expect(body.locked).toBe(true);
    expect(body.results.every((row) => row.body === "")).toBe(true);
  });

  it("returns an empty result set for a blank query", async () => {
    const res = await search("   ");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ locked: false, results: [] });
  });

  afterAll(async () => {
    await deleteCanvas(canvasA.id);
    await deleteCanvas(canvasB.id);
  });
});
