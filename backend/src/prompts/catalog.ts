/**
 * GoDeeper 提示词目录（单一来源）。
 *
 * 所有发给模型的产品提示词都必须从这里取：
 * - system：作为系统提示词发送。
 * - system-fragment：拼接进系统提示词的任务类型指令或输出契约。
 * - user：作为用户消息发送的模板。
 *
 * 调试提示：
 * 1. 管理后台 /admin/prompts 展示每个条目的用途与调用位置。
 * 2. 系统提示词可被数据库 prompt_templates 覆盖（feature = id）。
 * 3. 修改默认正文只需改本文件；不要在路由或服务里再写一份。
 */

export type PromptScope = "system" | "system-fragment" | "user";

export interface PromptParams {
  temperature?: number;
  maxTokens?: number;
}

export interface PromptDefinition {
  /** 稳定标识；系统提示词与 prompt_templates.feature 对齐 */
  id: string;
  /** 后台显示名 */
  name: string;
  /** 这条提示词解决什么问题 */
  purpose: string;
  scope: PromptScope;
  /** 调用位置：文件与函数/路由 */
  usedBy: string[];
  /** 模板变量，对应正文里的 {{变量}} */
  variables: string[];
  /** 对模型输出的要求 */
  output: string;
  /** 调用参数（如温度、最大 token） */
  params?: PromptParams;
  /** 是否允许数据库 prompt_templates 覆盖 */
  editable: boolean;
  /** 是否进入后台空库自动播种 */
  seed: boolean;
  /** 默认正文；用户消息模板使用 {{变量}} 占位 */
  content: string;
}

const TASK_BASE =
  `You are a reasoning assistant for GoDeeper, a spatial thinking canvas.
Given a task prompt and context from connected nodes, answer the user's actual request directly.
If the user asks for a list, concepts, examples, steps, or comparisons, put that real content into the result nodes. Do not replace it with meta-advice about how to learn, how to plan, or why the topic matters unless the user explicitly asks for that.`;

const SOURCE_BASE =
  `You are a content analysis assistant for GoDeeper, a spatial reasoning canvas.
The user will give you content to analyze. Return a JSON object with:
- "title": a concise title for this content (under 60 chars)
- "summary": a 2-3 sentence summary of the content (under 200 chars)
- "keyPoints": an array of 3-7 key insights. Each item must have:
  - "text": a one-line insight headline (under 80 chars)
  - "body": a fully detailed expansion of that insight (under 200 chars)
Output ONLY the JSON object, no markdown, no explanation.`;

const EXPAND_BASE =
  `You are a content expansion assistant for GoDeeper.
The user will give you a key insight point and its source context.
Expand the point into a detailed explanation (under 200 chars).
Output ONLY the expanded text, no markdown, no labels, no quotes.`;

const INSPIRE_BASE =
  `You are a creative thinking assistant for GoDeeper, a spatial reasoning canvas.
Given the user's current thinking context, generate a thought-provoking question that can deepen their reasoning.
Return a JSON object with exactly these fields:
- "question": A question direction that challenges or extends the user's current thinking (under 80 chars)
- "reason": Why this question is worth exploring (under 200 chars)
- "prerequisites": An array of 2-4 prerequisite concepts or conditions needed to answer this question (each under 60 chars)
Be surprising and genuinely helpful. Don't ask obvious questions.
Output ONLY the JSON object, no markdown, no explanation.`;

const CRITIQUE_BASE =
  `You are an adversarial reviewer for GoDeeper, a spatial thinking canvas.
Input is JSON with a claim (title, body, taskType), a list of direct evidence (title, text), and a locale.
Your job is to stress-test the claim, not to agree with it and not to rewrite it.
Return 2-4 findings. Allowed kinds:
- "counterexample": a concrete case where the claim breaks down
- "flaw": a logical gap, hidden assumption, or overgeneralization
- "missing_evidence": evidence the claim needs but does not have
Rules:
- Be specific to this claim. No generic advice.
- Never rewrite the claim, never write a summary or conclusion.
- Use only the provided evidence; if the evidence list is empty, prefer "missing_evidence".
- Title under 40 characters, body under 160 characters.
- Write in the requested locale.
- Output ONLY JSON, no markdown, no explanation.
Output schema:
{"findings":[{"kind":"counterexample|flaw|missing_evidence","title":"...","body":"..."}]}`;

const PROMPT_ASSIST_BASE =
  `You are a prompt optimization assistant for GoDeeper's admin console.
Input is JSON with: the prompt id and scope, its purpose, the required template placeholders, the current prompt text, an optional test input, and optional model outputs produced by the current and draft prompts.
Review the prompt as a senior prompt engineer.
Rules:
- Preserve every required placeholder exactly as listed. Do not rename, remove, or add placeholders.
- Keep the prompt's intended behavior and output schema; do not invent product features or facts.
- Focus on concrete issues: vague instructions, missing constraints, conflicting rules, unsafe assumptions, and output-format ambiguity.
- "revisedPrompt" must be a complete replacement of the current prompt text, not a diff or a fragment.
- Keep the same language as the current prompt unless the current prompt is clearly meant to switch languages.
Return a JSON object with exactly these fields:
- "issues": an array of 1-6 short issue statements
- "revisedPrompt": the full revised prompt text
Output ONLY the JSON object, no markdown, no explanation.
Output schema:
{"issues":["..."],"revisedPrompt":"..."}`;

const QUESTION_DEPTH_BASE =
  `You are a question-depth evaluator for GoDeeper, a spatial thinking canvas.
Judge the CURRENT user question together with the supplied discussion context. Do not judge language quality, length, vocabulary, or how professional the question sounds.
A question has depth only when it moves the reasoning forward relative to the existing discussion. Strong depth signals:
- ROOT_CAUSE: asks for the underlying mechanism, cause, or generative structure rather than a surface fact.
- ASSUMPTION_CHALLENGE: exposes or challenges a hidden premise in the current discussion.
- CONTRADICTION_DISCOVERY: notices tension, inconsistency, or boundary conditions between ideas.
- PERSPECTIVE_SHIFT: reframes the problem in a way that changes what becomes visible.
Secondary signals: EXPLORATION_VALUE (opens a productive next line of inquiry) and SPECIFICITY (tied to concrete details in the context).
Do NOT qualify these: plain information lookup; repeating something already established; asking only for more detail, examples, or a summary; stacking jargon without reasoning; bundling several sub-questions that add no new thinking; only agreeing or disagreeing; questions unrelated to the supplied context; generic "why does this matter" with no concrete angle.
Use only the supplied question and context. If the context is empty or too thin to judge depth, choose UNCERTAIN.
Evaluate only this question. Do not produce any natural-language evaluation or explanation.`;

export const QUESTION_DEPTH_CRITERIA: Record<string, string> = {
  QUALIFIED:
    "The question carries at least one strong depth signal and is specific to the supplied context, so it clearly advances the discussion.",
  NORMAL:
    "The question is an ordinary lookup, a request for detail or summary, a restatement, or otherwise adds no meaningful new thinking.",
  UNCERTAIN:
    "The question or context is too thin, ambiguous, or off-context to decide whether it has depth.",
};

const TASK_OUTPUT_CONTRACT_BASE =
  `Write in the same language as the user's prompt.
Also produce a short title (max 40 chars) that summarizes the user's question.
Each result node needs a title (max 60 chars) and a body as long as the answer needs; do not pad or repeat.
For list/concept questions, output one result node per item, 3-12 results total; do not pack multiple unrelated concepts into one node.
Respond in JSON object format:
{"title":"...","results":[{"title":"...","body":"..."}]}`;

/** 任务类型指令：会被 buildTaskSystemPrompt 追加到任务提示词后。 */
const TASK_TYPE_INSTRUCTION_CONTENT: Record<string, string> = {
  question:
    "Task intent: question. Answer the user's question directly and concretely. If the user asks for a list, concepts, or examples, produce one result node per requested item. You may output 3-12 result nodes; keep each node focused on one concept so concepts never get mixed together. Only merge strongly related items when there are more than 12. Do not answer with meta-advice about how to learn, reframe, or plan unless the user explicitly asks for it.",
  verify:
    "Task intent: verify. Produce 2-3 nodes that separate what is supported from what is unverified. State the check that is needed and the evidence required.",
  research:
    "Task intent: research. Produce 2-3 nodes that propose concrete research directions, sources worth inspecting, and what to look for in each source.",
  summary:
    "Task intent: summary. Produce 2-3 nodes that condense the material into distinct key takeaways. Each node must carry one takeaway, not a full rewrite.",
  report:
    "Task intent: report. Produce 2-3 nodes that turn the material into report-ready sections, each with a clear point and supporting detail.",
  analysis:
    "Task intent: analysis. Produce 2-3 nodes that break the material into components, mechanisms, and consequences.",
  compare:
    "Task intent: compare. Produce 2-3 nodes that contrast options along explicit dimensions and state the trade-off of each.",
  derive:
    "Task intent: derive. Produce 2-3 nodes that make one inference per node, with the premise clearly stated.",
  critique:
    "Task intent: critique. Produce 2-3 nodes that stress-test the claim: a counterexample, a hidden assumption, or missing evidence. Do not agree with or rewrite the claim.",
};

const TASK_TYPE_OUTPUT = "一般 2-4 个结果节点；清单/概念类 3-12 个，每条一个概念；类型决定内容角度，不改变 JSON 契约。";
const TASK_TYPE_USED_BY = ["services/ai.service.ts buildTaskSystemPrompt"];

const TASK_TYPE_ENTRIES: PromptDefinition[] = Object.entries(TASK_TYPE_INSTRUCTION_CONTENT).map(
  ([type, content]) => ({
    id: `task:${type}`,
    name: `任务类型指令 · ${type}`,
    purpose: `当任务类型识别为 ${type} 时，追加到任务提示词后，约束回答角度。`,
    scope: "system-fragment",
    usedBy: TASK_TYPE_USED_BY,
    variables: [],
    output: TASK_TYPE_OUTPUT,
    editable: true,
    seed: false,
    content,
  }),
);

export const PROMPT_CATALOG: PromptDefinition[] = [
  {
    id: "task",
    name: "任务推理",
    purpose: "回答任务节点的提示词，要求直接给出用户要的内容，而不是学习方法或泛泛建议。",
    scope: "system",
    usedBy: [
      "services/ai.service.ts runTask",
      "services/ai.service.ts streamTaskRaw",
      "routes/task.ts POST /task/:taskId/run",
      "routes/task.ts POST /task/:taskId/stream",
    ],
    variables: [],
    output: "JSON 对象；标题概括用户问题，results 为 2-4 个结果节点，清单/概念类为 3-12 个且每条一个概念。",
    editable: true,
    seed: true,
    content: TASK_BASE,
  },
  ...TASK_TYPE_ENTRIES,
  {
    id: "task:output-contract",
    name: "任务输出契约",
    purpose: "统一任务结果的 JSON 结构、标题长度与节点长度；管理员提示词已包含新格式时不再追加。",
    scope: "system-fragment",
    usedBy: ["services/ai.service.ts buildTaskSystemPrompt"],
    variables: [],
    output: "JSON：{ title, results: [{ title, body }] }。",
    editable: true,
    seed: false,
    content: TASK_OUTPUT_CONTRACT_BASE,
  },
  {
    id: "source",
    name: "来源分析",
    purpose: "把网页、文本、文件或 PDF 拆成标题、摘要和 3-7 个关键点。",
    scope: "system",
    usedBy: [
      "services/ai.service.ts analyzeSource",
      "services/ai.service.ts analyzePdfSource",
      "routes/ai.ts POST /ai/analyze-url",
      "routes/import.ts POST /import/url",
      "routes/import.ts POST /import/text",
      "routes/import.ts POST /import/file",
    ],
    variables: [],
    output: "JSON：{ title, summary, keyPoints: [{ text, body }] }。",
    editable: true,
    seed: true,
    content: SOURCE_BASE,
  },
  {
    id: "expand",
    name: "观点展开",
    purpose: "把来源里的一个关键点展开成一段具体解释。",
    scope: "system",
    usedBy: ["services/ai.service.ts expandPoint", "routes/ai.ts POST /ai/expand"],
    variables: [],
    output: "纯文本，不超过 200 字，不带标签或引号。",
    editable: true,
    seed: true,
    content: EXPAND_BASE,
  },
  {
    id: "inspire",
    name: "灵感启发",
    purpose: "根据当前思考上下文提出一个能继续深入的追问，并说明理由和前置概念。",
    scope: "system",
    usedBy: ["services/ai.service.ts generateInspiration", "routes/ai.ts POST /ai/inspire"],
    variables: [],
    output: "JSON：{ question, reason, prerequisites: string[] }。",
    editable: true,
    seed: true,
    content: INSPIRE_BASE,
  },
  {
    id: "critique",
    name: "对抗性反驳",
    purpose: "对单个主张做压力测试，输出反例、逻辑漏洞或缺失证据，不改写主张。",
    scope: "system",
    usedBy: ["services/ai.service.ts critiqueClaim", "routes/ai.ts POST /ai/critique"],
    variables: [],
    output: "JSON：{ findings: [{ kind, title, body }] }，kind 只允许三种枚举。",
    params: { temperature: 0.3, maxTokens: 900 },
    editable: true,
    seed: true,
    content: CRITIQUE_BASE,
  },
  {
    id: "quality:jev-depth",
    name: "问题深度判断 · JEV",
    purpose: "交给 JEV 判断当前用户问题是否体现思考深度；只在合格且高置信度时给星星。",
    scope: "system",
    usedBy: ["services/jev.service.ts evaluateQuestionDepth"],
    variables: [],
    output: "choice：QUALIFIED / NORMAL / UNCERTAIN，由服务映射为 qualified / normal。",
    editable: true,
    seed: false,
    content: QUESTION_DEPTH_BASE,
  },
  {
    id: "prompt:assist",
    name: "提示词优化建议",
    purpose: "后台测试台使用：点评当前提示词，并给出保留变量与输出契约的完整改写建议。",
    scope: "system",
    usedBy: [
      "services/ai.service.ts suggestPromptImprovement",
      "routes/admin.ts POST /admin/prompts/suggest",
    ],
    variables: [],
    output: "JSON：{ issues: string[], revisedPrompt: string }。",
    params: { temperature: 0.3, maxTokens: 1200 },
    editable: true,
    seed: false,
    content: PROMPT_ASSIST_BASE,
  },
  {
    id: "source:url-analyze",
    name: "用户消息 · 网页分析",
    purpose: "把 URL 与抓取到的正文组织成来源分析请求。",
    scope: "user",
    usedBy: ["routes/ai.ts POST /ai/analyze-url"],
    variables: ["url", "pageText"],
    output: "沿用来源分析的系统提示词。",
    editable: true,
    seed: false,
    content: "Analyze this URL and extract key insights.\n\nURL: {{url}}\n\nContent:\n{{pageText}}",
  },
  {
    id: "source:url-import",
    name: "用户消息 · 网页导入",
    purpose: "把 URL 与正文组织成“拆成 N 个关键观点”的导入请求。",
    scope: "user",
    usedBy: ["routes/import.ts POST /import/url"],
    variables: ["url", "fragmentCount", "pageText"],
    output: "沿用来源分析的系统提示词。",
    editable: true,
    seed: false,
    content: "URL: {{url}}\n\nDecompose into {{fragmentCount}} key viewpoints.\n\nContent:\n{{pageText}}",
  },
  {
    id: "source:text-import",
    name: "用户消息 · 文本导入",
    purpose: "把粘贴文本组织成“拆成 N 个关键观点”的导入请求。",
    scope: "user",
    usedBy: ["routes/import.ts POST /import/text"],
    variables: ["fragmentCount", "text"],
    output: "沿用来源分析的系统提示词。",
    editable: true,
    seed: false,
    content: "Decompose into {{fragmentCount}} key viewpoints.\n\nText: {{text}}",
  },
  {
    id: "source:file-import",
    name: "用户消息 · 文件导入",
    purpose: "把 TXT/MD 文件正文组织成“拆成 N 个关键观点”的导入请求。",
    scope: "user",
    usedBy: ["routes/import.ts POST /import/file"],
    variables: ["fragmentCount", "filename", "text"],
    output: "沿用来源分析的系统提示词。",
    editable: true,
    seed: false,
    content: "Decompose into {{fragmentCount}} key viewpoints.\n\nFile: {{filename}}\n\nText: {{text}}",
  },
  {
    id: "source:pdf-analyze",
    name: "用户消息 · PDF 分析",
    purpose: "要求模型直接读取 PDF 文件并拆成 N 个关键观点。",
    scope: "user",
    usedBy: ["services/ai.service.ts analyzePdfSource"],
    variables: ["fragmentCount"],
    output: "沿用来源分析的系统提示词。",
    editable: true,
    seed: false,
    content:
      "Analyze this PDF file and decompose it into {{fragmentCount}} key viewpoints. Output only JSON using the requested schema.",
  },
  {
    id: "expand:insight",
    name: "用户消息 · 展开观点",
    purpose: "把来源摘要与待展开观点拼成展开请求。",
    scope: "user",
    usedBy: ["services/ai.service.ts expandPoint", "routes/ai.ts POST /ai/expand"],
    variables: ["summary", "pointText"],
    output: "沿用观点展开的系统提示词。",
    editable: true,
    seed: false,
    content: "Source context: {{summary}}\n\nExpand this key insight in detail: {{pointText}}",
  },
  {
    id: "inspire:fallback",
    name: "用户消息 · 启发兜底",
    purpose: "上下文字符串为空时，给模型一个最小可执行的启发请求。",
    scope: "user",
    usedBy: ["services/ai.service.ts generateInspiration", "routes/ai.ts POST /ai/inspire"],
    variables: [],
    output: "沿用灵感启发的系统提示词。",
    editable: true,
    seed: false,
    content: "Generate an inspiration for deep thinking.",
  },
  {
    id: "task:context-nodes",
    name: "用户消息 · 任务上下文（编号）",
    purpose: "把上下文节点按 1、2、3 编号追加到任务提示词后。",
    scope: "user",
    usedBy: ["services/ai.service.ts runTask"],
    variables: ["context"],
    output: "沿用任务推理的系统提示词。",
    editable: true,
    seed: false,
    content: "\nContext nodes:\n{{context}}",
  },
  {
    id: "task:context-stream",
    name: "用户消息 · 任务上下文（流式）",
    purpose: "流式任务把上下文按行追加到提示词后。",
    scope: "user",
    usedBy: ["services/ai.service.ts streamTaskRaw"],
    variables: ["context"],
    output: "沿用任务推理的系统提示词。",
    editable: true,
    seed: false,
    content: "\nContext:\n{{context}}",
  },
];

export const PROMPT_CATALOG_BY_ID: Record<string, PromptDefinition> = Object.fromEntries(
  PROMPT_CATALOG.map((item) => [item.id, item]),
);

/** 任务类型指令映射（保持旧导出形状）。 */
export const TASK_TYPE_INSTRUCTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(TASK_TYPE_INSTRUCTION_CONTENT),
);

/** 未知任务类型统一回退为 question。 */
export function normalizeTaskType(value: unknown): string {
  return typeof value === "string" && value in TASK_TYPE_INSTRUCTION_CONTENT ? value : "question";
}

/** 任务输出格式契约。 */
export const TASK_OUTPUT_CONTRACT = TASK_OUTPUT_CONTRACT_BASE;

/** 后台空库自动播种使用；只包含可通过 feature 覆盖的系统提示词。 */
export const SEED_PROMPTS = PROMPT_CATALOG.filter((item) => item.seed).map((item) => ({
  name: item.name,
  content: item.content,
  feature: item.id,
  enabled: true,
  version: 1,
}));

/** 读取默认正文；条目不存在时返回 undefined。 */
export function getPromptDefault(id: string): string | undefined {
  return PROMPT_CATALOG_BY_ID[id]?.content;
}

/** 提取正文里的 {{变量}}，返回去重后的变量名列表。 */
export function extractTemplateVariables(content: string): string[] {
  return Array.from(new Set(Array.from(content.matchAll(/\{\{(\w+)\}\}/g), (match) => match[1])));
}

/** 用给定正文渲染模板；缺变量时抛错，便于调试时快速定位。 */
export function renderTemplateContent(
  content: string,
  id: string,
  variables: Record<string, string | number> = {},
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null) {
      throw new Error(`MISSING_PROMPT_VARIABLE: ${id}.${key}`);
    }
    return String(value);
  });
}

/** 渲染用户消息模板（代码默认正文）；未知条目或缺少变量时抛错。 */
export function renderPrompt(id: string, variables: Record<string, string | number> = {}): string {
  const definition = PROMPT_CATALOG_BY_ID[id];
  if (!definition) {
    throw new Error(`UNKNOWN_PROMPT_TEMPLATE: ${id}`);
  }
  return renderTemplateContent(definition.content, id, variables);
}

/** 校验后台正文：保留全部必填变量，且不引入未知变量。 */
export function validatePromptContent(id: string, content: string):
  | { ok: true }
  | { ok: false; missing: string[]; unknown: string[] } {
  const definition = PROMPT_CATALOG_BY_ID[id];
  if (!definition) {
    return { ok: false, missing: [], unknown: [] };
  }
  const actual = extractTemplateVariables(content);
  const missing = definition.variables.filter((name) => !actual.includes(name));
  const unknown = actual.filter((name) => !definition.variables.includes(name));
  return { ok: missing.length === 0 && unknown.length === 0, missing, unknown };
}

/** 任务系统提示词拼装：基础提示词 + 输出契约 + 任务类型指令。 */
export function buildTaskSystemPromptContent(
  basePrompt: string,
  outputContract: string,
  typeInstruction: string,
): string {
  const needsContract = !basePrompt.includes('"results"');
  const contract = needsContract ? `${outputContract}\n\n` : "";
  return `${basePrompt}\n\n${contract}${typeInstruction}`;
}
