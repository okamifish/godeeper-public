import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { invalidId, isUuid } from "../lib/params";
import { nodeBelongsToCanvas } from "../lib/ownership";
import type { Variables } from "../types";
import * as shareService from "../services/share.service";
import * as commentService from "../services/comment.service";

const share = new Hono<{ Variables: Variables }>();

const createSchema = z.object({
  expiresInHours: z.number().min(1).max(24 * 365).optional(),
  allowComment: z.boolean().optional().default(false),
});

const commentSchema = z.object({
  content: z.string().min(1).max(2000),
  nodeId: z.string().nullable().optional(),
});

// Auth-required routes
share.post("/:canvasId", authMiddleware, zValidator("json", createSchema), async (c) => {
  const canvasId = c.req.param("canvasId")!;
  if (!isUuid(canvasId)) return invalidId(c, "canvas id");
  const user = c.get("user");
  const { expiresInHours, allowComment } = c.req.valid("json");
  try {
    const result = await shareService.createShare(canvasId, user.id, expiresInHours, allowComment);
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Canvas not found") return c.json({ error: "Canvas not found" }, 404);
    throw err;
  }
});

share.get("/:canvasId", authMiddleware, async (c) => {
  const canvasId = c.req.param("canvasId")!;
  if (!isUuid(canvasId)) return invalidId(c, "canvas id");
  const user = c.get("user");
  try {
    const list = await shareService.listShares(canvasId, user.id);
    return c.json(list);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Canvas not found") return c.json({ error: "Canvas not found" }, 404);
    throw err;
  }
});

share.delete("/:id", authMiddleware, async (c) => {
  const id = c.req.param("id")!;
  if (!isUuid(id)) return invalidId(c, "share id");
  const user = c.get("user");
  try {
    await shareService.revokeShare(id, user.id);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Share not found" || message === "Not authorized") {
      return c.json({ error: "Share not found" }, 404);
    }
    throw err;
  }
});

// Viewing requires login (MVP decision): share links come back into GoDeeper.
share.get("/view/:token", authMiddleware, async (c) => {
  const token = c.req.param("token")!;
  if (!isUuid(token)) return c.json({ error: "Share not found or expired" }, 404);
  const result = await shareService.getShareByToken(token);
  if (!result) return c.json({ error: "Share not found or expired" }, 404);
  return c.json(result);
});

share.get("/view/:token/comments", authMiddleware, async (c) => {
  const token = c.req.param("token")!;
  if (!isUuid(token)) return c.json({ error: "Share not found or expired" }, 404);
  const access = await shareService.resolveShareToken(token);
  if (!access) return c.json({ error: "Share not found or expired" }, 404);

  const nodeId = c.req.query("nodeId");
  const list = await commentService.listComments(access.canvasId, nodeId);
  return c.json({ allowComment: access.allowComment, comments: list });
});

share.post("/view/:token/comments", authMiddleware, zValidator("json", commentSchema), async (c) => {
  const token = c.req.param("token")!;
  if (!isUuid(token)) return c.json({ error: "Share not found or expired" }, 404);
  const access = await shareService.resolveShareToken(token);
  if (!access) return c.json({ error: "Share not found or expired" }, 404);
  if (!access.allowComment) {
    return c.json({ error: "The canvas owner has disabled comments" }, 403);
  }

  const user = c.get("user");
  const { content, nodeId } = c.req.valid("json");
  if (nodeId && !(await nodeBelongsToCanvas(nodeId, access.canvasId))) {
    return c.json({ error: "Node not found in this canvas" }, 400);
  }

  const result = await commentService.createComment(access.canvasId, user.id, content, nodeId ?? undefined);
  return c.json(result, 201);
});

export default share;
