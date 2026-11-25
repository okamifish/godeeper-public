import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "40000000-0000-4000-8000-000000000013",
      email: "backlinks-unit@godeeper.local",
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
import { canvases, nodes } from "../../src/db/schema";
import {
  createCanvasFor,
  createNodeFor,
  deleteCanvas,
  removeUser,
  resetUser,
} from "../helpers/db";
import * as proBackend from "@godeeper/pro-backend";

const USER_ID = "40000000-0000-4000-8000-000000000013";
const OTHER_USER_ID = "40000000-0000-4000-8000-000000000014";
const proEnabled = (proBackend as { edition?: string }).edition === "pro";

function backlinks(canvasId: string, nodeId: string, membership?: string) {
  return app.request(
    `/node/backlinks?canvasId=${encodeURIComponent(canvasId)}&nodeId=${encodeURIComponent(nodeId)}`,
    { headers: membership ? { "x-test-membership": membership } : undefined },
  );
}

async function createDocNode(canvasId: string, userId: string, id: string, body: string) {
  await db.insert(nodes).values({
    id,
    canvasId,
    userId,
    kind: "text",
    title: id,
    body,
  });
}

describe("node backlinks", () => {
  let canvasA: Awaited<ReturnType<typeof createCanvasFor>>;
  let canvasB: Awaited<ReturnType<typeof createCanvasFor>>;
  let canvasOther: Awaited<ReturnType<typeof createCanvasFor>>;
  let targetId = "";

  beforeAll(async () => {
    await resetUser(USER_ID, "backlinks-unit@godeeper.local");
    await resetUser(OTHER_USER_ID, "backlinks-other@godeeper.local", "free");

    canvasA = await createCanvasFor(USER_ID, "Alpha Canvas");
    canvasB = await createCanvasFor(USER_ID, "Beta Canvas");
    canvasOther = await createCanvasFor(OTHER_USER_ID, "Other Canvas");

    targetId = "backlink-target";
    await createNodeFor(canvasB.id, USER_ID, targetId);
    await db.update(nodes).set({
      title: "目标卡片",
      body: `自引用 [目标卡片](gd://c/${canvasB.id}/n/${targetId})`,
    }).where(eq(nodes.id, targetId));

    const token = `[目标卡片](gd://c/${canvasB.id}/n/${targetId})`;
    await createDocNode(canvasA.id, USER_ID, "source-a", `引用 ${token}`);
    await createDocNode(canvasB.id, USER_ID, "source-b", `同画布引用 ${token}`);
    await createDocNode(canvasA.id, USER_ID, "partial", `[半截](gd://c/${canvasB.id}/n/${targetId}`);
    await createDocNode(canvasOther.id, OTHER_USER_ID, "source-other", `他人引用 ${token}`);
  });

  afterAll(async () => {
    await deleteCanvas(canvasA.id);
    await deleteCanvas(canvasB.id);
    await deleteCanvas(canvasOther.id);
    await removeUser(USER_ID);
    await removeUser(OTHER_USER_ID);
  });

  it.skipIf(!proEnabled)("returns cross-canvas backlinks for pro members", async () => {
    const res = await backlinks(canvasB.id, targetId);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      locked: boolean;
      total: number;
      backlinks: Array<{ nodeId: string; canvasId: string; canvasTitle: string }>;
    };

    expect(body.locked).toBe(false);
    expect(body.backlinks.map((item) => item.nodeId).sort()).toEqual(["source-a", "source-b"]);
    expect(body.backlinks.find((item) => item.nodeId === "source-a")?.canvasTitle).toBe("Alpha Canvas");
    expect(body.backlinks.some((item) => item.nodeId === "source-other")).toBe(false);
    expect(body.backlinks.some((item) => item.nodeId === "partial")).toBe(false);
    expect(body.backlinks.some((item) => item.nodeId === targetId)).toBe(false);
  });

  it("limits free members to the current canvas and flags cross-canvas hits", async () => {
    const res = await backlinks(canvasB.id, targetId, "free");
    expect(res.status).toBe(200);
    const body = await res.json() as {
      locked: boolean;
      hasCrossCanvas: boolean;
      backlinks: Array<{ nodeId: string }>;
    };

    expect(body.locked).toBe(true);
    expect(body.hasCrossCanvas).toBe(true);
    expect(body.backlinks.map((item) => item.nodeId)).toEqual(["source-b"]);
  });

  it.skipIf(proEnabled)("falls back to same-canvas backlinks when Pro services are absent", async () => {
    const res = await backlinks(canvasB.id, targetId);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      locked: boolean;
      hasCrossCanvas: boolean;
      backlinks: Array<{ nodeId: string }>;
    };

    expect(body.locked).toBe(true);
    expect(body.hasCrossCanvas).toBe(true);
    expect(body.backlinks.map((item) => item.nodeId)).toEqual(["source-b"]);
  });

  it("returns 404 when the target does not belong to the current user or canvas", async () => {
    const wrongCanvas = await backlinks(canvasA.id, targetId);
    expect(wrongCanvas.status).toBe(404);

    const otherUser = await backlinks(canvasOther.id, targetId);
    expect(otherUser.status).toBe(404);
  });

  it("excludes source nodes from soft-deleted canvases", async () => {
    await db.update(canvases).set({ deletedAt: new Date() }).where(eq(canvases.id, canvasA.id));

    const res = await backlinks(canvasB.id, targetId);
    expect(res.status).toBe(200);
    const body = await res.json() as { backlinks: Array<{ nodeId: string }> };
    expect(body.backlinks.map((item) => item.nodeId)).toEqual(["source-b"]);
  });
});
