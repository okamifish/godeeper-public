import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { requireAiConfig } from "../middleware/ai-config";
import { checkAndIncrementAiUsage, completeAiUsage, aiUsageFailure } from "../middleware/membership";
import { checkBurstAbuse, checkDailyAbuse, checkFailureRate } from "../middleware/risk-control";
import { hasCapability } from "../lib/capabilities";
import { getProServices } from "../pro/runtime";
import { SafeFetchError } from "../lib/safe-fetch";
import type { Variables } from "../types";
import * as aiService from "../services/ai.service";
import { validateOrganizedReport, repairOrganizedReport } from "../services/report-validation";
import { resolvePrompt } from "../prompts/resolver";

const ai = new Hono<{ Variables: Variables }>();
ai.use("/*", authMiddleware);
ai.use("/*", requireAiConfig);

function proUnavailable(c: any, capability: string) {
  return c.json({
    error: `Requires capability: ${capability}`,
    code: "CAPABILITY_REQUIRED",
    capability,
  }, 403);
}

ai.post("/analyze-url", zValidator("json", z.object({ url: z.string().url(), model: z.string().optional() })), async (c) => {
  const user = c.get("user");
  const { url, model } = c.req.valid("json");
  const resolvedModel = model || c.get("aiModel") || undefined;

  const burst = await checkBurstAbuse(user.id);
  if (!burst.allowed) return c.json({ error: burst.reason }, 429);

  const usage = await checkAndIncrementAiUsage(user.id, user.membership, { feature: "source", model: resolvedModel });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  checkDailyAbuse(user.id, user.membership).catch(() => {});

  try {
    const usageRef: { inputTokens?: number; outputTokens?: number } = {};
    const result = await completeAiUsage(usage.reservationId, async () => {
      const pageText = await aiService.fetchUrlText(url);
      return aiService.analyzeSource(user.id, await resolvePrompt("source:url-analyze", { url, pageText }), resolvedModel, (u) => {
        usageRef.inputTokens = u.inputTokens;
        usageRef.outputTokens = u.outputTokens;
      });
    }, () => usageRef);
    return c.json(result);
  } catch (err) {
    if (err instanceof SafeFetchError) {
      return c.json({ error: err.message }, err.status);
    }
    throw err;
  }
});

ai.post("/expand", zValidator("json", z.object({ pointText: z.string(), summary: z.string(), model: z.string().optional() })), async (c) => {
  const user = c.get("user");
  const { pointText, summary, model } = c.req.valid("json");
  const resolvedModel = model || c.get("aiModel") || undefined;

  const burst = await checkBurstAbuse(user.id);
  if (!burst.allowed) return c.json({ error: burst.reason }, 429);

  const usage = await checkAndIncrementAiUsage(user.id, user.membership, { feature: "expand", model: resolvedModel });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  const usageRef: { inputTokens?: number; outputTokens?: number } = {};
  const result = await completeAiUsage(usage.reservationId, () =>
    aiService.expandPoint(user.id, pointText, summary, resolvedModel, (u) => {
      usageRef.inputTokens = u.inputTokens;
      usageRef.outputTokens = u.outputTokens;
    }), () => usageRef);
  return c.json({ text: result });
});

ai.post("/inspire", zValidator("json", z.object({ context: z.string(), model: z.string().optional() })), async (c) => {
  const user = c.get("user");
  const { context, model } = c.req.valid("json");
  const resolvedModel = model || c.get("aiModel") || undefined;

  const burst = await checkBurstAbuse(user.id);
  if (!burst.allowed) return c.json({ error: burst.reason }, 429);

  const usage = await checkAndIncrementAiUsage(user.id, user.membership, { feature: "inspire", model: resolvedModel });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  const usageRef: { inputTokens?: number; outputTokens?: number } = {};
  const result = await completeAiUsage(usage.reservationId, () =>
    aiService.generateInspiration(user.id, context, resolvedModel, (u) => {
      usageRef.inputTokens = u.inputTokens;
      usageRef.outputTokens = u.outputTokens;
    }), () => usageRef);
  return c.json(result);
});

const socraticRoundSchema = z.object({
  question: z.string().min(1).max(80),
  answer: z.string().min(1).max(2000),
});

const socraticSchema = z.object({
  action: z.enum(["start", "answer", "resume", "finish"]),
  source: z.string().min(1).max(1200),
  context: z.array(z.string().max(4000)).max(12).default([]),
  history: z.array(socraticRoundSchema).max(5).default([]),
  answer: z.string().max(2000).optional(),
  locale: z.enum(["zh", "en"]).optional(),
  model: z.string().min(1).max(120).optional(),
});

ai.post("/socratic", zValidator("json", socraticSchema), async (c) => {
  const user = c.get("user");
  if (!hasCapability(user.membership, "ai.socratic")) return proUnavailable(c, "ai.socratic");
  const input = c.req.valid("json");
  const resolvedModel = input.model || c.get("aiModel") || undefined;
  const pro = getProServices();
  if (!pro) return proUnavailable(c, "ai.socratic");

  if (input.action === "answer" && !input.answer?.trim()) {
    return c.json({ error: "AI_SOCRATIC_ANSWER_REQUIRED" }, 400);
  }

  const burst = await checkBurstAbuse(user.id);
  if (!burst.allowed) return c.json({ error: burst.reason }, 429);
  const failCheck = await checkFailureRate(user.id);
  if (!failCheck.allowed) return c.json({ error: failCheck.reason }, 429);

  // 追问复用 inspire credit 桶；BYOK 不扣 credits、不占每日次数。
  const usage = await checkAndIncrementAiUsage(user.id, user.membership, {
    feature: "socratic",
    model: resolvedModel,
  });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  const usageRef: { inputTokens?: number; outputTokens?: number } = {};
  try {
    if (input.action === "finish") {
      const result = await completeAiUsage(usage.reservationId, () =>
        pro.generateSocraticSummary({
          userId: user.id,
          source: input.source,
          history: input.history,
          locale: input.locale,
          model: resolvedModel,
          onUsage: (u) => {
            usageRef.inputTokens = u.inputTokens;
            usageRef.outputTokens = u.outputTokens;
          },
        }), () => usageRef);
      return c.json(result);
    }

    const turnAction = input.action === "start"
      ? "start"
      : input.action === "resume"
        ? "resume"
        : "answer";
    const result = await completeAiUsage(usage.reservationId, () =>
      pro.generateSocraticTurn({
        userId: user.id,
        action: turnAction,
        source: input.source,
        context: input.context,
        history: input.history,
        answer: input.answer,
        locale: input.locale,
        model: resolvedModel,
        onUsage: (u) => {
          usageRef.inputTokens = u.inputTokens;
          usageRef.outputTokens = u.outputTokens;
        },
      }), () => usageRef);
    return c.json(result);
  } catch (err) {
    if ((err as { code?: string }).code === "AI_SOCRATIC_INVALID") {
      return c.json({ error: "AI_SOCRATIC_INVALID" }, 422);
    }
    throw err;
  }
});

const reportCatalogItemSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(400),
  body: z.string().max(20000),
  why: z.string().max(4000).optional(),
  dependsOn: z.array(z.string().max(200)).optional(),
  role: z.string().max(40).optional(),
  recommended: z.boolean().optional(),
  source: z.string().max(40).optional(),
}).passthrough();

const reportCatalogSchema = z.object({
  mode: z.enum(["answers", "directions"]),
  items: z.array(reportCatalogItemSchema),
  collapsed: z.boolean().optional(),
  summary: z.string().max(4000).optional(),
}).passthrough();

const reportSocraticRoundSchema = z.object({
  question: z.string().max(4000),
  answer: z.string().max(20000),
  cardTitle: z.string().max(400),
  cardBody: z.string().max(20000),
  dimension: z.string().max(40),
  createdAt: z.string().max(80),
}).passthrough();

const reportSocraticSessionSchema = z.object({
  id: z.string().min(1).max(200),
  sourceNodeId: z.string().min(1).max(200),
  sourceTitle: z.string().max(400),
  sourceBody: z.string().max(20000),
  rounds: z.array(reportSocraticRoundSchema),
  status: z.enum(["asking", "done"]),
  title: z.string().max(400).optional(),
  summary: z.string().max(4000).optional(),
  blindSpots: z.array(z.string().max(4000)).optional(),
}).passthrough();

const reportNodeSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.string().min(1).max(40),
  title: z.string().max(400).default(""),
  // 与画布 MAX_NODE_BODY_CHARS 保持一致；不是产品级截断，而是请求体护栏。
  body: z.string().max(20000).default(""),
  collapsed: z.boolean().optional(),
  hidden: z.boolean().optional(),
  taskType: z.string().max(40).optional(),
  author: z.string().max(40).optional(),
  status: z.string().max(40).optional(),
  summary: z.string().max(4000).optional(),
  keyPoints: z.array(z.object({
    text: z.string().max(4000),
    body: z.string().max(20000),
    expanded: z.boolean().optional(),
  }).passthrough()).optional(),
  url: z.string().max(4000).optional(),
  catalog: reportCatalogSchema.optional(),
  socraticSession: reportSocraticSessionSchema.optional(),
  notePages: z.array(z.object({
    ocrMarkdown: z.string().max(200000),
    editedMarkdown: z.string().max(200000).optional(),
  }).passthrough()).optional(),
  inspireQuestion: z.string().max(4000).optional(),
  inspireReason: z.string().max(4000).optional(),
  inspirePrerequisites: z.array(z.string().max(4000)).optional(),
  locked: z.boolean().optional(),
}).passthrough();

const reportEdgeSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(200),
  target: z.string().min(1).max(200),
  relation: z.enum(["branch", "evidence", "result", "reference", "attachment"]),
  sourceHandle: z.string().max(100).optional(),
  targetHandle: z.string().max(100).optional(),
  hidden: z.boolean().optional(),
}).passthrough();

const reportGroupSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(400),
  color: z.string().max(80).optional(),
  nodeIds: z.array(z.string().max(200)),
  partial: z.boolean().optional(),
}).passthrough();

const reportConceptSchema = z.object({
  id: z.string().min(1).max(200),
  term: z.string().max(400),
  explanation: z.string().max(20000),
  points: z.array(z.string().max(4000)),
  sourceNodeId: z.string().min(1).max(200),
}).passthrough();

const organizeReportSchema = z.object({
  scope: z.object({
    mode: z.enum(["canvas", "branch", "selection"]),
    rootNodeIds: z.array(z.string().max(200)).default([]),
    nodeIds: z.array(z.string().max(200)).min(1),
    edgeIds: z.array(z.string().max(200)).default([]),
  }),
  canvas: z.object({
    name: z.string().max(200),
    locale: z.enum(["zh", "en"]),
    guideMode: z.boolean(),
  }),
  nodes: z.array(reportNodeSchema).min(1),
  edges: z.array(reportEdgeSchema),
  groups: z.array(reportGroupSchema),
  concepts: z.array(reportConceptSchema),
  model: z.string().min(1).max(120).optional(),
});

ai.post("/organize-report", zValidator("json", organizeReportSchema), async (c) => {
  const user = c.get("user");
  if (!hasCapability(user.membership, "report.aiOrganize")) return proUnavailable(c, "report.aiOrganize");
  const input = c.req.valid("json");
  const resolvedModel = input.model || c.get("aiModel") || undefined;
  const pro = getProServices();
  if (!pro) return proUnavailable(c, "report.aiOrganize");

  const burst = await checkBurstAbuse(user.id);
  if (!burst.allowed) return c.json({ error: burst.reason }, 429);
  const failCheck = await checkFailureRate(user.id);
  if (!failCheck.allowed) return c.json({ error: failCheck.reason }, 429);

  // 报告整理复用 summary credit 桶；BYOK 不占每日次数、不扣 credits。
  const usage = await checkAndIncrementAiUsage(user.id, user.membership, {
    feature: "summary",
    model: resolvedModel,
  });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  const usageRef: { inputTokens?: number; outputTokens?: number } = {};
  try {
    const result = await completeAiUsage(usage.reservationId, async () => {
      const report = await pro.organizeReport({
        ...input,
        userId: user.id,
        model: resolvedModel,
        onUsage: (u) => {
          usageRef.inputTokens = u.inputTokens;
          usageRef.outputTokens = u.outputTokens;
        },
      });

      // 先做记账类修复（重复归属、目录条目锚点、里程碑阶段），再做硬约束校验。
      // 两者都在成功标记之前；校验失败会抛错，completeAiUsage 负责退积分。
      const repaired = repairOrganizedReport(input, report);
      const validation = validateOrganizedReport(input, repaired.report);
      if (!validation.ok) {
        const error = new Error("AI_ORGANIZE_INVALID") as Error & {
          code?: string;
          issues?: unknown;
          repairs?: string[];
        };
        error.code = "AI_ORGANIZE_INVALID";
        error.issues = validation.issues;
        error.repairs = repaired.repairs;
        throw error;
      }
      return { ...repaired.report, repairs: repaired.repairs };
    }, () => usageRef);
    return c.json({ ...result, usage: usageRef });
  } catch (err) {
    if ((err as { code?: string }).code === "AI_ORGANIZE_INVALID") {
      return c.json({
        error: "AI_ORGANIZE_INVALID",
        code: "AI_ORGANIZE_INVALID",
        issues: (err as { issues?: unknown }).issues ?? [],
        repairs: (err as { repairs?: unknown }).repairs ?? [],
      }, 422);
    }
    throw err;
  }
});

const critiqueSchema = z.object({
  claim: z.object({
    title: z.string().min(1).max(300),
    body: z.string().max(3000).optional(),
    taskType: z.string().max(40).optional(),
  }),
  evidence: z.array(z.object({
    title: z.string().max(200),
    text: z.string().max(1200),
  })).max(10).default([]),
  locale: z.enum(["zh", "en"]).optional(),
  model: z.string().min(1).max(120).optional(),
});

ai.post("/critique", zValidator("json", critiqueSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");
  const resolvedModel = input.model || c.get("aiModel") || undefined;

  const burst = await checkBurstAbuse(user.id);
  if (!burst.allowed) return c.json({ error: burst.reason }, 429);
  const failCheck = await checkFailureRate(user.id);
  if (!failCheck.allowed) return c.json({ error: failCheck.reason }, 429);

  // 反驳复用 inspire credit 桶；BYOK 不占每日次数、不扣 credits。
  const usage = await checkAndIncrementAiUsage(user.id, user.membership, {
    feature: "critique",
    model: resolvedModel,
  });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  const usageRef: { inputTokens?: number; outputTokens?: number } = {};
  try {
    const result = await completeAiUsage(usage.reservationId, () =>
      aiService.critiqueClaim(user.id, {
        claim: input.claim,
        evidence: input.evidence,
        locale: input.locale,
      }, resolvedModel, (u) => {
        usageRef.inputTokens = u.inputTokens;
        usageRef.outputTokens = u.outputTokens;
      }), () => usageRef);
    return c.json(result);
  } catch (err) {
    if (err instanceof aiService.CritiqueInvalidError) {
      return c.json({ error: "AI_CRITIQUE_INVALID" }, 422);
    }
    throw err;
  }
});

const explainConceptSchema = z.object({
  term: z.string().min(1).max(120),
  context: z.array(z.string().max(1200)).max(10).default([]),
  locale: z.enum(["zh", "en"]).optional(),
  model: z.string().min(1).max(120).optional(),
});

ai.post("/explain-concept", zValidator("json", explainConceptSchema), async (c) => {
  const user = c.get("user");
  if (!hasCapability(user.membership, "ai.concept")) return proUnavailable(c, "ai.concept");
  const input = c.req.valid("json");
  const resolvedModel = input.model || c.get("aiModel") || undefined;
  const pro = getProServices();
  if (!pro) return proUnavailable(c, "ai.concept");

  const burst = await checkBurstAbuse(user.id);
  if (!burst.allowed) return c.json({ error: burst.reason }, 429);
  const failCheck = await checkFailureRate(user.id);
  if (!failCheck.allowed) return c.json({ error: failCheck.reason }, 429);

  // 概念解释与启发同属“理解当前思考”，暂复用 inspire 桶。
  const usage = await checkAndIncrementAiUsage(user.id, user.membership, {
    feature: "concept",
    model: resolvedModel,
  });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  const usageRef: { inputTokens?: number; outputTokens?: number } = {};
  try {
    const result = await completeAiUsage(usage.reservationId, () =>
      pro.explainConcept({
        userId: user.id,
        term: input.term,
        context: input.context,
        locale: input.locale,
        model: resolvedModel,
        onUsage: (u) => {
          usageRef.inputTokens = u.inputTokens;
          usageRef.outputTokens = u.outputTokens;
        },
      }), () => usageRef);
    return c.json(result);
  } catch (err) {
    if ((err as { code?: string }).code === "AI_CONCEPT_INVALID") {
      return c.json({ error: "AI_CONCEPT_INVALID" }, 422);
    }
    throw err;
  }
});

export default ai;
