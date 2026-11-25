import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    if (c.req.header("x-test-anonymous") === "1") {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const id = c.req.header("x-test-user") ?? "50000000-0000-4000-8000-000000000005";
    c.set("user", {
      id,
      email: `${id}@godeeper.local`,
      display_name: id.endsWith("6") ? "Reader" : "Owner",
      membership: c.req.header("x-test-membership") ?? "free",
      api_key_enc: null,
      api_provider: null,
    });
    await next();
  },
}));

import { app } from "../../src/app";
import { db } from "../../src/db";
import { canvases, users } from "../../src/db/schema";
import { createCanvasFor, deleteCanvas, removeUser, resetUser } from "../helpers/db";

const OWNER_ID = "50000000-0000-4000-8000-000000000005";
const READER_ID = "50000000-0000-4000-8000-000000000006";

function headers(overrides: Record<string, string> = {}) {
  return { "x-test-user": READER_ID, ...overrides };
}

function postComment(canvasId: string, content: string, options: { headers?: Record<string, string> } = {}) {
  return app.request(`/public/canvas/${canvasId}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers(options.headers) },
    body: JSON.stringify({ content }),
  });
}

async function makePublicCanvas(title: string) {
  const canvas = await createCanvasFor(OWNER_ID, title);
  await db.update(canvases).set({ isPublic: true }).where(eq(canvases.id, canvas.id));
  return canvas;
}

describe("public canvas comments", () => {
  const createdCanvasIds: string[] = [];

  beforeAll(async () => {
    await resetUser(OWNER_ID, "comments-owner@godeeper.local");
    await resetUser(READER_ID, "comments-reader@godeeper.local", "free");
    await db.update(users).set({ displayName: "Reader" }).where(eq(users.id, READER_ID));
  });

  afterAll(async () => {
    for (const id of createdCanvasIds) {
      await deleteCanvas(id);
    }
    await removeUser(OWNER_ID);
    await removeUser(READER_ID);
  });

  it("exposes commentsEnabled by default", async () => {
    const canvas = await makePublicCanvas("comments-default");
    createdCanvasIds.push(canvas.id);
    const res = await app.request(`/public/canvas/${canvas.id}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { commentsEnabled: boolean };
    expect(body.commentsEnabled).toBe(true);
  });

  it("rejects anonymous comments with 401", async () => {
    const canvas = await makePublicCanvas("comments-anon");
    createdCanvasIds.push(canvas.id);
    const res = await postComment(canvas.id, "anonymous", { headers: { "x-test-anonymous": "1" } });
    expect(res.status).toBe(401);
  });

  it("accepts a logged-in reader and lets only the owner read/delete it", async () => {
    const canvas = await makePublicCanvas("comments-reader");
    createdCanvasIds.push(canvas.id);

    const created = await postComment(canvas.id, "这个论证的第三步可以再展开");
    expect(created.status).toBe(201);
    const createdBody = await created.json() as { commentId: string };

    const nonOwnerList = await app.request(`/comment/${canvas.id}`, { headers: headers() });
    expect(nonOwnerList.status).toBe(404);

    const ownerList = await app.request(`/comment/${canvas.id}`, { headers: headers({ "x-test-user": OWNER_ID }) });
    expect(ownerList.status).toBe(200);
    const rows = await ownerList.json() as Array<{ id: string; content: string; authorName: string | null }>;
    expect(rows.some((row) => row.id === createdBody.commentId)).toBe(true);
    expect(rows[0].authorName).toBe("Reader");

    const deleted = await app.request(`/comment/${createdBody.commentId}`, {
      method: "DELETE",
      headers: headers({ "x-test-user": OWNER_ID }),
    });
    expect(deleted.status).toBe(200);

    const after = await app.request(`/comment/${canvas.id}`, { headers: headers({ "x-test-user": OWNER_ID }) });
    expect(await after.json()).toEqual([]);
  });

  it("rejects comments when the owner disables them", async () => {
    const canvas = await makePublicCanvas("comments-disabled");
    createdCanvasIds.push(canvas.id);
    await db.update(canvases).set({ allowPublicComments: false }).where(eq(canvases.id, canvas.id));

    const publicView = await app.request(`/public/canvas/${canvas.id}`);
    expect((await publicView.json() as { commentsEnabled: boolean }).commentsEnabled).toBe(false);

    const res = await postComment(canvas.id, "should fail");
    expect(res.status).toBe(403);
  });

  it("rejects comments on unpublished or deleted canvases", async () => {
    const unpublished = await createCanvasFor(OWNER_ID, "comments-private");
    createdCanvasIds.push(unpublished.id);
    expect((await postComment(unpublished.id, "nope")).status).toBe(404);

    const deleted = await makePublicCanvas("comments-deleted");
    createdCanvasIds.push(deleted.id);
    await db.update(canvases).set({ deletedAt: new Date() }).where(eq(canvases.id, deleted.id));
    expect((await postComment(deleted.id, "nope")).status).toBe(404);
  });

  it("validates content length", async () => {
    const canvas = await makePublicCanvas("comments-length");
    createdCanvasIds.push(canvas.id);
    const tooLong = await postComment(canvas.id, "x".repeat(2001));
    expect(tooLong.status).toBe(400);
    const blank = await postComment(canvas.id, "   ");
    expect(blank.status).toBe(400);
  });

  it("rate limits the same reader to 5 comments per minute per canvas", async () => {
    const canvas = await makePublicCanvas("comments-rate");
    createdCanvasIds.push(canvas.id);
    for (let i = 0; i < 5; i += 1) {
      expect((await postComment(canvas.id, `comment ${i}`)).status).toBe(201);
    }
    expect((await postComment(canvas.id, "too many")).status).toBe(429);
  });
});
