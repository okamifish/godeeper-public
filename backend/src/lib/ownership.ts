import { db } from "../db";
import { canvasShares, canvases, nodes } from "../db/schema";
import { and, eq } from "drizzle-orm";

/**
 * 多租户归属校验。
 * 原则：所有按 id 操作的接口，先确认资源属于当前登录用户；
 * 不属于时统一按「不存在」处理（404），避免暴露资源是否存在。
 */

export async function userOwnsCanvas(canvasId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: canvases.id })
    .from(canvases)
    .where(and(eq(canvases.id, canvasId), eq(canvases.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function getOwnedNode(nodeId: string, userId: string) {
  const rows = await db
    .select({ id: nodes.id, canvasId: nodes.canvasId })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** 节点是否属于指定画布（用于评论 / 连线前校验，避免外键 500） */
export async function nodeBelongsToCanvas(nodeId: string, canvasId: string): Promise<boolean> {
  const rows = await db
    .select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.canvasId, canvasId)))
    .limit(1);
  return rows.length > 0;
}

/** 分享记录是否属于该用户的画布 */
export async function userOwnsShare(shareId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: canvasShares.id })
    .from(canvasShares)
    .innerJoin(canvases, eq(canvasShares.canvasId, canvases.id))
    .where(and(eq(canvasShares.id, shareId), eq(canvases.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
