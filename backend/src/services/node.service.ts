import { db } from "../db";
import { canvases, nodes } from "../db/schema";
import { eq, and, inArray, or, ilike, not, isNull, like, ne } from "drizzle-orm";
import { backlinkSnippet } from "../lib/backlink";

export async function syncNodes(
  canvasId: string,
  userId: string,
  upserts: Array<{ id: string; kind: string; title: string; body: string }>,
  deletes: string[],
  replace = false,
) {
  if (deletes.length > 0) {
    await db.delete(nodes).where(
      and(eq(nodes.canvasId, canvasId), eq(nodes.userId, userId), inArray(nodes.id, deletes))
    );
  }

  if (replace) {
    const ids = upserts.map((node) => node.id);
    await db.delete(nodes).where(
      ids.length > 0
        ? and(eq(nodes.canvasId, canvasId), eq(nodes.userId, userId), not(inArray(nodes.id, ids)))
        : and(eq(nodes.canvasId, canvasId), eq(nodes.userId, userId))
    );
  }

  for (const node of upserts) {
    await db.insert(nodes).values({
      id: node.id,
      canvasId,
      userId,
      kind: node.kind,
      title: node.title,
      body: node.body,
    }).onConflictDoUpdate({
      target: nodes.id,
      set: { kind: node.kind, title: node.title, body: node.body, updatedAt: new Date() },
    });
  }
}

/**
 * 免费预览搜索：跨画布只返回最多 5 条标题，正文留空。
 * 全文搜索由私有 Pro 服务提供，避免公开仓库保留跨画布内容检索实现。
 */
export async function searchPreview(userId: string, query: string) {
  const rows = await db.select({
    id: nodes.id,
    canvasId: nodes.canvasId,
    canvasTitle: canvases.title,
    kind: nodes.kind,
    title: nodes.title,
    body: nodes.body,
    updatedAt: nodes.updatedAt,
  }).from(nodes)
    .innerJoin(canvases, eq(nodes.canvasId, canvases.id))
    .where(and(
      eq(nodes.userId, userId),
      isNull(canvases.deletedAt),
      or(
        ilike(nodes.title, `%${query}%`),
        ilike(nodes.body, `%${query}%`)
      )
    ))
    .limit(5);

  return rows.map((row) => ({
    ...row,
    body: "",
    locked: true,
  }));
}

export interface BacklinkHit {
  canvasId: string;
  canvasTitle: string;
  nodeId: string;
  title: string;
  snippet: string;
  updatedAt: Date;
}

/**
 * 同画布反向链接：免费能力，公开实现。
 * 跨画布内容由私有 Pro 服务提供；这里只保留“是否存在跨画布引用”的布尔检查，
 * 用于免费用户的升级提示，不返回其他画布内容。
 */
export async function findSameCanvasBacklinks(
  userId: string,
  targetCanvasId: string,
  targetNodeId: string,
): Promise<BacklinkHit[]> {
  const token = `gd://c/${targetCanvasId}/n/${targetNodeId})`;
  const rows = await db.select({
    canvasId: nodes.canvasId,
    canvasTitle: canvases.title,
    nodeId: nodes.id,
    title: nodes.title,
    body: nodes.body,
    updatedAt: nodes.updatedAt,
  }).from(nodes)
    .innerJoin(canvases, eq(nodes.canvasId, canvases.id))
    .where(and(
      eq(nodes.userId, userId),
      isNull(canvases.deletedAt),
      like(nodes.body, `%${token}%`),
      eq(nodes.canvasId, targetCanvasId),
      not(and(eq(nodes.id, targetNodeId), eq(nodes.canvasId, targetCanvasId))!),
    ))
    .limit(50);

  return rows.map((row) => ({
    canvasId: row.canvasId,
    canvasTitle: row.canvasTitle,
    nodeId: row.nodeId,
    title: row.title,
    snippet: backlinkSnippet(row.body ?? ""),
    updatedAt: row.updatedAt,
  }));
}

export async function hasCrossCanvasBacklinks(
  userId: string,
  targetCanvasId: string,
  targetNodeId: string,
): Promise<boolean> {
  const token = `gd://c/${targetCanvasId}/n/${targetNodeId})`;
  const rows = await db.select({ id: nodes.id }).from(nodes)
    .innerJoin(canvases, eq(nodes.canvasId, canvases.id))
    .where(and(
      eq(nodes.userId, userId),
      isNull(canvases.deletedAt),
      like(nodes.body, `%${token}%`),
      ne(nodes.canvasId, targetCanvasId),
    ))
    .limit(1);
  return rows.length > 0;
}

/**
 * 同一个节点 id 已存在于别的画布时，拒绝本次保存。
 * 否则 upsert 的冲突目标是全局 `nodes.id`，会把节点静默写到旧画布上。
 */
export async function findCrossCanvasConflicts(canvasId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.select({ id: nodes.id, canvasId: nodes.canvasId })
    .from(nodes)
    .where(inArray(nodes.id, ids));
  return rows.filter((row) => row.canvasId !== canvasId).map((row) => row.id);
}
