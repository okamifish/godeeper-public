import { QUESTION_DEPTH_CRITERIA } from "../prompts/catalog";
import { resolvePrompt } from "../prompts/resolver";

export type QualityStatus = "qualified" | "normal";

/** 联调开关：返回固定结果；未开启时为 null。生产环境禁止设置 JEV_MOCK_RESULT。 */
export function qualityMockStatus(): QualityStatus | null {
  const mock = (process.env.JEV_MOCK_RESULT ?? "").trim().toLowerCase();
  return mock === "qualified" || mock === "normal" ? mock : null;
}
export type QualitySkipReason =
  | "disabled"
  | "skipped"
  | "rate_limited"
  | "byok_not_supported";

export interface QualityVerdict {
  status: QualityStatus | QualitySkipReason;
  confidence: number;
  model: string;
}

interface JevAnswer {
  type?: string;
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
}

interface JevResponse {
  model?: string;
  answers?: { quality?: JevAnswer };
  usage?: { input_tokens?: number };
}

const DEFAULT_BASE_URL = "https://jevmodel.org/v1/systemone";
const DEFAULT_MODEL = "jev-1.13.0";
const DEFAULT_MIN_CONFIDENCE = 0.8;
const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_DAILY_LIMIT_PER_USER = 200;
const GLOBAL_LIMIT_PER_MINUTE = 100;
const MAX_CONTEXT_CHARS = 1200;

/** 单进程限流；多实例部署时各实例独立计数（见 TASK_SPEC 开放假设）。 */
const dailyCounters = new Map<string, { date: string; count: number }>();
let globalWindow: number[] = [];

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function consumeBudget(userId: string): "ok" | "daily_limit" | "global_limit" {
  const now = Date.now();
  globalWindow = globalWindow.filter((stamp) => now - stamp < 60_000);
  if (globalWindow.length >= GLOBAL_LIMIT_PER_MINUTE) {
    return "global_limit";
  }

  const date = todayUtc();
  const current = dailyCounters.get(userId);
  const count = current && current.date === date ? current.count : 0;
  const dailyLimit = Number(process.env.JEV_DAILY_LIMIT_PER_USER ?? DEFAULT_DAILY_LIMIT_PER_USER);
  if (count >= dailyLimit) {
    return "daily_limit";
  }

  dailyCounters.set(userId, { date, count: count + 1 });
  globalWindow.push(now);
  return "ok";
}

function readConfig() {
  return {
    apiKey: process.env.JEV_API_KEY ?? "",
    baseUrl: process.env.JEV_BASE_URL || DEFAULT_BASE_URL,
    model: process.env.JEV_MODEL || DEFAULT_MODEL,
    minConfidence: Number(process.env.JEV_MIN_CONFIDENCE ?? DEFAULT_MIN_CONFIDENCE),
    timeoutMs: Number(process.env.JEV_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
}

function buildState(question: string, context: string): string {
  const trimmedContext = context.trim().slice(0, MAX_CONTEXT_CHARS);
  return `Question:\n${question.trim()}\n\nContext:\n${trimmedContext || "(none)"}`;
}

/**
 * 调用 JEV 判断问题深度。
 * 任何失败都返回 skipped，调用方无需处理异常。
 * 注意：这里不写 ai_usage，避免把判断请求计入用户的每日 AI 任务额度。
 */
export async function evaluateQuestionDepth(input: {
  userId: string;
  question: string;
  context?: string;
}): Promise<QualityVerdict> {
  const config = readConfig();

  // 联调开关：本地测试其他功能时固定返回结果，不请求真实 JEV。
  // 上线前必须确认生产环境没有设置 JEV_MOCK_RESULT。
  const mockStatus = qualityMockStatus();
  if (mockStatus) {
    return { status: mockStatus, confidence: 1, model: "jev-mock" };
  }

  if (!config.apiKey) {
    return { status: "disabled", confidence: 0, model: config.model };
  }

  const budget = consumeBudget(input.userId);
  if (budget !== "ok") {
    return { status: "rate_limited", confidence: 0, model: config.model };
  }

  try {
    const instructions = await resolvePrompt("quality:jev-depth");
    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        state: buildState(input.question, input.context ?? ""),
        questions: {
          quality: {
            type: "choice",
            instructions,
            criteria: QUESTION_DEPTH_CRITERIA,
          },
        },
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!response.ok) {
      return { status: "skipped", confidence: 0, model: config.model };
    }

    const payload = (await response.json()) as JevResponse;
    const answer = payload.answers?.quality;
    const choice = (answer?.choice ?? "").toUpperCase();
    const confidence = Number(
      answer?.confidence ?? (choice ? answer?.probabilities?.[choice] : 0) ?? 0,
    );
    const safeConfidence = Number.isFinite(confidence) ? confidence : 0;
    const model = payload.model || config.model;

    const qualified =
      choice === "QUALIFIED" && safeConfidence >= config.minConfidence;

    return {
      status: qualified ? "qualified" : "normal",
      confidence: safeConfidence,
      model,
    };
  } catch {
    return { status: "skipped", confidence: 0, model: config.model };
  }
}

/** 仅供测试使用：清空限流计数。 */
export function resetQualityRateLimits(): void {
  dailyCounters.clear();
  globalWindow = [];
}
