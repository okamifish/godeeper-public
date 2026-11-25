import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { canvases, nodes, users } from "../../src/db/schema";

export async function resetUser(id: string, email: string, membership = "pro") {
  await db.delete(users).where(eq(users.id, id));
  await db.insert(users).values({ id, email, membership });
}

export async function removeUser(id: string) {
  await db.delete(users).where(eq(users.id, id));
}

export async function createCanvasFor(userId: string, title = "unit-test-canvas") {
  const [row] = await db.insert(canvases).values({ userId, title }).returning();
  return row;
}

export async function createNodeFor(canvasId: string, userId: string, id = `unit-node-${randomUUID()}`) {
  const [row] = await db.insert(nodes).values({
    id,
    canvasId,
    userId,
    kind: "text",
    title: "unit node",
    body: "body",
  }).returning();
  return row;
}

export async function deleteCanvas(id: string) {
  await db.delete(canvases).where(eq(canvases.id, id));
}
