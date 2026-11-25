import type {
  CanvasNodeSeed,
  GoDeeperNodeData,
  TaskAuthor,
  TaskType,
} from "@/lib/types";
import { formatMentionsForText } from "@/lib/mentions";

const TASK_TYPES: ReadonlySet<TaskType> = new Set([
  "question",
  "verify",
  "research",
  "summary",
  "report",
  "analysis",
  "compare",
  "derive",
  "critique",
]);

type TaskNodeLike = Pick<
  GoDeeperNodeData,
  "kind" | "title" | "body" | "taskType" | "author" | "editedByUser" | "inspireQuestion" | "legacyKind"
>;

export function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && TASK_TYPES.has(value as TaskType);
}

const TASK_TYPE_KEYWORDS: Array<{ type: TaskType; zh: string[]; en: RegExp[] }> = [
  {
    type: "critique",
    zh: ["漏洞", "反驳", "质疑", "挑刺", "批驳", "反例", "缺失证据"],
    en: [/\b(critique|rebut|refute|counterargument|flaw|weakness|find\s+(?:the\s+)?(?:holes|flaws|weaknesses))\b/i],
  },
  {
    type: "verify",
    zh: ["核实", "验证", "查证", "真假", "是否属实", "是否真实", "辟谣"],
    en: [/\b(verify|fact[- ]?check|validate|is\s+it\s+true|true\s+or\s+false)\b/i],
  },
  {
    type: "compare",
    zh: ["对比", "比较", "区别", "差异", "优劣"],
    en: [/\b(compare|comparison|contrast|versus|vs)\b/i],
  },
  {
    type: "summary",
    zh: ["总结", "概括", "归纳", "提炼"],
    en: [/\b(summarize|summarise|summary|tl;dr)\b/i],
  },
  {
    type: "report",
    zh: ["报告", "汇报", "写成报告"],
    en: [/\b(report|write[- ]?up)\b/i],
  },
  {
    type: "research",
    zh: ["调研", "研究", "深挖", "搜集", "查资料", "检索"],
    en: [/\b(research|investigate|look\s+up|explore\s+sources)\b/i],
  },
  {
    type: "derive",
    zh: ["推导", "推演", "推理", "推断", "由此推出"],
    en: [/\b(derive|deduce|infer|inference)\b/i],
  },
  {
    type: "analysis",
    zh: ["分析", "拆解", "剖析", "解读"],
    en: [/\b(analy[z]e|analysis|break\s+down)\b/i],
  },
];

/**
 * 用户不再手动选择任务类型；从提示词里识别需求。
 * 命中多个类型时按“更具体 → 更泛化”的固定顺序取第一个，避免“分析对比”被识别成泛分析。
 */
export function detectTaskType(text: string): TaskType {
  const value = text ?? "";
  if (!value.trim()) return "question";

  for (const rule of TASK_TYPE_KEYWORDS) {
    if (rule.zh.some((keyword) => value.includes(keyword))) return rule.type;
    if (rule.en.some((pattern) => pattern.test(value))) return rule.type;
  }

  return "question";
}

export function getTaskType(data: GoDeeperNodeData): TaskType {
  const detected = detectTaskType(`${data.title ?? ""}\n${data.body ?? ""}`);
  if (detected !== "question") return detected;
  if (isTaskType(data.taskType)) return data.taskType;
  return "question";
}

export function getTaskAuthor(data: GoDeeperNodeData): TaskAuthor {
  if (data.author === "user" || data.author === "ai") return data.author;
  return data.kind === "inspire" || data.legacyKind === "inspire" ? "ai" : "user";
}

export function getAiQuestionText(data: GoDeeperNodeData): string {
  return (data.inspireQuestion || data.title || data.body || "").trim();
}

/**
 * Old canvases contain `kind: "inspire"` nodes. Keep the legacy kind so old
 * JSON still round-trips, but give it the task/provenance fields the new UI
 * and exports need.
 */
export function normalizeTaskNodeFields(node: CanvasNodeSeed): CanvasNodeSeed {
  if (node.kind === "inspire") {
    const question = (node.inspireQuestion || node.title || "").trim();
    const reason = (node.inspireReason || node.body || "").trim();

    return {
      ...node,
      taskType: node.taskType ?? "question",
      author: node.author ?? "ai",
      adopted: node.adopted ?? true,
      legacyKind: node.legacyKind ?? "inspire",
      inspireAction: node.inspireAction ?? "inspire",
      body: question || node.body,
      summary: node.summary ?? (reason || undefined),
    };
  }

  if (node.kind === "task") {
    return {
      ...node,
      taskType: node.taskType ?? "question",
      author: node.author ?? "user",
      adopted: node.adopted ?? true,
    };
  }

  return node;
}

export function normalizeQuestionText(value: string): string {
  return value.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
}

export function collectAiQuestionTexts(nodes: TaskNodeLike[]): string[] {
  const seen = new Set<string>();
  const questions: string[] = [];

  for (const node of nodes) {
    const data = node as GoDeeperNodeData;
    if (getTaskAuthor(data) !== "ai") continue;

    const text = getAiQuestionText(data);
    const normalized = normalizeQuestionText(text);
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    questions.push(text);
  }

  return questions;
}

export interface TaskProvenanceSummary {
  userQuestions: number;
  aiQuestions: number;
  aiEditedQuestions: number;
  aiResults: number;
  totalQuestions: number;
}

export function summarizeTaskProvenance(nodes: TaskNodeLike[]): TaskProvenanceSummary {
  let userQuestions = 0;
  let aiQuestions = 0;
  let aiEditedQuestions = 0;
  let aiResults = 0;

  for (const node of nodes) {
    if (node.kind === "result") {
      aiResults += 1;
      continue;
    }
    if (node.kind !== "task" && node.kind !== "inspire") continue;

    if (getTaskAuthor(node as GoDeeperNodeData) === "ai") {
      aiQuestions += 1;
      if (node.editedByUser) aiEditedQuestions += 1;
    } else {
      userQuestions += 1;
    }
  }

  return {
    userQuestions,
    aiQuestions,
    aiEditedQuestions,
    aiResults,
    totalQuestions: userQuestions + aiQuestions,
  };
}

export function buildTaskInquiryContext(
  node: Pick<CanvasNodeSeed, "title" | "body">,
  ancestors: Array<Pick<CanvasNodeSeed, "title" | "body">>,
  existingQuestions: string[],
  extra?: string,
): string {
  const lines = [`Current node: "${node.title}"`, formatMentionsForText(node.body)];

  if (ancestors.length > 0) {
    lines.push("", "Ancestor questions/evidence:");
    for (const ancestor of ancestors) {
      lines.push(`- ${ancestor.title}${ancestor.body ? `: ${formatMentionsForText(ancestor.body)}` : ""}`);
    }
  }

  if (existingQuestions.length > 0) {
    lines.push("", "画布上已有的启发问题（必须换一个不同的角度，不要重复）：");
    for (const question of existingQuestions) lines.push(`- ${question}`);
  }

  if (extra) lines.push("", extra);

  return lines.join("\n");
}

export interface BuildAiQuestionSeedInput {
  id: string;
  question: string;
  reason: string;
  prerequisites: string[];
  modelName?: string;
  metaRight?: string;
  x: number;
  y: number;
  width: number;
  now?: string;
}

/**
 * The user explicitly rejected a candidate tray: clicking "AI 启发提问" is
 * the adoption action. This seed is therefore a real task node, not a
 * temporary suggestion.
 */
export function buildAiQuestionSeed(input: BuildAiQuestionSeedInput): CanvasNodeSeed {
  const question = input.question.trim();
  const reason = input.reason.trim();

  return {
    id: input.id,
    kind: "task",
    title: question,
    body: question,
    x: input.x,
    y: input.y,
    width: input.width,
    metaLeft: input.modelName,
    metaRight: input.metaRight,
    taskStatus: "idle",
    taskType: "question",
    author: "ai",
    adopted: true,
    adoptedAt: input.now ?? new Date().toISOString(),
    editedByUser: false,
    inspireAction: "inspire",
    summary: reason || undefined,
    inspireQuestion: question,
    inspireReason: reason || undefined,
    inspirePrerequisites: input.prerequisites.length > 0 ? input.prerequisites : undefined,
  };
}
