import { db } from "../db";
import { canvases } from "../db/schema";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";

export async function listCanvases(userId: string) {
  return db.select({
    id: canvases.id,
    title: canvases.title,
    nodeCount: canvases.nodeCount,
    isPublic: canvases.isPublic,
    updatedAt: canvases.updatedAt,
    createdAt: canvases.createdAt,
  }).from(canvases).where(and(eq(canvases.userId, userId), isNull(canvases.deletedAt)));
}

export async function getCanvas(canvasId: string, userId: string) {
  const result = await db.select().from(canvases)
    .where(and(eq(canvases.id, canvasId), eq(canvases.userId, userId), isNull(canvases.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

export async function createCanvas(userId: string, title: string) {
  await purgeExpiredCanvases(userId);
  const result = await db.insert(canvases).values({
    userId,
    title,
    snapshot: { nodes: [], edges: [] },
  }).returning();
  return result[0];
}

export async function saveSnapshot(canvasId: string, userId: string, snapshot: unknown) {
  const nodeCount = Array.isArray((snapshot as { nodes?: unknown[] })?.nodes)
    ? (snapshot as { nodes: unknown[] }).nodes.length
    : 0;
  await db.update(canvases)
    .set({ snapshot, nodeCount, updatedAt: new Date() })
    .where(and(eq(canvases.id, canvasId), eq(canvases.userId, userId), isNull(canvases.deletedAt)));
}

export async function updateCanvas(
  canvasId: string,
  userId: string,
  data: { title?: string; isPublic?: boolean; allowPublicComments?: boolean },
) {
  const result = await db.update(canvases)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(canvases.id, canvasId), eq(canvases.userId, userId), isNull(canvases.deletedAt)))
    .returning();
  return result[0] ?? null;
}

export async function deleteCanvas(canvasId: string, userId: string) {
  await db.update(canvases)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(canvases.id, canvasId), eq(canvases.userId, userId), isNull(canvases.deletedAt)));
}

/** 公开发布的画布：不校验登录，只返回只读内容，不暴露归属信息 */
export async function getPublicCanvas(canvasId: string) {
  const result = await db.select({
    canvasId: canvases.id,
    title: canvases.title,
    snapshot: canvases.snapshot,
    updatedAt: canvases.updatedAt,
    allowPublicComments: canvases.allowPublicComments,
  }).from(canvases)
    .where(and(
      eq(canvases.id, canvasId),
      eq(canvases.isPublic, true),
      isNull(canvases.deletedAt),
    ))
    .limit(1);

  const row = result[0];
  if (!row) return null;
  return {
    canvasId: row.canvasId,
    title: row.title,
    snapshot: row.snapshot,
    updatedAt: row.updatedAt,
    commentsEnabled: row.allowPublicComments,
  };
}

export async function purgeExpiredCanvases(userId: string, retentionDays = 30) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  await db.delete(canvases).where(and(
    eq(canvases.userId, userId),
    isNotNull(canvases.deletedAt),
    lt(canvases.deletedAt, cutoff),
  ));
}
