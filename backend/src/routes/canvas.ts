import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { checkCanvasLimit } from "../middleware/membership";
import { invalidId, isUuid, readJsonBody } from "../lib/params";
import type { Variables } from "../types";
import * as canvasService from "../services/canvas.service";

const canvas = new Hono<{ Variables: Variables }>();

canvas.use("/*", authMiddleware);

canvas.get("/", async (c) => {
  const user = c.get("user");
  const list = await canvasService.listCanvases(user.id);
  return c.json(list);
});

canvas.post("/", checkCanvasLimit, zValidator("json", z.object({ title: z.string().optional() })), async (c) => {
  const user = c.get("user");
  const { title } = c.req.valid("json");
  const result = await canvasService.createCanvas(user.id, title ?? "Untitled Canvas");
  return c.json(result, 201);
});

canvas.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isUuid(id)) return invalidId(c, "canvas id");
  const user = c.get("user");
  const result = await canvasService.getCanvas(id, user.id);
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

const updateSchema = z.object({
  title: z.string().optional(),
  isPublic: z.boolean().optional(),
  allowPublicComments: z.boolean().optional(),
});

canvas.put("/:id", zValidator("json", updateSchema), async (c) => {
  const id = c.req.param("id");
  if (!isUuid(id)) return invalidId(c, "canvas id");
  const user = c.get("user");
  const data = c.req.valid("json");
  const result = await canvasService.updateCanvas(id, user.id, data);
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

canvas.put("/:id/snapshot", async (c) => {
  const id = c.req.param("id");
  if (!isUuid(id)) return invalidId(c, "canvas id");

  const body = await readJsonBody(c);
  if (!body.ok) return c.json({ error: body.error }, body.status);

  const snapshot = body.value;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return c.json({ error: "Snapshot must be an object" }, 400);
  }
  const record = snapshot as Record<string, unknown>;
  if (record.nodes !== undefined && !Array.isArray(record.nodes)) {
    return c.json({ error: "Snapshot.nodes must be an array" }, 400);
  }
  if (record.edges !== undefined && !Array.isArray(record.edges)) {
    return c.json({ error: "Snapshot.edges must be an array" }, 400);
  }
  if ((record.nodes as unknown[] | undefined)?.length && (record.nodes as unknown[]).length > 2_000) {
    return c.json({ error: "Snapshot contains too many nodes" }, 400);
  }

  const user = c.get("user");
  await canvasService.saveSnapshot(id, user.id, snapshot);
  return c.json({ ok: true });
});

canvas.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isUuid(id)) return invalidId(c, "canvas id");
  const user = c.get("user");
  await canvasService.deleteCanvas(id, user.id);
  return c.json({ ok: true });
});

export default canvas;
