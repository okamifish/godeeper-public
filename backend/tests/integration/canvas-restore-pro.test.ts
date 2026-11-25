import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "30000000-0000-4000-8000-000000000007",
      email: "restore-pro@godeeper.local",
      display_name: null,
      membership: "pro",
      api_key_enc: null,
      api_provider: null,
    });
    await next();
  },
}));

import { app } from "../../src/app";
import { db } from "../../src/db";
import { canvases } from "../../src/db/schema";
import { createCanvasFor, removeUser, resetUser } from "../helpers/db";
import * as proBackend from "@godeeper/pro-backend";

const USER_ID = "30000000-0000-4000-8000-000000000007";
const proEnabled = (proBackend as { edition?: string }).edition === "pro";

// 社区版安装的是 pro-stub，不包含 Pro 实现；这组用例只在商业版依赖下运行。
describe.skipIf(!proEnabled)("pro canvas restore", () => {
  beforeAll(async () => {
    await resetUser(USER_ID, "restore-pro@godeeper.local", "pro");
  });

  afterAll(async () => {
    await removeUser(USER_ID);
  });

  it("lists deleted canvases and restores them", async () => {
    const canvas = await createCanvasFor(USER_ID, "restore-me");
    await app.request(`/canvas/${canvas.id}`, { method: "DELETE" });

    const trash = await app.request("/canvas/trash");
    expect(trash.status).toBe(200);
    const rows = await trash.json() as Array<{ id: string; title: string }>;
    expect(rows.some((row) => row.id === canvas.id)).toBe(true);

    const restore = await app.request(`/canvas/${canvas.id}/restore`, { method: "POST" });
    expect(restore.status).toBe(200);

    const list = await app.request("/canvas");
    const active = await list.json() as Array<{ id: string }>;
    expect(active.some((row) => row.id === canvas.id)).toBe(true);

    const again = await app.request(`/canvas/${canvas.id}/restore`, { method: "POST" });
    expect(again.status).toBe(404);
  });

  it("purges tombstones older than 30 days", async () => {
    const canvas = await createCanvasFor(USER_ID, "expired-trash");
    await db.update(canvases)
      .set({ deletedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) })
      .where(eq(canvases.id, canvas.id));

    const trash = await app.request("/canvas/trash");
    expect(trash.status).toBe(200);
    const rows = await trash.json() as Array<{ id: string }>;
    expect(rows.some((row) => row.id === canvas.id)).toBe(false);

    const [row] = await db.select().from(canvases).where(eq(canvases.id, canvas.id));
    expect(row).toBeUndefined();
  });
});
