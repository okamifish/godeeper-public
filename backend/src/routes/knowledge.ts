import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { getOwnedNode, nodeBelongsToCanvas, userOwnsCanvas } from "../lib/ownership";
import type { Variables } from "../types";
import * as knowledgeService from "../services/knowledge.service";

const knowledge = new Hono<{ Variables: Variables }>();

knowledge.use("/*", authMiddleware);

knowledge.get("/similar/:nodeId", async (c) => {
  const user = c.get("user");
  const node = await getOwnedNode(c.req.param("nodeId"), user.id);
  if (!node) return c.json({ error: "Node not found" }, 404);
  const results = await knowledgeService.getSimilarNodes(node.id, user.id);
  return c.json(results);
});

knowledge.get("/backlinks/:nodeId", async (c) => {
  const user = c.get("user");
  const node = await getOwnedNode(c.req.param("nodeId"), user.id);
  if (!node) return c.json({ error: "Node not found" }, 404);
  const results = await knowledgeService.getBacklinks(node.id, node.canvasId);
  return c.json(results);
});

const linkSchema = z.object({
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
  canvasId: z.string().uuid(),
  linkType: z.enum(["reference", "similar", "derived"]).default("reference"),
});

knowledge.post("/link", zValidator("json", linkSchema), async (c) => {
  const user = c.get("user");
  const { sourceNodeId, targetNodeId, canvasId, linkType } = c.req.valid("json");

  if (!(await userOwnsCanvas(canvasId, user.id))) {
    return c.json({ error: "Canvas not found" }, 404);
  }
  if (
    !(await nodeBelongsToCanvas(sourceNodeId, canvasId)) ||
    !(await nodeBelongsToCanvas(targetNodeId, canvasId))
  ) {
    return c.json({ error: "Both nodes must belong to this canvas" }, 400);
  }

  const result = await knowledgeService.createLink(sourceNodeId, targetNodeId, canvasId, linkType);
  if (!result) return c.json({ error: "Link already exists" }, 409);
  return c.json(result, 201);
});

knowledge.delete("/link/:id", async (c) => {
  const user = c.get("user");
  const canvasId = await knowledgeService.getLinkCanvasId(c.req.param("id"));
  if (!canvasId || !(await userOwnsCanvas(canvasId, user.id))) {
    return c.json({ error: "Link not found" }, 404);
  }
  await knowledgeService.deleteLink(c.req.param("id"));
  return c.json({ ok: true });
});

knowledge.get("/suggest/:canvasId", async (c) => {
  const user = c.get("user");
  const canvasId = c.req.param("canvasId");
  if (!(await userOwnsCanvas(canvasId, user.id))) {
    return c.json({ error: "Canvas not found" }, 404);
  }
  const results = await knowledgeService.suggestLinks(canvasId, user.id);
  return c.json(results);
});

export default knowledge;
