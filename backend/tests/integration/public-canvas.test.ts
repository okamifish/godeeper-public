import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { app } from "../../src/app";
import { db } from "../../src/db";
import { canvases } from "../../src/db/schema";
import { createCanvasFor, deleteCanvas, removeUser, resetUser } from "../helpers/db";

const USER_ID = "30000000-0000-4000-8000-000000000003";
const OTHER_USER_ID = "30000000-0000-4000-8000-000000000004";

async function setPublic(canvasId: string, isPublic: boolean) {
  await db.update(canvases).set({ isPublic }).where(eq(canvases.id, canvasId));
}

async function setDeleted(canvasId: string, deleted: boolean) {
  await db.update(canvases)
    .set({ deletedAt: deleted ? new Date() : null })
    .where(eq(canvases.id, canvasId));
}

describe("public canvas view", () => {
  beforeAll(async () => {
    await resetUser(USER_ID, "public-unit@godeeper.local");
    await resetUser(OTHER_USER_ID, "public-other@godeeper.local", "free");
  });

  afterAll(async () => {
    await removeUser(USER_ID);
    await removeUser(OTHER_USER_ID);
  });

  it("returns a published canvas without an auth token", async () => {
    const canvas = await createCanvasFor(USER_ID, "public-canvas");
    await db.update(canvases)
      .set({ isPublic: true, snapshot: { nodes: [{ id: "n1", title: "hello" }], edges: [] } })
      .where(eq(canvases.id, canvas.id));

    const res = await app.request(`/public/canvas/${canvas.id}`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      title: string;
      snapshot: { nodes: unknown[]; edges: unknown[] };
    };
    expect(body.title).toBe("public-canvas");
    expect(body.snapshot.nodes.length).toBe(1);
    expect(body.snapshot.edges.length).toBe(0);

    await deleteCanvas(canvas.id);
  });

  it("hides private, unpublished, and deleted canvases", async () => {
    const privateCanvas = await createCanvasFor(USER_ID, "private-canvas");
    expect((await app.request(`/public/canvas/${privateCanvas.id}`)).status).toBe(404);

    const unpublished = await createCanvasFor(USER_ID, "will-unpublish");
    await setPublic(unpublished.id, true);
    expect((await app.request(`/public/canvas/${unpublished.id}`)).status).toBe(200);
    await setPublic(unpublished.id, false);
    expect((await app.request(`/public/canvas/${unpublished.id}`)).status).toBe(404);

    const deleted = await createCanvasFor(USER_ID, "deleted-public");
    await setPublic(deleted.id, true);
    await setDeleted(deleted.id, true);
    expect((await app.request(`/public/canvas/${deleted.id}`)).status).toBe(404);

    await deleteCanvas(privateCanvas.id);
    await deleteCanvas(unpublished.id);
    await deleteCanvas(deleted.id);
  });

  it("returns 404 for unknown canvas ids and 400 for malformed ids", async () => {
    const unknown = await app.request("/public/canvas/30000000-0000-4000-8000-000000000099");
    expect(unknown.status).toBe(404);

    const malformed = await app.request("/public/canvas/not-a-uuid");
    expect(malformed.status).toBe(400);
  });

  it("does not expose owner identity", async () => {
    const canvas = await createCanvasFor(USER_ID, "privacy-check");
    await setPublic(canvas.id, true);
    const res = await app.request(`/public/canvas/${canvas.id}`);
    const body = await res.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("email");
    await deleteCanvas(canvas.id);
  });
});
