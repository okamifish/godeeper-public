import { db } from "../db";
import { nodes, nodeLinks, canvases } from "../db/schema";
import { eq, and, ne, desc } from "drizzle-orm";

export async function getSimilarNodes(nodeId: string, userId: string) {
  // pgvector embedding search — stub until pgvector is enabled
  const target = await db.select().from(nodes).where(eq(nodes.id, nodeId)).limit(1);
  if (!target[0]) throw new Error("Node not found");

  return db.select({
    id: nodes.id,
    title: nodes.title,
    body: nodes.body,
    kind: nodes.kind,
    canvasId: nodes.canvasId,
  }).from(nodes)
    .where(and(
      eq(nodes.userId, userId),
      ne(nodes.id, nodeId),
      eq(nodes.kind, target[0].kind),
    ))
    .limit(10);
}

export async function getBacklinks(nodeId: string, canvasId: string) {
  const incoming = await db.select({
    id: nodeLinks.id,
    sourceNodeId: nodeLinks.sourceNodeId,
    linkType: nodeLinks.linkType,
    isAuto: nodeLinks.isAuto,
    canvasId: nodeLinks.canvasId,
    createdAt: nodeLinks.createdAt,
    sourceNodeTitle: nodes.title,
    sourceNodeKind: nodes.kind,
  }).from(nodeLinks)
    .innerJoin(nodes, eq(nodeLinks.sourceNodeId, nodes.id))
    .where(and(eq(nodeLinks.targetNodeId, nodeId), eq(nodeLinks.canvasId, canvasId)));

  const outgoing = await db.select({
    id: nodeLinks.id,
    targetNodeId: nodeLinks.targetNodeId,
    linkType: nodeLinks.linkType,
    isAuto: nodeLinks.isAuto,
    canvasId: nodeLinks.canvasId,
    createdAt: nodeLinks.createdAt,
    targetNodeTitle: nodes.title,
    targetNodeKind: nodes.kind,
  }).from(nodeLinks)
    .innerJoin(nodes, eq(nodeLinks.targetNodeId, nodes.id))
    .where(and(eq(nodeLinks.sourceNodeId, nodeId), eq(nodeLinks.canvasId, canvasId)));

  return { incoming, outgoing };
}

export async function createLink(
  sourceNodeId: string,
  targetNodeId: string,
  canvasId: string,
  linkType: string = "reference"
) {
  const result = await db.insert(nodeLinks).values({
    sourceNodeId,
    targetNodeId,
    canvasId,
    linkType,
    isAuto: false,
  }).onConflictDoNothing().returning();

  return result[0] ?? null;
}

export async function deleteLink(linkId: string) {
  await db.delete(nodeLinks).where(eq(nodeLinks.id, linkId));
}

export async function getLinkCanvasId(linkId: string) {
  const rows = await db.select({ canvasId: nodeLinks.canvasId })
    .from(nodeLinks)
    .where(eq(nodeLinks.id, linkId))
    .limit(1);
  return rows[0]?.canvasId ?? null;
}

export async function suggestLinks(canvasId: string, userId: string) {
  const canvasNodes = await db.select({ id: nodes.id })
    .from(nodes)
    .where(and(eq(nodes.canvasId, canvasId), eq(nodes.userId, userId)));

  if (canvasNodes.length === 0) return [];

  const otherNodes = await db.select({
    id: nodes.id,
    title: nodes.title,
    body: nodes.body,
    kind: nodes.kind,
    canvasId: nodes.canvasId,
    canvasTitle: canvases.title,
  }).from(nodes)
    .innerJoin(canvases, eq(nodes.canvasId, canvases.id))
    .where(and(
      eq(nodes.userId, userId),
      ne(nodes.canvasId, canvasId),
    ))
    .orderBy(desc(nodes.updatedAt))
    .limit(10);

  return otherNodes;
}
