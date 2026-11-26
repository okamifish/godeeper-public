import { db } from "../db";
import { canvases, canvasShares } from "../db/schema";
import { eq, and, gt, isNull, or } from "drizzle-orm";

export async function createShare(
  canvasId: string,
  userId: string,
  expiresInHours?: number,
  allowComment = false,
) {
  const canvas = await db.select().from(canvases)
    .where(and(
      eq(canvases.id, canvasId),
      eq(canvases.userId, userId),
      isNull(canvases.deletedAt),
    ))
    .limit(1);
  if (!canvas[0]) throw new Error("Canvas not found");

  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 3600_000)
    : null;

  const result = await db.insert(canvasShares).values({
    canvasId,
    expiresAt,
    allowComment,
    createdBy: userId,
  }).returning();

  return result[0];
}

export async function listShares(canvasId: string, userId: string) {
  const canvas = await db.select().from(canvases)
    .where(and(eq(canvases.id, canvasId), eq(canvases.userId, userId)))
    .limit(1);
  if (!canvas[0]) throw new Error("Canvas not found");

  return db.select({
    id: canvasShares.id,
    shareToken: canvasShares.shareToken,
    expiresAt: canvasShares.expiresAt,
    allowComment: canvasShares.allowComment,
    createdAt: canvasShares.createdAt,
  }).from(canvasShares)
    .where(and(
      eq(canvasShares.canvasId, canvasId),
      isNull(canvasShares.revokedAt),
    ));
}

export async function revokeShare(shareId: string, userId: string) {
  const share = await db.select().from(canvasShares)
    .where(eq(canvasShares.id, shareId))
    .limit(1);
  if (!share[0]) throw new Error("Share not found");
  if (share[0].revokedAt) return;

  const canvas = await db.select().from(canvases)
    .where(and(eq(canvases.id, share[0].canvasId), eq(canvases.userId, userId)))
    .limit(1);
  if (!canvas[0]) throw new Error("Not authorized");

  await db.update(canvasShares)
    .set({ revokedAt: new Date() })
    .where(eq(canvasShares.id, shareId));
}

export async function getShareByToken(token: string) {
  const result = await db.select({
    id: canvasShares.id,
    shareToken: canvasShares.shareToken,
    expiresAt: canvasShares.expiresAt,
    allowComment: canvasShares.allowComment,
    canvasId: canvasShares.canvasId,
    canvasTitle: canvases.title,
    canvasSnapshot: canvases.snapshot,
    updatedAt: canvases.updatedAt,
  }).from(canvasShares)
    .innerJoin(canvases, eq(canvasShares.canvasId, canvases.id))
    .where(and(
      eq(canvasShares.shareToken, token),
      isNull(canvasShares.revokedAt),
      isNull(canvases.deletedAt),
      or(isNull(canvasShares.expiresAt), gt(canvasShares.expiresAt, new Date()))
    ))
    .limit(1);

  return result[0] ?? null;
}

/** 只解析 token 的授权信息，用于评论等轻量接口 */
export async function resolveShareToken(token: string) {
  const result = await db.select({
    canvasId: canvasShares.canvasId,
    allowComment: canvasShares.allowComment,
    expiresAt: canvasShares.expiresAt,
  }).from(canvasShares)
    .innerJoin(canvases, eq(canvasShares.canvasId, canvases.id))
    .where(and(
      eq(canvasShares.shareToken, token),
      isNull(canvasShares.revokedAt),
      isNull(canvases.deletedAt),
      or(isNull(canvasShares.expiresAt), gt(canvasShares.expiresAt, new Date()))
    ))
    .limit(1);

  return result[0] ?? null;
}
