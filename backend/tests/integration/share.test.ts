import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "20000000-0000-4000-8000-000000000002",
      email: "share-unit@godeeper.local",
      display_name: null,
      membership: "pro",
      api_key_enc: null,
      api_provider: null,
    });
    await next();
  },
}));

import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { canvasShares } from "../../src/db/schema";
import { createCanvasFor, createNodeFor, removeUser, resetUser } from "../helpers/db";

const USER_ID = "20000000-0000-4000-8000-000000000002";

function post(body: unknown) {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  };
}

describe("share permissions", () => {
  beforeAll(async () => {
    await resetUser(USER_ID, "share-unit@godeeper.local");
  });

  afterAll(async () => {
    await removeUser(USER_ID);
  });

  it("requires allowComment before accepting viewer comments", async () => {
    const canvas = await createCanvasFor(USER_ID, "share-no-comment");
    const node = await createNodeFor(canvas.id, USER_ID);

    const created = await app.request(`/share/${canvas.id}`, post({ allowComment: false }));
    expect(created.status).toBe(201);
    const share = await created.json() as { id: string; shareToken: string; allowComment: boolean };
    expect(share.allowComment).toBe(false);

    const view = await app.request(`/share/view/${share.shareToken}`);
    expect(view.status).toBe(200);

    const comment = await app.request(`/share/view/${share.shareToken}/comments`, post({
      content: "should fail",
      nodeId: node.id,
    }));
    expect(comment.status).toBe(403);
  });

  it("accepts comments when the owner enables them", async () => {
    const canvas = await createCanvasFor(USER_ID, "share-with-comment");
    const node = await createNodeFor(canvas.id, USER_ID);

    const created = await app.request(`/share/${canvas.id}`, post({ allowComment: true }));
    const share = await created.json() as { id: string; shareToken: string; allowComment: boolean };
    expect(share.allowComment).toBe(true);

    const comment = await app.request(`/share/view/${share.shareToken}/comments`, post({
      content: "hello from viewer",
      nodeId: node.id,
    }));
    expect(comment.status).toBe(201);

    const list = await app.request(`/share/view/${share.shareToken}/comments`);
    const payload = await list.json() as { allowComment: boolean; comments: unknown[] };
    expect(payload.allowComment).toBe(true);
    expect(payload.comments.length).toBe(1);

    const revoked = await app.request(`/share/${share.id}`, { method: "DELETE" });
    expect(revoked.status).toBe(200);
    const after = await app.request(`/share/view/${share.shareToken}`);
    expect(after.status).toBe(404);
  });

  it("returns 404 for an expired legacy share token", async () => {
    const canvas = await createCanvasFor(USER_ID, "share-expired");
    const created = await app.request(`/share/${canvas.id}`, post({}));
    expect(created.status).toBe(201);
    const share = await created.json() as { id: string; shareToken: string };

    await db.update(canvasShares)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(canvasShares.id, share.id));

    const view = await app.request(`/share/view/${share.shareToken}`);
    expect(view.status).toBe(404);

    const comments = await app.request(`/share/view/${share.shareToken}/comments`);
    expect(comments.status).toBe(404);
  });

  it("returns 404 for a malformed legacy share token", async () => {
    const view = await app.request("/share/view/not-a-uuid");
    expect(view.status).toBe(404);
  });
});
