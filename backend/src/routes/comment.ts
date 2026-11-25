import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { nodeBelongsToCanvas, userOwnsCanvas } from "../lib/ownership";
import type { Variables } from "../types";
import * as commentService from "../services/comment.service";

const comment = new Hono<{ Variables: Variables }>();

comment.use("/*", authMiddleware);

const createSchema = z.object({
  content: z.string().min(1),
  nodeId: z.string().nullable().optional(),
});

comment.get("/:canvasId", async (c) => {
  const user = c.get("user");
  const canvasId = c.req.param("canvasId");
  if (!(await userOwnsCanvas(canvasId, user.id))) {
    return c.json({ error: "Canvas not found" }, 404);
  }
  const nodeId = c.req.query("nodeId");
  const list = await commentService.listComments(canvasId, nodeId);
  return c.json(list);
});

comment.post("/:canvasId", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const canvasId = c.req.param("canvasId");
  if (!(await userOwnsCanvas(canvasId, user.id))) {
    return c.json({ error: "Canvas not found" }, 404);
  }
  const { content, nodeId } = c.req.valid("json");
  if (nodeId && !(await nodeBelongsToCanvas(nodeId, canvasId))) {
    return c.json({ error: "Node not found in this canvas" }, 400);
  }
  const result = await commentService.createComment(canvasId, user.id, content, nodeId ?? undefined);
  return c.json(result, 201);
});

comment.delete("/:id", async (c) => {
  const user = c.get("user");
  try {
    await commentService.deleteComment(c.req.param("id")!, user.id);
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "COMMENT_NOT_FOUND") {
      return c.json({ error: "Comment not found" }, 404);
    }
    throw err;
  }
});

export default comment;
