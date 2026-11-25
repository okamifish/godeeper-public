import { db } from "../db";
import { comments, users } from "../db/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import { userOwnsCanvas } from "../lib/ownership";

export async function listComments(canvasId: string, nodeId?: string) {
  const conditions = [eq(comments.canvasId, canvasId)];
  if (nodeId) conditions.push(eq(comments.nodeId, nodeId));

  return db.select({
    id: comments.id,
    nodeId: comments.nodeId,
    userId: comments.userId,
    content: comments.content,
    createdAt: comments.createdAt,
    authorName: users.displayName,
    authorAvatar: users.avatarUrl,
  }).from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(and(...conditions))
    .orderBy(comments.createdAt);
}

export async function countRecentComments(canvasId: string, userId: string, windowMs = 60_000) {
  const since = new Date(Date.now() - windowMs);
  const [row] = await db.select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(and(
      eq(comments.canvasId, canvasId),
      eq(comments.userId, userId),
      gt(comments.createdAt, since),
    ));
  return Number(row?.count ?? 0);
}

export async function createComment(
  canvasId: string,
  userId: string,
  content: string,
  nodeId?: string
) {
  const result = await db.insert(comments).values({
    canvasId,
    userId,
    content,
    // Nullify non-UUID nodeId to avoid FK violation
    nodeId: nodeId ?? null,
  }).returning();

  return result[0];
}

export async function deleteComment(commentId: string, userId: string) {
  const [row] = await db.select({
    id: comments.id,
    userId: comments.userId,
    canvasId: comments.canvasId,
  }).from(comments).where(eq(comments.id, commentId)).limit(1);

  if (!row) throw new Error("COMMENT_NOT_FOUND");
  // 作者本人或画布主人可以删除
  if (row.userId !== userId && !(await userOwnsCanvas(row.canvasId, userId))) {
    throw new Error("COMMENT_NOT_FOUND");
  }

  await db.delete(comments).where(eq(comments.id, commentId));
}
