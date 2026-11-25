import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { requireAiConfig } from "../middleware/ai-config";
import { checkAndIncrementAiUsage, completeAiUsage, aiUsageFailure } from "../middleware/membership";
import { SafeFetchError } from "../lib/safe-fetch";
import type { Variables } from "../types";
import * as aiService from "../services/ai.service";
import { resolvePrompt } from "../prompts/resolver";

const importRoute = new Hono<{ Variables: Variables }>();

importRoute.use("/*", authMiddleware);
importRoute.use("/*", requireAiConfig);

const urlSchema = z.object({
  url: z.string().url(),
  fragmentCount: z.number().min(3).max(7).optional().default(3),
});

const textSchema = z.object({
  text: z.string().min(1).max(20_000),
  fragmentCount: z.number().min(3).max(7).optional().default(3),
});

importRoute.post("/url", zValidator("json", urlSchema), async (c) => {
  const user = c.get("user");
  const { url, fragmentCount } = c.req.valid("json");

  const usage = await checkAndIncrementAiUsage(user.id, user.membership, {
    feature: "source",
  });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  try {
    const usageRef: { inputTokens?: number; outputTokens?: number } = {};
    const result = await completeAiUsage(usage.reservationId, async () => {
      const pageText = await aiService.fetchUrlText(url);
      return aiService.analyzeSource(user.id, await resolvePrompt("source:url-import", { url, fragmentCount, pageText }), undefined, (u) => {
        usageRef.inputTokens = u.inputTokens;
        usageRef.outputTokens = u.outputTokens;
      });
    }, () => usageRef);
    return c.json(toDecomposeResponse(result, url, new URL(url).hostname, fragmentCount));
  } catch (err) {
    const status = err instanceof SafeFetchError ? err.status : 400;
    return c.json({ error: err instanceof Error ? err.message : "Unable to fetch this URL" }, status);
  }
});

importRoute.post("/text", zValidator("json", textSchema), async (c) => {
  const user = c.get("user");
  const { text, fragmentCount } = c.req.valid("json");

  const usage = await checkAndIncrementAiUsage(user.id, user.membership, {
    feature: "source",
  });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  const usageRef: { inputTokens?: number; outputTokens?: number } = {};
  const result = await completeAiUsage(usage.reservationId, async () =>
    aiService.analyzeSource(user.id, await resolvePrompt("source:text-import", { fragmentCount, text: text.slice(0, 20_000) }), undefined, (u) => {
      usageRef.inputTokens = u.inputTokens;
      usageRef.outputTokens = u.outputTokens;
    }), () => usageRef);
  return c.json(toDecomposeResponse(result, text.slice(0, 60) || "Imported Text", "text source", fragmentCount));
});

importRoute.post("/file", async (c) => {
  const user = c.get("user");

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "No file received" }, 400);
  }

  const rawFile = form.get("file");
  const fragmentCountRaw = Number(form.get("fragmentCount") ?? 3);
  const fragmentCount = Math.max(3, Math.min(7, Number.isFinite(fragmentCountRaw) ? fragmentCountRaw : 3));

  if (!rawFile || typeof rawFile === "string" || typeof (rawFile as any).arrayBuffer !== "function") {
    return c.json({ error: "No file received" }, 400);
  }

  const file = rawFile as unknown as {
    name?: string;
    type?: string;
    size?: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
    text?: () => Promise<string>;
  };
  const filename = file.name ?? "uploaded-file";
  const mediaType = file.type || (filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain");
  const size = file.size ?? 0;
  const maxPdfBytes = 12 * 1024 * 1024;
  const maxTextBytes = 2 * 1024 * 1024;

  if (size <= 0) {
    return c.json({ error: "File is empty" }, 400);
  }

  const isPdf = mediaType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    if (size > maxPdfBytes) return c.json({ error: "PDF is too large. Please use a file under 12MB." }, 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = Buffer.from(bytes.slice(0, 5)).toString("utf8");
    if (header !== "%PDF-") {
      return c.json({ error: "File content is not a valid PDF" }, 400);
    }

    const usage = await checkAndIncrementAiUsage(user.id, user.membership, {
      feature: "source",
    });
    if (!usage.allowed) {
      const failure = aiUsageFailure(usage);
      return c.json(failure.body, failure.status);
    }

    try {
      const usageRef: { inputTokens?: number; outputTokens?: number } = {};
      const result = await completeAiUsage(usage.reservationId, () =>
        aiService.analyzePdfSource(
          user.id,
          { filename, data: bytes, mediaType: "application/pdf" },
          fragmentCount,
          undefined,
          (u) => {
            usageRef.inputTokens = u.inputTokens;
            usageRef.outputTokens = u.outputTokens;
          },
        ), () => usageRef);
      return c.json(toDecomposeResponse(result, filename, "pdf file", fragmentCount));
    } catch {
      return c.json({ error: "Unable to read this PDF. Try another file." }, 400);
    }
  }

  if (!filename.toLowerCase().endsWith(".txt") && !filename.toLowerCase().endsWith(".md") && !mediaType.startsWith("text/")) {
    return c.json({ error: "Unsupported file type. TXT, MD and PDF are supported." }, 400);
  }

  if (size > maxTextBytes) {
    return c.json({ error: "Text file is too large. Please use a file under 2MB." }, 413);
  }

  const text = typeof file.text === "function"
    ? await file.text()
    : Buffer.from(await file.arrayBuffer()).toString("utf8");

  if (!text.trim()) {
    return c.json({ error: "File has no readable text" }, 400);
  }

  const usage = await checkAndIncrementAiUsage(user.id, user.membership, {
    feature: "source",
  });
  if (!usage.allowed) {
    const failure = aiUsageFailure(usage);
    return c.json(failure.body, failure.status);
  }

  const usageRef: { inputTokens?: number; outputTokens?: number } = {};
  const result = await completeAiUsage(usage.reservationId, async () =>
    aiService.analyzeSource(user.id, await resolvePrompt("source:file-import", { fragmentCount, filename, text: text.slice(0, 20_000) }), undefined, (u) => {
      usageRef.inputTokens = u.inputTokens;
      usageRef.outputTokens = u.outputTokens;
    }), () => usageRef);
  return c.json(toDecomposeResponse(result, filename, "text file", fragmentCount));
});

function toDecomposeResponse(
  result: { title: string; summary: string; keyPoints: Array<{ text: string; body: string }> },
  sourceTitle: string,
  sourceMeta: string,
  fragmentCount: number,
) {
  const fragments = result.keyPoints.slice(0, fragmentCount).map((point) => ({
    title: point.text,
    body: point.body,
  }));

  return {
    title: result.title,
    summary: result.summary,
    sourceMeta,
    fragments,
    sourceNode: {
      title: result.title || sourceTitle,
      body: result.summary,
      sourceMeta,
    },
    fragmentNodes: fragments,
    taskNode: {
      title: "继续深入分析导入内容",
      body: "基于导入来源继续提取可追问、可验证、可形成推理链的问题。",
      chips: fragments.map((fragment) => fragment.title.slice(0, 24)).filter(Boolean),
    },
    resultNodes: [],
  };
}

export default importRoute;
