import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { requireAiConfig } from "../middleware/ai-config";
import { checkAndIncrementAiUsage, completeAiUsage, markAiUsageSuccess, releaseAiUsage, aiUsageFailure } from "../middleware/membership";
import { checkBurstAbuse, checkFailureRate, checkDailyAbuse } from "../middleware/risk-control";
import type { Variables } from "../types";
import * as aiService from "../services/ai.service";
import { hasCapability } from "../lib/capabilities";
import { getProServices } from "../pro/runtime";
import { streamSSE } from "../lib/stream";
import { db } from "../db";
import { taskRuns } from "../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const task = new Hono<{ Variables: Variables }>();

task.use("/*", authMiddleware);
task.use("/*", requireAiConfig);

const runSchema = z.object({
  prompt: z.string(),
  context: z.array(z.string()).optional().default([]),
  model: z.string().min(1).max(120).optional(),
  taskType: z.string().max(40).optional(),
  guideMode: z.boolean().optional(),
  guideChild: z.boolean().optional(),
});

task.post("/:taskId/run", zValidator("json", runSchema), async (c) => {
  const user = c.get("user");
  const { prompt, context, model, taskType, guideMode, guideChild } = c.req.valid("json");
  const taskId = c.req.param("taskId");
  const resolvedModel = model || c.get("aiModel") || "gpt-4o";
  const wantsGuide = Boolean(guideMode || guideChild);
  const pro = getProServices();

  if (wantsGuide && !hasCapability(user.membership, "ai.guided")) {
    return c.json({
      error: "Requires capability: ai.guided",
      code: "CAPABILITY_REQUIRED",
      capability: "ai.guided",
    }, 403);
  }
  if (wantsGuide && !pro) {
    return c.json({
      error: "Requires capability: ai.guided",
      code: "CAPABILITY_REQUIRED",
      capability: "ai.guided",
    }, 403);
  }

  const burst = await checkBurstAbuse(user.id);
  if (!burst.allowed) return c.json({ error: burst.reason }, 429);
  const failCheck = await checkFailureRate(user.id);
  if (!failCheck.allowed) return c.json({ error: failCheck.reason }, 429);

  const usage = await checkAndIncrementAiUsage(user.id, user.membership, {
    feature: "task",
    model: resolvedModel,
  });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  const runId = randomUUID();
  await db.insert(taskRuns).values({
    id: runId,
    taskId,
    userId: user.id,
    model: resolvedModel,
    status: "running",
  });

  const start = Date.now();
  const usageRef: { inputTokens?: number; outputTokens?: number } = {};
  try {
    const result = await completeAiUsage(usage.reservationId, () => {
      const onUsage = (u: { inputTokens?: number; outputTokens?: number }) => {
        usageRef.inputTokens = u.inputTokens;
        usageRef.outputTokens = u.outputTokens;
      };
      return wantsGuide && pro
        ? pro.runGuidedTask({
          userId: user.id,
          prompt,
          context,
          model: resolvedModel,
          taskType,
          guideMode,
          guideChild,
          onUsage,
        })
        : aiService.runTask(user.id, prompt, context, resolvedModel, onUsage, taskType);
    }, () => usageRef);
    const durationMs = Date.now() - start;

    await db.update(taskRuns)
      .set({
        status: "success",
        durationMs,
        ...(usageRef.inputTokens !== undefined ? { inputTokens: usageRef.inputTokens } : {}),
        ...(usageRef.outputTokens !== undefined ? { outputTokens: usageRef.outputTokens } : {}),
      })
      .where(eq(taskRuns.id, runId));

    return c.json({ taskId, ...result });
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    await db.update(taskRuns)
      .set({ status: "failed", durationMs, errorMsg })
      .where(eq(taskRuns.id, runId));

    return c.json({
      error: process.env.NODE_ENV === "production" ? "AI task failed" : errorMsg,
    }, 500);
  }
});

task.post("/:taskId/stream", zValidator("json", runSchema), async (c) => {
  const user = c.get("user");
  const { prompt, context, model, taskType } = c.req.valid("json");
  const taskId = c.req.param("taskId");
  const resolvedModel = model || c.get("aiModel") || "gpt-4o";

  const burst = await checkBurstAbuse(user.id);
  if (!burst.allowed) return c.json({ error: burst.reason }, 429);

  const usage = await checkAndIncrementAiUsage(user.id, user.membership, {
    feature: "task",
    model: resolvedModel,
  });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  const runId = randomUUID();
  await db.insert(taskRuns).values({
    id: runId,
    taskId,
    userId: user.id,
    model: resolvedModel,
    status: "running",
  });

  const start = Date.now();

  return streamSSE(c, async (send) => {
    try {
      const stream = await aiService.streamTaskRaw(user.id, prompt, context, resolvedModel, taskType);
      for await (const chunk of stream) {
        await send(chunk);
      }
      if (usage.reservationId) await markAiUsageSuccess(usage.reservationId);
      await db.update(taskRuns)
        .set({ status: "success", durationMs: Date.now() - start })
        .where(eq(taskRuns.id, runId));
    } catch (err) {
      if (usage.reservationId) await releaseAiUsage(usage.reservationId);
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      await db.update(taskRuns)
        .set({ status: "failed", durationMs: Date.now() - start, errorMsg })
        .where(eq(taskRuns.id, runId));
    }
  });
});

export default task;
