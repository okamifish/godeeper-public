import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { checkNodeLimit } from "../middleware/membership";
import { hasCapability } from "../lib/capabilities";
import { getProServices } from "../pro/runtime";
import { userOwnsCanvas, getOwnedNode } from "../lib/ownership";
import type { Variables } from "../types";
import * as nodeService from "../services/node.service";

const node = new Hono<{ Variables: Variables }>();

node.use("/*", authMiddleware);

const syncSchema = z.object({
  canvasId: z.string().uuid(),
  upserts: z.array(z.object({
    id: z.string(),
    kind: z.string(),
    title: z.string(),
    body: z.string(),
  })).optional().default([]),
  deletes: z.array(z.string()).optional().default([]),
  replace: z.boolean().optional().default(false),
});

node.post("/sync", zValidator("json", syncSchema), async (c) => {
  const user = c.get("user");
  const { canvasId, upserts, deletes, replace } = c.req.valid("json");

  if (!(await userOwnsCanvas(canvasId, user.id))) {
    return c.json({ error: "Canvas not found" }, 404);
  }

  const conflicts = await nodeService.findCrossCanvasConflicts(
    canvasId,
    upserts.map((node) => node.id),
  );
  if (conflicts.length > 0) {
    return c.json({ error: "Node id already used in another canvas", nodeIds: conflicts }, 409);
  }

  const limitCheck = await checkNodeLimit(canvasId, user.id, user.membership, {
    upsertIds: upserts.map((item) => item.id),
    replace,
  });
  if (limitCheck && !limitCheck.allowed) {
    return c.json({
      error: `Node limit reached (${limitCheck.limit})`,
      current: limitCheck.current,
      projected: limitCheck.projected,
    }, 403);
  }

  await nodeService.syncNodes(canvasId, user.id, upserts, deletes, replace);
  return c.json({ ok: true });
});

// 统一搜索：免费用户最多看到 5 条标题预览；全文与跳转由私有 Pro 服务提供。
node.get("/search", async (c) => {
  const user = c.get("user");
  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ locked: false, results: [] });

  const canCrossCanvas = hasCapability(user.membership, "search.crossCanvas");
  const pro = getProServices();
  if (canCrossCanvas && pro) {
    const results = await pro.searchFull(user.id, q);
    return c.json({ locked: false, results });
  }

  // 社区版即使会员是 pro，也没有 Pro 服务，只能退回预览。
  const results = await nodeService.searchPreview(user.id, q);
  return c.json({ locked: true, results });
});

const backlinksQuerySchema = z.object({
  canvasId: z.string().uuid(),
  nodeId: z.string().min(1).max(200),
});

node.get("/backlinks", zValidator("query", backlinksQuerySchema), async (c) => {
  const user = c.get("user");
  const { canvasId, nodeId } = c.req.valid("query");

  if (!(await userOwnsCanvas(canvasId, user.id))) {
    return c.json({ error: "Not found" }, 404);
  }
  const owned = await getOwnedNode(nodeId, user.id);
  if (!owned || owned.canvasId !== canvasId) {
    return c.json({ error: "Not found" }, 404);
  }

  const canCrossCanvas = hasCapability(user.membership, "mention.crossCanvas");
  const local = await nodeService.findSameCanvasBacklinks(user.id, canvasId, nodeId);
  const pro = getProServices();
  if (canCrossCanvas && pro) {
    const cross = await pro.findCrossCanvasBacklinks(user.id, canvasId, nodeId);
    const backlinks = [...local, ...cross];
    return c.json({
      locked: false,
      hasCrossCanvas: cross.length > 0,
      total: backlinks.length,
      backlinks,
    });
  }

  // 免费用户只返回同画布内容；跨画布只给“存在”信号用于升级提示。
  const hasCrossCanvas = await nodeService.hasCrossCanvasBacklinks(user.id, canvasId, nodeId);
  return c.json({
    locked: true,
    hasCrossCanvas,
    total: local.length,
    backlinks: local,
  });
});

export default node;
