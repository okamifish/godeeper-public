import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "10000000-0000-4000-8000-000000000001",
      email: "backend-unit@godeeper.local",
      display_name: null,
      membership: "pro",
      api_key_enc: null,
      api_provider: null,
    });
    await next();
  },
}));

import { app } from "../../src/app";
import { createCanvasFor, createNodeFor, removeUser, resetUser } from "../helpers/db";

const USER_ID = "10000000-0000-4000-8000-000000000001";

function post(body: unknown) {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  };
}

function put(body: unknown) {
  return {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  };
}

describe("security boundaries", () => {
  beforeAll(async () => {
    await resetUser(USER_ID, "backend-unit@godeeper.local");
  });

  afterAll(async () => {
    await removeUser(USER_ID);
  });

  it("returns 400 for a malformed canvas id", async () => {
    const res = await app.request("/canvas/not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("rejects null / array / malformed snapshots", async () => {
    const canvas = await createCanvasFor(USER_ID);
    expect((await app.request(`/canvas/${canvas.id}/snapshot`, put(null))).status).toBe(400);
    expect((await app.request(`/canvas/${canvas.id}/snapshot`, put([]))).status).toBe(400);
    expect((await app.request(`/canvas/${canvas.id}/snapshot`, put({ nodes: "no" }))).status).toBe(400);
    expect((await app.request(`/canvas/${canvas.id}/snapshot`, put({ nodes: [], edges: [] }))).status).toBe(200);
  });

  it("blocks the same node id from crossing canvases", async () => {
    const canvasA = await createCanvasFor(USER_ID, "A");
    const canvasB = await createCanvasFor(USER_ID, "B");
    const body = {
      canvasId: canvasA.id,
      upserts: [{ id: "shared-node-1", kind: "text", title: "t", body: "b" }],
    };
    expect((await app.request("/node/sync", post(body))).status).toBe(200);

    const cross = await app.request("/node/sync", post({ ...body, canvasId: canvasB.id }));
    expect(cross.status).toBe(409);
  });

  it("returns 404 when reading comments of a foreign canvas", async () => {
    const res = await app.request("/comment/00000000-0000-4000-8000-000000000099");
    expect(res.status).toBe(404);
  });

  it("returns 400 when commenting on a node outside the canvas", async () => {
    const canvas = await createCanvasFor(USER_ID, "comment-canvas");
    const res = await app.request(`/comment/${canvas.id}`, post({ content: "x", nodeId: "nope-node" }));
    expect(res.status).toBe(400);
  });

  it("accepts a comment on a node that belongs to the canvas", async () => {
    const canvas = await createCanvasFor(USER_ID, "comment-ok");
    const node = await createNodeFor(canvas.id, USER_ID);
    const res = await app.request(`/comment/${canvas.id}`, post({ content: "hello", nodeId: node.id }));
    expect(res.status).toBe(201);
  });

  it("returns 404 when creating a share for a foreign canvas", async () => {
    const res = await app.request("/share/00000000-0000-4000-8000-000000000099", post({}));
    expect(res.status).toBe(404);
  });

  it("keeps knowledge experimental routes disabled", async () => {
    const res = await app.request("/knowledge/backlinks/shared-node-1");
    expect(res.status).toBe(404);
  });
});
