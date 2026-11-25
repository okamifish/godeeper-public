import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { invalidId, isUuid } from "../lib/params";
import type { Variables } from "../types";
import * as canvasService from "../services/canvas.service";
import * as commentService from "../services/comment.service";

const publicRoute = new Hono<{ Variables: Variables }>();

const publicCommentSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

// 已发布画布无需登录即可只读查看。
publicRoute.get("/canvas/:id", async (c) => {
  const id = c.req.param("id");
  if (!isUuid(id)) return invalidId(c, "canvas id");
  const result = await canvasService.getPublicCanvas(id);
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

// 留言需要登录；留言只给作者看，公开页不提供留言列表。
publicRoute.post(
  "/canvas/:id/comments",
  authMiddleware,
  zValidator("json", publicCommentSchema),
  async (c) => {
    const id = c.req.param("id");
    if (!isUuid(id)) return invalidId(c, "canvas id");

    const canvas = await canvasService.getPublicCanvas(id);
    if (!canvas) return c.json({ error: "Not found" }, 404);
    if (!canvas.commentsEnabled) {
      return c.json({ error: "The author has disabled comments" }, 403);
    }

    const user = c.get("user");
    const recent = await commentService.countRecentComments(id, user.id);
    if (recent >= 5) {
      return c.json({ error: "Too many comments, please try again later" }, 429);
    }

    const { content } = c.req.valid("json");
    const comment = await commentService.createComment(id, user.id, content);
    return c.json({ ok: true, commentId: comment.id }, 201);
  },
);

export default publicRoute;
