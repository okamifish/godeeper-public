import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "30000000-0000-4000-8000-000000000006",
      email: "restore-free@godeeper.local",
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
import { canvases } from "../../src/db/schema";
import { createCanvasFor, removeUser, resetUser } from "../helpers/db";

const USER_ID = "30000000-0000-4000-8000-000000000006";

describe("canvas delete is recoverable only for pro", () => {
  beforeAll(async () => {
    await resetUser(USER_ID, "restore-free@godeeper.local", "free");
  });

  afterAll(async () => {
    await removeUser(USER_ID);
  });

  it("soft deletes and hides the canvas, but free users cannot list or restore trash", async () => {
    const canvas = await createCanvasFor(USER_ID, "soft-delete-free");

    const deleted = await app.request(`/canvas/${canvas.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);

    const list = await app.request("/canvas");
    expect(await list.json()).toEqual([]);

    const detail = await app.request(`/canvas/${canvas.id}`);
    expect(detail.status).toBe(404);

    const trash = await app.request("/canvas/trash");
    expect(trash.status).toBe(403);

    const restore = await app.request(`/canvas/${canvas.id}/restore`, { method: "POST" });
    expect(restore.status).toBe(403);

    const [row] = await db.select().from(canvases).where(eq(canvases.id, canvas.id));
    expect(row?.deletedAt).toBeTruthy();
  });
});
