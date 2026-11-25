import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getDecryptedApiKey } from "./auth.service";
import { generateAiText, streamAiText } from "../ai-harness/runtime";
import type { AiCredential } from "../ai-harness/godeeper-adapter";
import { safeFetchText } from "../lib/safe-fetch";
import { resolveDefaultModel } from "../lib/model-defaults";
import {
  PROMPT_CATALOG_BY_ID,
  TASK_OUTPUT_CONTRACT,
  TASK_TYPE_INSTRUCTIONS,
  buildTaskSystemPromptContent,
  normalizeTaskType,
  renderTemplateContent,
} from "../prompts/catalog";
import {
  getEffectivePrompt,
  getEffectiveTaskParts,
  resolvePrompt,
  type PromptSource,
} from "../prompts/resolver";

function createModel(apiKey: string, provider: string, modelName: string, customBaseUrl?: string | null) {
  const baseURL = customBaseUrl
    ?? (provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : provider === "anthropic"
        ? "https://api.anthropic.com/v1"
        : provider === "siliconflow"
          ? "https://api.siliconflow.cn/v1"
          : undefined);

  const openai = createOpenAI({ apiKey, baseURL });
  // Non-OpenAI providers don't support the /responses endpoint.
  // Use chat completions (/chat/completions) for all non-openai providers.
  if (provider === "openai") {
    return openai(modelName);
  }
  return openai.chat(modelName);
}

export interface AiUsageInfo {
  inputTokens: number;
  outputTokens: number;
}

type UsageCallback = (usage: AiUsageInfo) => void;

function reportUsage(
  result: { usage?: { inputTokens?: number; outputTokens?: number } },
  onUsage?: UsageCallback,
) {
  if (!onUsage) return;
  onUsage({
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  });
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI_NOT_CONFIGURED");
    this.name = "AiNotConfiguredError";
  }
}

function getHostedCredential(): { credential: AiCredential; modelName: string } | null {
  const apiKey = process.env.HOSTED_AI_API_KEY;
  if (!apiKey) return null;
  const provider = process.env.HOSTED_AI_PROVIDER ?? "openai";
  const baseUrl = process.env.HOSTED_AI_BASE_URL ?? undefined;
  return {
    credential: { apiKey, provider, baseUrl },
    modelName: process.env.HOSTED_AI_MODEL || resolveDefaultModel(provider, baseUrl),
  };
}

async function getCredential(userId: string): Promise<{ credential: AiCredential; modelName: string }> {
  const keyInfo = await getDecryptedApiKey(userId);
  if (keyInfo) {
    return {
      credential: { apiKey: keyInfo.apiKey, provider: keyInfo.provider, baseUrl: keyInfo.baseUrl },
      modelName: keyInfo.modelName || resolveDefaultModel(keyInfo.provider, keyInfo.baseUrl),
    };
  }

  // 托管 AI：用户没有自己的 Key 时，走服务端托管的 provider；调用会扣 credits。
  const hosted = getHostedCredential();
  if (hosted) return hosted;

  throw new AiNotConfiguredError();
}

type SourceAnalysis = {
  title: string;
  summary: string;
  keyPoints: Array<{ text: string; body: string }>;
};

export { normalizeTaskType };

export function buildTaskSystemPrompt(basePrompt: string, taskType?: string): string {
  const type = normalizeTaskType(taskType);
  return buildTaskSystemPromptContent(basePrompt, TASK_OUTPUT_CONTRACT, TASK_TYPE_INSTRUCTIONS[type]);
}

async function getPrompt(feature: string): Promise<string> {
  return (await getEffectivePrompt(feature)).content;
}

/** 供私有 Pro 包读取生效提示词；默认模板与后台覆盖仍由核心维护。 */
export async function getPromptForPro(feature: string): Promise<string> {
  return getPrompt(feature);
}

function getTaskSystemPrompt(taskType?: string): Promise<string> {
  return getEffectiveTaskParts(taskType).then((parts) => parts.systemPrompt);
}

/**
 * 底层文本生成入口：只负责凭据、模型调用与 usage 上报。
 * Pro 包用它执行自己的系统提示词与归一化，核心不保留 Pro 功能的提示词实现。
 */
export async function runSystemPrompt(input: {
  userId: string;
  system: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  onUsage?: UsageCallback;
}): Promise<string> {
  const { credential, modelName } = await getCredential(input.userId);
  const result = await generateAiText(credential, {
    model: input.model || modelName,
    system: input.system,
    prompt: input.prompt,
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
  });
  reportUsage(result, input.onUsage);
  return result.text;
}

function normalizeSourceAnalysis(text: string): SourceAnalysis {
  try {
    const json = JSON.parse(text);
    return {
      title: String(json.title ?? "Untitled").slice(0, 60),
      summary: String(json.summary ?? "").slice(0, 200),
      keyPoints: Array.isArray(json.keyPoints)
        ? json.keyPoints.map((p: any) => ({ text: String(p.text ?? "").slice(0, 80), body: String(p.body ?? "").slice(0, 200) }))
        : [],
    };
  } catch {
    return { title: "Source Analysis", summary: text.slice(0, 200), keyPoints: [] };
  }
}

// ─── Task (reasoning) ───

export interface TaskRunResult {
  title?: string;
  results: Array<{ title: string; body: string }>;
}

/** 兼容旧版数组输出与新版 { title, results } 输出。 */
export function normalizeTaskRunResult(text: string, maxResults = 12): TaskRunResult {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const json = JSON.parse(cleaned);
    if (Array.isArray(json)) {
      return { results: normalizeTaskItems(json, maxResults) };
    }
    if (json && typeof json === "object") {
      const rawResults = Array.isArray(json.results)
        ? json.results
        : Array.isArray(json.insights)
          ? json.insights
          : [];
      const title = typeof json.title === "string" ? json.title.trim().slice(0, 40) : undefined;
      if (rawResults.length > 0) {
        return { title: title || undefined, results: normalizeTaskItems(rawResults, maxResults) };
      }
    }
  } catch {
    /* fall through to plain-text fallback */
  }
  return { results: [{ title: "AI Response", body: text.trim() }] };
}

function normalizeTaskItems(value: unknown[], maxResults = 12): Array<{ title: string; body: string }> {
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      title: String(item.title ?? "").trim().slice(0, 60),
      body: String(item.body ?? "").trim(),
    }))
    .filter((item) => item.title || item.body)
    .slice(0, maxResults);
}

export async function runTask(
  userId: string,
  prompt: string,
  context: string[],
  modelName?: string,
  onUsage?: UsageCallback,
  taskType?: string,
) {
  const { credential, modelName: configuredModel } = await getCredential(userId);
  const systemPrompt = (await getEffectiveTaskParts(taskType)).systemPrompt;
  const contextStr = context.length > 0
    ? await resolvePrompt("task:context-nodes", {
        context: context.map((c, i) => `${i + 1}. ${c}`).join("\n"),
      })
    : "";

  const result = await generateAiText(credential, {
    model: modelName || configuredModel,
    system: systemPrompt,
    prompt: `${prompt}${contextStr}`,
  });
  reportUsage(result, onUsage);
  const { text } = result;

  return normalizeTaskRunResult(text);
}

export async function streamTaskRaw(
  userId: string, prompt: string, context: string[], modelName?: string, taskType?: string,
): Promise<AsyncIterable<string>> {
  const { credential, modelName: configuredModel } = await getCredential(userId);
  const systemPrompt = await getTaskSystemPrompt(taskType);
  return streamAiText(credential, {
    model: modelName || configuredModel,
    system: systemPrompt,
    prompt: `${prompt}${context.length > 0 ? await resolvePrompt("task:context-stream", { context: context.join("\n") }) : ""}`,
  });
}

export async function streamTask(
  userId: string, prompt: string, context: string[], modelName: string | undefined,
  onChunk: (chunk: string) => void,
) {
  const stream = await streamTaskRaw(userId, prompt, context, modelName);
  for await (const chunk of stream) { onChunk(chunk); }
}

// ─── Source (URL / text analysis) ───

export async function analyzeSource(
  userId: string, content: string, modelName?: string, onUsage?: UsageCallback,
) {
  const { credential, modelName: configuredModel } = await getCredential(userId);
  const systemPrompt = await getPrompt("source");
  const result = await generateAiText(credential, {
    model: modelName || configuredModel,
    system: systemPrompt,
    prompt: content,
  });
  reportUsage(result, onUsage);
  const { text } = result;

  return normalizeSourceAnalysis(text);
}

export async function fetchUrlText(url: string) {
  const { text: raw, contentType } = await safeFetchText(url);

  if (!contentType.includes("html")) {
    return raw.slice(0, 20_000);
  }

  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20_000);
}

export async function analyzePdfSource(
  userId: string,
  file: { filename: string; data: Uint8Array; mediaType: string },
  fragmentCount: number,
  modelName?: string,
  onUsage?: UsageCallback,
) {
  const keyInfo = await getDecryptedApiKey(userId);
  if (!keyInfo) throw new AiNotConfiguredError();
  const model = createModel(keyInfo.apiKey, keyInfo.provider, modelName || keyInfo.modelName || resolveDefaultModel(keyInfo.provider, keyInfo.baseUrl), keyInfo.baseUrl);
  const systemPrompt = await getPrompt("source");

  const { text, usage } = await generateText({
    model,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: await resolvePrompt("source:pdf-analyze", { fragmentCount }),
          },
          {
            type: "file",
            filename: file.filename,
            data: file.data,
            mediaType: file.mediaType,
          },
        ],
      },
    ] as any,
  });

  reportUsage({ usage }, onUsage);
  return normalizeSourceAnalysis(text);
}

// ─── Expand ───

export async function expandPoint(
  userId: string, pointText: string, summary: string, modelName?: string, onUsage?: UsageCallback,
) {
  const { credential, modelName: configuredModel } = await getCredential(userId);
  const systemPrompt = await getPrompt("expand");
  const result = await generateAiText(credential, {
    model: modelName || configuredModel,
    system: systemPrompt,
    prompt: await resolvePrompt("expand:insight", { summary, pointText }),
  });
  reportUsage(result, onUsage);
  return result.text.trim().slice(0, 200);
}

// ─── Inspire ───

export async function generateInspiration(
  userId: string, context: string, modelName?: string, onUsage?: UsageCallback,
) {
  const { credential, modelName: configuredModel } = await getCredential(userId);
  const systemPrompt = await getPrompt("inspire");
  const result = await generateAiText(credential, {
    model: modelName || configuredModel,
    system: systemPrompt,
    prompt: context || await resolvePrompt("inspire:fallback"),
  });
  reportUsage(result, onUsage);
  const { text } = result;

  try {
    const json = JSON.parse(text);
    return {
      question: String(json.question ?? "").slice(0, 80),
      reason: String(json.reason ?? "").slice(0, 200),
      prerequisites: Array.isArray(json.prerequisites) ? json.prerequisites.map((p: any) => String(p).slice(0, 60)) : [],
    };
  } catch {
    return { question: text.slice(0, 80), reason: "", prerequisites: [] };
  }
}

// ─── Adversarial critique ───

export type CritiqueFindingKind = "counterexample" | "flaw" | "missing_evidence";

export interface CritiqueInput {
  claim: { title: string; body?: string; taskType?: string };
  evidence: Array<{ title: string; text: string }>;
  locale?: "zh" | "en";
}

export interface CritiqueFinding {
  kind: CritiqueFindingKind;
  title: string;
  body: string;
}

export class CritiqueInvalidError extends Error {
  constructor() {
    super("AI_CRITIQUE_INVALID");
    this.name = "CritiqueInvalidError";
  }
}

const CRITIQUE_KIND_ALIASES: Record<string, CritiqueFindingKind> = {
  counterexample: "counterexample",
  counter_example: "counterexample",
  counter: "counterexample",
  flaw: "flaw",
  gap: "flaw",
  hidden_assumption: "flaw",
  missing_evidence: "missing_evidence",
  missingevidence: "missing_evidence",
  missing: "missing_evidence",
};

const MAX_CRITIQUE_FINDINGS = 5;

/** 允许单测直接验证；清理未知 kind / 空字段 / 重复项，最多 5 条 */
export function normalizeCritiqueFindings(text: string): CritiqueFinding[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: any;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new CritiqueInvalidError();
  }

  const rawFindings = Array.isArray(json?.findings) ? json.findings : [];
  const seen = new Set<string>();
  const findings: CritiqueFinding[] = [];

  for (const raw of rawFindings) {
    if (findings.length >= MAX_CRITIQUE_FINDINGS) break;

    const kindKey = String(raw?.kind ?? "").trim().toLowerCase();
    const kind = CRITIQUE_KIND_ALIASES[kindKey];
    if (!kind) continue;

    const title = String(raw?.title ?? "").trim().slice(0, 60);
    const body = String(raw?.body ?? "").trim().slice(0, 200);
    if (!title || !body) continue;

    const dedupeKey = `${kind}:${title.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    findings.push({ kind, title, body });
  }

  if (findings.length === 0) throw new CritiqueInvalidError();
  return findings;
}

export async function critiqueClaim(
  userId: string,
  input: CritiqueInput,
  modelName?: string,
  onUsage?: UsageCallback,
): Promise<{ findings: CritiqueFinding[] }> {
  const { credential, modelName: configuredModel } = await getCredential(userId);
  const systemPrompt = await getPrompt("critique");
  const locale = input.locale === "en" ? "en" : "zh";
  const result = await generateAiText(credential, {
    model: modelName || configuredModel,
    system: systemPrompt,
    prompt: JSON.stringify({
      claim: input.claim,
      evidence: input.evidence,
      locale,
    }),
    temperature: 0.3,
    maxTokens: 900,
  });
  reportUsage(result, onUsage);

  return { findings: normalizeCritiqueFindings(result.text) };
}

// ─── Admin prompt testing ───

export interface PromptRunSide {
  raw: string;
  parsed: unknown | null;
  usage: AiUsageInfo;
  durationMs: number;
  error?: string;
}

export interface PromptComparisonInput {
  id: string;
  contentA: string;
  contentB: string;
  input: string;
  context?: string[];
  variables?: Record<string, string | number>;
  taskType?: string;
  model?: string;
}

export interface PromptComparisonResult {
  id: string;
  taskType: string;
  systemA: string;
  systemB: string;
  userMessage: string;
  a: PromptRunSide;
  b: PromptRunSide;
}

function tryParseJson(text: string): unknown | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/** 校验可测试条目；只有系统提示词与任务片段能直接交给模型。 */
function assertTestablePrompt(id: string) {
  const definition = PROMPT_CATALOG_BY_ID[id];
  if (!definition) throw new Error(`UNKNOWN_PROMPT_TEMPLATE: ${id}`);
  if (definition.scope === "user") {
    throw new Error("USER_TEMPLATE_NOT_RUNNABLE");
  }
  return definition;
}

/** 把 A/B 正文拼成最终系统提示词；任务片段只替换自己那一段。 */
async function composeTestSystemPrompt(id: string, content: string, taskType?: string): Promise<string> {
  assertTestablePrompt(id);
  if (id === "task") {
    const parts = await getEffectiveTaskParts(taskType);
    return buildTaskSystemPromptContent(content, parts.contract.content, parts.instruction.content);
  }
  if (id === "task:output-contract") {
    const parts = await getEffectiveTaskParts(taskType);
    return buildTaskSystemPromptContent(parts.base.content, content, parts.instruction.content);
  }
  if (id.startsWith("task:")) {
    const parts = await getEffectiveTaskParts(id.slice("task:".length));
    return buildTaskSystemPromptContent(parts.base.content, parts.contract.content, content);
  }
  return content;
}

/** 测试台用户消息：用户模板按变量渲染，任务类附带上下文。 */
async function buildTestUserMessage(
  id: string,
  input: string,
  context: string[] | undefined,
  variables: Record<string, string | number> | undefined,
  contentOverride?: string,
): Promise<string> {
  const definition = PROMPT_CATALOG_BY_ID[id];
  if (!definition) throw new Error(`UNKNOWN_PROMPT_TEMPLATE: ${id}`);

  if (definition.scope === "user") {
    return renderTemplateContent(contentOverride ?? definition.content, id, variables ?? {});
  }

  if (id === "task" || id.startsWith("task:")) {
    const rows = (context ?? []).map((item) => item.trim()).filter(Boolean);
    if (rows.length === 0) return input;
    const rendered = await resolvePrompt("task:context-nodes", {
      context: rows.map((item, index) => `${index + 1}. ${item}`).join("\n"),
    });
    return `${input}${rendered}`;
  }

  return input;
}

async function runPromptSide(
  credential: AiCredential,
  model: string,
  system: string,
  prompt: string,
): Promise<PromptRunSide> {
  const start = Date.now();
  try {
    const result = await generateAiText(credential, {
      model,
      system,
      prompt,
      temperature: 0.3,
    });
    return {
      raw: result.text,
      parsed: tryParseJson(result.text),
      usage: {
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
      },
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      raw: "",
      parsed: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export interface PromptPreviewInput {
  id: string;
  content?: string;
  variables?: Record<string, string | number>;
  taskType?: string;
  input?: string;
  context?: string[];
}

export interface PromptPreviewResult {
  id: string;
  scope: string;
  content: string;
  source: PromptSource;
  version: number;
  requiredVariables: string[];
  systemPrompt: string;
  userMessage: string;
}

/** 后台预览：返回最终系统提示词与用户消息，不调用模型。 */
export async function previewPrompt(input: PromptPreviewInput): Promise<PromptPreviewResult> {
  const definition = PROMPT_CATALOG_BY_ID[input.id];
  if (!definition) throw new Error(`UNKNOWN_PROMPT_TEMPLATE: ${input.id}`);

  const effective = await getEffectivePrompt(input.id);
  const content = input.content ?? effective.content;
  const systemPrompt = definition.scope === "user"
    ? ""
    : await composeTestSystemPrompt(input.id, content, input.taskType);
  const userMessage = await buildTestUserMessage(
    input.id,
    input.input ?? "",
    input.context,
    input.variables,
    content,
  );

  return {
    id: input.id,
    scope: definition.scope,
    content,
    source: effective.source,
    version: effective.version,
    requiredVariables: definition.variables,
    systemPrompt,
    userMessage,
  };
}

/** 后台测试台：同一输入分别跑已保存版本（A）与草稿（B）。 */
export async function runPromptComparison(
  userId: string,
  input: PromptComparisonInput,
): Promise<PromptComparisonResult> {
  assertTestablePrompt(input.id);
  const type = input.taskType ? normalizeTaskType(input.taskType) : normalizeTaskType(
    input.id.startsWith("task:") ? input.id.slice("task:".length) : undefined,
  );
  const { credential, modelName } = await getCredential(userId);
  const model = input.model || modelName;

  const [systemA, systemB, userMessage] = await Promise.all([
    composeTestSystemPrompt(input.id, input.contentA, type),
    composeTestSystemPrompt(input.id, input.contentB, type),
    buildTestUserMessage(input.id, input.input, input.context, input.variables),
  ]);

  const [a, b] = await Promise.all([
    runPromptSide(credential, model, systemA, userMessage),
    runPromptSide(credential, model, systemB, userMessage),
  ]);

  return { id: input.id, taskType: type, systemA, systemB, userMessage, a, b };
}

export interface PromptSuggestionInput {
  id: string;
  content: string;
  input?: string;
  taskType?: string;
  model?: string;
  resultA?: string;
  resultB?: string;
}

export interface PromptSuggestion {
  issues: string[];
  revisedPrompt: string;
  raw: string;
  parseError?: string;
}

/** 后台 AI 建议：点评提示词并给出保留变量与输出契约的完整改写。 */
export async function suggestPromptImprovement(
  userId: string,
  input: PromptSuggestionInput,
): Promise<PromptSuggestion> {
  const definition = assertTestablePrompt(input.id);
  const { credential, modelName } = await getCredential(userId);
  const result = await generateAiText(credential, {
    model: input.model || modelName,
    system: await getPrompt("prompt:assist"),
    prompt: JSON.stringify({
      id: input.id,
      name: definition.name,
      purpose: definition.purpose,
      scope: definition.scope,
      requiredVariables: definition.variables,
      outputRequirement: definition.output,
      currentPrompt: input.content,
      testInput: input.input ?? "",
      taskType: input.taskType ?? "",
      outputs: {
        current: input.resultA ?? "",
        draft: input.resultB ?? "",
      },
    }),
    temperature: 0.3,
    // DeepSeek 等推理模型会先消耗推理 token；1200 会产不出正文。
    maxTokens: 3000,
  });

  const raw = result.text;
  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return { issues: [], revisedPrompt: "", raw, parseError: "AI_SUGGEST_INVALID_JSON" };
  }

  const issues = Array.isArray((parsed as any).issues)
    ? (parsed as any).issues.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 6)
    : [];
  const revisedPrompt = String((parsed as any).revisedPrompt ?? "").trim();

  if (!revisedPrompt) {
    return { issues, revisedPrompt: "", raw, parseError: "AI_SUGGEST_EMPTY_PROMPT" };
  }

  return { issues, revisedPrompt, raw };
}
