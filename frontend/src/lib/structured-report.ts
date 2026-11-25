import type {
  GoDeeperFlowEdge,
  GoDeeperFlowNode,
  TaskType,
} from "@/lib/types";
import { TASK_TYPE_LABELS } from "@/lib/types";
import { getTaskAuthor, getTaskType, summarizeTaskProvenance, type TaskProvenanceSummary } from "@/lib/task-model";
import { formatMentionsForText, splitMentions } from "@/lib/mentions";

export type ReportAuthorLabel = "user" | "ai" | "aiEdited";
export type ReportDetail = "full" | "summary";

export interface ReportSection {
  title: string;
  taskIds: string[];
  /** 本节导语：一两句话说明这一节在讨论什么 */
  summary?: string;
  /** 关键发现：必须有输入任务支撑 */
  keyFindings?: string[];
}

/** AI 写出的报告叙述文字，不含任务原文 */
export interface ReportNarrative {
  subtitle?: string;
  /** 全文概述 */
  executiveSummary?: string;
  /** 结论 */
  conclusion?: string;
}

export interface ReportTask {
  node: GoDeeperFlowNode;
  question: string;
  authorLabel: ReportAuthorLabel;
  taskType: TaskType;
  evidence: GoDeeperFlowNode[];
  results: GoDeeperFlowNode[];
  children: ReportTask[];
  depth: number;
  /** 1、1.1、1.2、2… 用于报告中的任务编号 */
  path: string;
}

export interface StructuredReport {
  title: string;
  subtitle: string;
  generatedAt: string;
  provenance: TaskProvenanceSummary;
  /** 全文概述 */
  executiveSummary: string;
  /** 结论 */
  conclusion: string;
  /** 所有任务的先序扁平列表（父任务在子任务之前） */
  tasks: ReportTask[];
  looseNotes: GoDeeperFlowNode[];
  /** 有值时表示只导出了该任务为根的分支（单分支，兼容旧字段） */
  scopeRootTaskId?: string;
  /** 有值时表示只导出了这些任务为根的多个分支 */
  scopeRootTaskIds?: string[];
  /** 当前分支的根节点（可以是文本/任务/结果等任意类型） */
  scopeRootNodeId?: string;
  /** 可直接展示的导出范围文案 */
  scopeLabel?: string;
  /** AI 整理后的章节分组；未提供时按任务树平铺 */
  sections?: ReportSection[];
  detail: ReportDetail;
  markdown: string;
  html: string;
}

export interface BuildStructuredReportOptions {
  title?: string;
  now?: Date;
  locale?: "zh" | "en";
  /** 只导出以此任务为根的子树；无效 id 时回退整张画布 */
  rootTaskId?: string;
  /** 只导出这些任务为根的多个子树；与 rootTaskId 同时存在时优先 rootTaskId */
  rootTaskIds?: string[];
  /** 只导出以该节点为根的子树（任意节点类型）；优先于 rootTaskId */
  rootNodeId?: string;
  /** full = 含证据/AI 结果详情；summary = 只保留任务与正文，适合快速阅读 */
  detail?: ReportDetail;
  /** AI 整理后的章节分组；只允许引用真实 taskId，应用负责补全遗漏任务 */
  sections?: ReportSection[];
  /** AI 写出的全文概述与结论 */
  narrative?: ReportNarrative;
}

const AUTHOR_LABELS: Record<ReportAuthorLabel, { zh: string; en: string }> = {
  user: { zh: "你提的", en: "You asked" },
  ai: { zh: "AI 建议", en: "AI suggested" },
  aiEdited: { zh: "AI 建议 · 你改写", en: "AI suggested · edited" },
};

const TYPE_LABELS_EN: Record<TaskType, string> = {
  question: "Question",
  verify: "Verify",
  research: "Research",
  summary: "Summary",
  report: "Report",
  analysis: "Analysis",
  compare: "Compare",
  derive: "Derive",
  critique: "Critique",
};

const DEFAULT_TITLE = { zh: "GoDeeper 推理报告", en: "GoDeeper Reasoning Report" };

const LABELS = {
  zh: {
    generatedAt: "生成时间",
    provenance: "来源统计",
    user: "你提的",
    ai: "AI 建议",
    aiEdited: "AI 建议改写",
    aiResults: "AI 生成结果",
    task: "任务",
    type: "类型",
    source: "来源",
    evidenceCount: "直接证据",
    resultCount: "AI 结果",
    evidence: "证据",
    results: "AI 结果",
    loose: "散落笔记 / 来源",
    scope: "导出范围",
    scopeBranch: "当前分支",
    scopeSelected: "已选分支",
    overview: "全文概述",
    sectionSummary: "本节导语",
    keyFindings: "关键发现",
    conclusion: "结论",
    empty: "暂无内容。",
    cards: "张",
    items: "条",
    guideSummary: "直接回答",
    guidePath: "探索路径",
    guideUnexplored: "未探索",
    guideStarted: "已展开",
    guideDone: "已完成",
    guideBackfill: "回填",
  },
  en: {
    generatedAt: "Generated",
    provenance: "Provenance",
    user: "You asked",
    ai: "AI suggested",
    aiEdited: "AI-edited",
    aiResults: "AI results",
    task: "Task",
    type: "Type",
    source: "Source",
    evidenceCount: "Direct evidence",
    resultCount: "AI results",
    evidence: "Evidence",
    results: "AI results",
    loose: "Loose notes / sources",
    scope: "Scope",
    scopeBranch: "Current branch",
    scopeSelected: "Selected branches",
    overview: "Overview",
    sectionSummary: "Section summary",
    keyFindings: "Key findings",
    conclusion: "Conclusion",
    empty: "Nothing to report yet.",
    cards: "cards",
    items: "items",
    guideSummary: "Direct answer",
    guidePath: "Exploration path",
    guideUnexplored: "Not explored",
    guideStarted: "Opened",
    guideDone: "Done",
    guideBackfill: "Backfill",
  },
} as const;

function isTaskNode(node: GoDeeperFlowNode): boolean {
  return node.data.kind === "task" || node.data.kind === "inspire";
}

function authorLabelOf(node: GoDeeperFlowNode): ReportAuthorLabel {
  if (getTaskAuthor(node.data) === "user") return "user";
  return node.data.editedByUser ? "aiEdited" : "ai";
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** HTML 报告里的提及：目标在报告内时跳到锚点，否则降级为纯文本。 */
function renderHtmlMentions(value: unknown, reportNodeIds: Set<string>): string {
  return splitMentions(String(value ?? ""))
    .map((segment) => {
      if (segment.type === "text") return escapeHtml(segment.text);
      const label = `@${escapeHtml(segment.mention.label)}`;
      if (reportNodeIds.has(segment.mention.nodeId)) {
        return `<a class="mention" href="#node-${escapeHtml(segment.mention.nodeId)}">${label}</a>`;
      }
      return `<span class="mention">${label}</span>`;
    })
    .join("");
}

function oneLine(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** 段落文本：折叠空白并截断；报告叙述字段统一走这里，避免模型输出换行撑破版式 */
function paragraph(value: unknown, max: number): string {
  return oneLine(value).slice(0, max);
}

function taskTypeLabel(taskType: TaskType, locale: "zh" | "en"): string {
  return locale === "zh" ? TASK_TYPE_LABELS[taskType] : TYPE_LABELS_EN[taskType];
}

function authorText(author: ReportAuthorLabel, locale: "zh" | "en"): string {
  return AUTHOR_LABELS[author][locale];
}

function collectNodes(
  edges: GoDeeperFlowEdge[],
  byId: Map<string, GoDeeperFlowNode>,
  direction: "source" | "target",
): GoDeeperFlowNode[] {
  const seen = new Set<string>();
  const result: GoDeeperFlowNode[] = [];
  for (const edge of edges) {
    const id = direction === "source" ? edge.source : edge.target;
    if (seen.has(id)) continue;
    const node = byId.get(id);
    if (!node) continue;
    seen.add(id);
    result.push(node);
  }
  return result;
}

function collectDescendantIds(
  rootId: string,
  outgoing: Map<string, GoDeeperFlowEdge[]>,
): Set<string> {
  const ids = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const edge of outgoing.get(current) ?? []) {
      if (ids.has(edge.target)) continue;
      ids.add(edge.target);
      queue.push(edge.target);
    }
  }
  return ids;
}

function buildReportNodes(
  nodes: GoDeeperFlowNode[],
  edges: GoDeeperFlowEdge[],
  scopeRootTaskId?: string,
  scopeRootTaskIds?: string[],
  scopeRootNodeId?: string,
): { tasks: ReportTask[]; looseNotes: GoDeeperFlowNode[]; scopeRootTaskIds?: string[]; scopeRootNodeId?: string } {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, GoDeeperFlowEdge[]>();
  const outgoing = new Map<string, GoDeeperFlowEdge[]>();
  for (const edge of edges) {
    const inList = incoming.get(edge.target);
    if (inList) inList.push(edge);
    else incoming.set(edge.target, [edge]);
    const outList = outgoing.get(edge.source);
    if (outList) outList.push(edge);
    else outgoing.set(edge.source, [edge]);
  }

  const taskNodes = nodes.filter((node) => isTaskNode(node) && node.data.catalogHidden !== true);
  const taskIdSet = new Set(taskNodes.map((node) => node.id));

  const parentTaskId = (nodeId: string): string | undefined => {
    for (const edge of incoming.get(nodeId) ?? []) {
      if (taskIdSet.has(edge.source)) return edge.source;
    }
    return undefined;
  };

  const visited = new Set<string>();
  const tasks: ReportTask[] = [];
  let rootIndex = 0;

  const buildTask = (node: GoDeeperFlowNode, depth: number, path: string): ReportTask => {
    visited.add(node.id);
    const evidence = collectNodes(
      (incoming.get(node.id) ?? []).filter((edge) => byId.get(edge.source)?.data.kind === "link"),
      byId,
      "source",
    );
    const results = collectNodes(
      (outgoing.get(node.id) ?? []).filter((edge) => byId.get(edge.target)?.data.kind === "result"),
      byId,
      "target",
    );

    const task: ReportTask = {
      node,
      question: oneLine(node.data.title) || oneLine(node.data.body),
      authorLabel: authorLabelOf(node),
      taskType: getTaskType(node.data),
      evidence,
      results,
      children: [],
      depth,
      path,
    };
    tasks.push(task);

    let childIndex = 0;
    for (const edge of outgoing.get(node.id) ?? []) {
      const childNode = byId.get(edge.target);
      if (!childNode || !taskIdSet.has(childNode.id) || visited.has(childNode.id)) continue;
      if (childNode.data.catalogHidden === true) continue;
      childIndex += 1;
      const child = buildTask(childNode, depth + 1, `${path}.${childIndex}`);
      task.children.push(child);
    }
    return task;
  };

  const scopeRootNode = scopeRootNodeId ? byId.get(scopeRootNodeId) : undefined;
  const nodeScopeIds = scopeRootNode ? collectDescendantIds(scopeRootNode.id, outgoing) : undefined;

  const singleRoot = scopeRootTaskId ? byId.get(scopeRootTaskId) : undefined;
  const singleValid = !nodeScopeIds && Boolean(singleRoot && taskIdSet.has(singleRoot.id));
  const requestedIds = (scopeRootTaskIds ?? []).filter((id) => taskIdSet.has(id));
  const multiValid = !nodeScopeIds && !singleValid && requestedIds.length > 0;
  const selectedRoots: GoDeeperFlowNode[] = singleValid
    ? [singleRoot as GoDeeperFlowNode]
    : multiValid
      ? Array.from(new Set(requestedIds))
        .map((id) => byId.get(id))
        .filter((node): node is GoDeeperFlowNode => Boolean(node))
      : [];
  const scoped = Boolean(nodeScopeIds) || selectedRoots.length > 0;

  const roots = nodeScopeIds
    ? taskNodes.filter((node) => {
        if (!nodeScopeIds.has(node.id) || node.data.catalogHidden === true) return false;
        const parent = parentTaskId(node.id);
        return !parent || !nodeScopeIds.has(parent) || !taskIdSet.has(parent);
      })
    : scoped
      ? selectedRoots
      : taskNodes.filter((node) => {
          const parent = parentTaskId(node.id);
          return !parent || !taskIdSet.has(parent);
        });

  for (const root of roots) {
    if (visited.has(root.id)) continue;
    rootIndex += 1;
    buildTask(root, 0, String(rootIndex));
  }

  // 环或异常数据兜底：没被任何根访问到的任务单独成根。
  // 指定分支时不做兜底，避免把分支外的任务也带进报告。
  if (!scoped) {
    for (const node of taskNodes) {
      if (visited.has(node.id)) continue;
      rootIndex += 1;
      buildTask(node, 0, String(rootIndex));
    }
  }

  const usedNonTaskIds = new Set<string>();
  for (const task of tasks) {
    for (const item of [...task.evidence, ...task.results]) usedNonTaskIds.add(item.id);
  }
  const looseNotes = nodeScopeIds
    ? nodes.filter(
        (node) =>
          nodeScopeIds.has(node.id)
          && node.id !== scopeRootNode?.id
          && !isTaskNode(node)
          && node.data.catalogHidden !== true
          && !usedNonTaskIds.has(node.id),
      )
    : scoped
      ? []
      : nodes.filter(
          (node) => !isTaskNode(node) && node.data.catalogHidden !== true && !usedNonTaskIds.has(node.id),
        );

  return {
    tasks,
    looseNotes,
    scopeRootTaskIds: nodeScopeIds || !scoped ? undefined : selectedRoots.map((node) => node.id),
    scopeRootNodeId: nodeScopeIds ? scopeRootNodeId : undefined,
  };
}

/**
 * 找到“当前选中节点所属的任务分支”：
 * - 选中的是任务节点 → 直接返回；
 * - 选中的是结果/证据/普通节点 → 先向上找任务父节点，再向下找任务子节点；
 * - 找不到 → undefined（调用方回退整张画布）。
 */
export function findBranchTaskId(
  nodes: GoDeeperFlowNode[],
  edges: GoDeeperFlowEdge[],
  nodeId?: string | null,
): string | undefined {
  if (!nodeId) return undefined;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (!byId.has(nodeId)) return undefined;
  if (isTaskNode(byId.get(nodeId) as GoDeeperFlowNode)) return nodeId;

  const incoming = new Map<string, GoDeeperFlowEdge[]>();
  const outgoing = new Map<string, GoDeeperFlowEdge[]>();
  for (const edge of edges) {
    const inList = incoming.get(edge.target);
    if (inList) inList.push(edge);
    else incoming.set(edge.target, [edge]);
    const outList = outgoing.get(edge.source);
    if (outList) outList.push(edge);
    else outgoing.set(edge.source, [edge]);
  }

  const visited = new Set<string>([nodeId]);
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const edge of incoming.get(current) ?? []) {
      if (visited.has(edge.source)) continue;
      const node = byId.get(edge.source);
      if (!node) continue;
      if (isTaskNode(node)) return node.id;
      visited.add(edge.source);
      queue.push(edge.source);
    }
  }

  const downVisited = new Set<string>([nodeId]);
  const downQueue = [nodeId];
  while (downQueue.length > 0) {
    const current = downQueue.shift() as string;
    for (const edge of outgoing.get(current) ?? []) {
      if (downVisited.has(edge.target)) continue;
      const node = byId.get(edge.target);
      if (!node) continue;
      if (isTaskNode(node)) return node.id;
      downVisited.add(edge.target);
      downQueue.push(edge.target);
    }
  }

  return undefined;
}

/** 引导目录的子任务按 sourceCatalogItemId 对齐，缺失表示该方向尚未展开。 */
function guideChildrenByItem(task: ReportTask): Map<string, ReportTask> {
  const map = new Map<string, ReportTask>();
  for (const child of task.children) {
    const itemId = child.node.data.sourceCatalogItemId;
    if (itemId) map.set(itemId, child);
  }
  return map;
}

function guideItemState(child: ReportTask | undefined, labels: typeof LABELS.zh | typeof LABELS.en): string {
  if (!child) return labels.guideUnexplored;
  return child.node.data.taskStatus === "complete" ? labels.guideDone : labels.guideStarted;
}

function markdownTask(
  task: ReportTask,
  locale: "zh" | "en",
  detail: ReportDetail,
  headingLevel: 2 | 3 = 2,
): string {
  const lines: string[] = [];
  const labels = LABELS[locale];
  const heading = "#".repeat(headingLevel);
  const subHeading = "#".repeat(headingLevel + 1);
  lines.push(`${heading} ${labels.task} ${task.path}：${oneLine(task.question)}`);
  lines.push("");
  lines.push(`- ${labels.type}：${taskTypeLabel(task.taskType, locale)}`);
  lines.push(`- ${labels.source}：${authorText(task.authorLabel, locale)}`);
  if (task.evidence.length > 0) {
    lines.push(`- ${labels.evidenceCount}：${task.evidence.length} ${labels.cards}`);
  }
  if (task.results.length > 0) {
    lines.push(`- ${labels.resultCount}：${task.results.length} ${labels.items}`);
  }
  lines.push("");

  const body = formatMentionsForText(String(task.node.data.body ?? "")).trim();
  if (body) {
    lines.push(body);
    lines.push("");
  }

  const guide = task.node.data.catalog?.mode === "directions" ? task.node.data.catalog : null;
  if (guide) {
    if (guide.summary) {
      lines.push(`**${labels.guideSummary}**：${oneLine(guide.summary)}`);
      lines.push("");
    }
    const childByItem = guideChildrenByItem(task);
    lines.push(`**${labels.guidePath}**`);
    lines.push("");
    for (const item of guide.items) {
      const child = childByItem.get(item.id);
      const state = guideItemState(child, labels);
      const why = item.why ? ` —— ${oneLine(item.why)}` : "";
      const backfill = child?.node.data.catalogBackfill
        ? `（${labels.guideBackfill}：${oneLine(child.node.data.catalogBackfill)}）`
        : "";
      lines.push(`- [${state}] ${oneLine(item.title)}${why}${backfill}`);
    }
    lines.push("");
  }

  if (detail === "summary") return lines.join("\n");

  if (task.evidence.length > 0) {
    lines.push(`${subHeading} ${labels.evidence}`);
    for (const item of task.evidence) {
      const source = formatMentionsForText(String(item.data.body ?? "")).trim();
      lines.push(`- **${oneLine(item.data.title)}**${source ? `：${source}` : ""}`);
    }
    lines.push("");
  }

  if (task.results.length > 0) {
    lines.push(`${subHeading} ${labels.results}`);
    for (const item of task.results) {
      const resultBody = formatMentionsForText(String(item.data.body ?? "")).trim();
      lines.push(`- **${oneLine(item.data.title)}**${resultBody ? `：${resultBody}` : ""}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderMarkdown(
  title: string,
  now: Date,
  provenance: TaskProvenanceSummary,
  tasks: ReportTask[],
  looseNotes: GoDeeperFlowNode[],
  locale: "zh" | "en",
  detail: ReportDetail,
  scopeLabel?: string,
  sections?: ReportSection[],
  narrative?: ReportNarrative,
): string {
  const labels = LABELS[locale];
  const lines: string[] = [`# ${title}`, ""];
  if (narrative?.subtitle) {
    lines.push(`*${narrative.subtitle}*`);
    lines.push("");
  }
  lines.push(`${labels.generatedAt}：${now.toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}`);
  if (scopeLabel) {
    lines.push(`${labels.scope}：${scopeLabel}`);
  }
  lines.push(
    `${labels.provenance}：${labels.user} ${provenance.userQuestions} · ${labels.ai} ${provenance.aiQuestions} · ${labels.aiEdited} ${provenance.aiEditedQuestions} · ${labels.aiResults} ${provenance.aiResults}`,
  );
  lines.push("");

  if (tasks.length === 0) {
    lines.push(labels.empty);
    return `${lines.join("\n")}\n`;
  }

  if (narrative?.executiveSummary) {
    lines.push(`## ${labels.overview}`);
    lines.push("");
    lines.push(narrative.executiveSummary);
    lines.push("");
  }

  if (sections?.length) {
    const byId = new Map(tasks.map((task) => [task.node.id, task]));
    for (const section of sections) {
      lines.push(`## ${section.title}`);
      lines.push("");
      if (section.summary) {
        lines.push(`**${labels.sectionSummary}**：${section.summary}`);
        lines.push("");
      }
      if (section.keyFindings?.length) {
        lines.push(`**${labels.keyFindings}**`);
        lines.push("");
        for (const item of section.keyFindings) {
          lines.push(`- ${item}`);
        }
        lines.push("");
      }
      for (const taskId of section.taskIds) {
        const task = byId.get(taskId);
        if (task) lines.push(markdownTask(task, locale, detail, 3));
      }
    }
  } else {
    for (const task of tasks) {
      lines.push(markdownTask(task, locale, detail));
    }
  }

  if (narrative?.conclusion) {
    lines.push(`## ${labels.conclusion}`);
    lines.push("");
    lines.push(narrative.conclusion);
    lines.push("");
  }

  if (detail === "full" && looseNotes.length > 0) {
    lines.push(`## ${labels.loose}`);
    lines.push("");
    for (const note of looseNotes) {
      const body = formatMentionsForText(String(note.data.body ?? "")).trim();
      lines.push(`- **${oneLine(note.data.title)}**${body ? `：${body}` : ""}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderHtmlTask(
  task: ReportTask,
  locale: "zh" | "en",
  detail: ReportDetail,
  reportNodeIds: Set<string>,
  headingLevel: 2 | 3 = 2,
): string {
  const labels = LABELS[locale];
  const headingTag = `h${headingLevel}`;
  const subHeadingTag = `h${headingLevel + 1}`;
  const evidence = detail === "full"
    ? task.evidence
      .map(
        (item) =>
          `<li id="node-${escapeHtml(item.id)}"><strong>${escapeHtml(item.data.title)}</strong>${item.data.body ? `：${renderHtmlMentions(item.data.body, reportNodeIds)}` : ""}</li>`,
      )
      .join("")
    : "";
  const results = detail === "full"
    ? task.results
      .map(
        (item) =>
          `<li id="node-${escapeHtml(item.id)}"><strong>${escapeHtml(item.data.title)}</strong>${item.data.body ? `：${renderHtmlMentions(item.data.body, reportNodeIds)}` : ""}</li>`,
      )
      .join("")
    : "";

  const guide = task.node.data.catalog?.mode === "directions" ? task.node.data.catalog : null;
  const guideChildByItem = guideChildrenByItem(task);
  const guideHtml = guide
    ? `<div class="block guide">
  ${guide.summary ? `<p class="guide-summary"><strong>${escapeHtml(labels.guideSummary)}</strong>：${renderHtmlMentions(guide.summary, reportNodeIds)}</p>` : ""}
  <${subHeadingTag}>${escapeHtml(labels.guidePath)}</${subHeadingTag}>
  <ul>
    ${guide.items.map((item) => {
      const child = guideChildByItem.get(item.id);
      const state = guideItemState(child, labels);
      const backfill = child?.node.data.catalogBackfill
        ? `<span class="guide-backfill">${escapeHtml(labels.guideBackfill)}：${escapeHtml(child.node.data.catalogBackfill)}</span>`
        : "";
      return `<li><span class="guide-state">${escapeHtml(state)}</span><strong>${escapeHtml(item.title)}</strong>${item.why ? `：${escapeHtml(item.why)}` : ""}${backfill}</li>`;
    }).join("")}
  </ul>
</div>`
    : "";

  return `<section class="task" id="node-${escapeHtml(task.node.id)}">
  <${headingTag}>${escapeHtml(labels.task)} ${escapeHtml(task.path)}：${escapeHtml(task.question)}</${headingTag}>
  <div class="task-meta">
    <span>${escapeHtml(labels.type)}：${escapeHtml(taskTypeLabel(task.taskType, locale))}</span>
    <span>${escapeHtml(labels.source)}：${escapeHtml(authorText(task.authorLabel, locale))}</span>
  </div>
  <div class="question">${renderHtmlMentions(task.node.data.body, reportNodeIds)}</div>
  ${guideHtml}
  ${evidence ? `<div class="block"><${subHeadingTag}>${escapeHtml(labels.evidence)}</${subHeadingTag}><ul>${evidence}</ul></div>` : ""}
  ${results ? `<div class="block"><${subHeadingTag}>${escapeHtml(labels.results)}</${subHeadingTag}><ul>${results}</ul></div>` : ""}
</section>`;
}

function renderHtml(
  title: string,
  now: Date,
  provenance: TaskProvenanceSummary,
  tasks: ReportTask[],
  looseNotes: GoDeeperFlowNode[],
  locale: "zh" | "en",
  detail: ReportDetail,
  scopeLabel?: string,
  sections?: ReportSection[],
  narrative?: ReportNarrative,
): string {
  const labels = LABELS[locale];
  const byId = new Map(tasks.map((task) => [task.node.id, task]));
  const reportNodeIds = new Set<string>();
  for (const task of tasks) {
    reportNodeIds.add(task.node.id);
    task.evidence.forEach((node) => reportNodeIds.add(node.id));
    task.results.forEach((node) => reportNodeIds.add(node.id));
  }
  looseNotes.forEach((node) => reportNodeIds.add(node.id));
  const generatedAt = now.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  const loose = detail === "full"
    ? looseNotes
      .map(
        (note) =>
          `<li id="node-${escapeHtml(note.id)}"><strong>${escapeHtml(note.data.title)}</strong>${note.data.body ? `：${renderHtmlMentions(note.data.body, reportNodeIds)}` : ""}</li>`,
      )
      .join("")
    : "";

  const toc = sections?.length
    ? `<nav class="toc" aria-label="${escapeHtml(locale === "zh" ? "目录" : "Contents")}">
  <h2 class="toc-title">${escapeHtml(locale === "zh" ? "目录" : "Contents")}</h2>
  <ol>
    ${sections.map((section, index) => `<li><span class="toc-index">${String(index + 1).padStart(2, "0")}</span><span class="toc-name">${escapeHtml(section.title)}</span><span class="toc-count">${section.taskIds.length} ${escapeHtml(labels.cards)}</span></li>`).join("\n    ")}
  </ol>
</nav>`
    : "";

  const body = tasks.length === 0
    ? `<p class="empty">${escapeHtml(labels.empty)}</p>`
    : sections?.length
      ? sections.map((section, index) => {
          const summary = section.summary
            ? `<p class="section-summary">${escapeHtml(section.summary)}</p>`
            : "";
          const findings = section.keyFindings?.length
            ? `<div class="findings"><h3>${escapeHtml(labels.keyFindings)}</h3><ul>${section.keyFindings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
            : "";
          const sectionTasks = section.taskIds
            .map((id) => byId.get(id))
            .filter((task): task is ReportTask => Boolean(task))
            .map((task) => renderHtmlTask(task, locale, detail, reportNodeIds, 3))
            .join("\n");
          return `<section class="report-section">
  <div class="section-head"><span class="section-index">${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(section.title)}</h2></div>
  ${summary}
  ${findings}
  ${sectionTasks}
</section>`;
        }).join("\n")
      : tasks.map((task) => renderHtmlTask(task, locale, detail, reportNodeIds)).join("\n");

  const overview = narrative?.executiveSummary
    ? `<section class="callout overview">
  <h2>${escapeHtml(labels.overview)}</h2>
  <p>${escapeHtml(narrative.executiveSummary)}</p>
</section>`
    : "";

  const conclusion = narrative?.conclusion
    ? `<section class="callout conclusion">
  <h2>${escapeHtml(labels.conclusion)}</h2>
  <p>${escapeHtml(narrative.conclusion)}</p>
</section>`
    : "";

  return `<!DOCTYPE html>
<html lang="${locale === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --paper: #f4f2eb;
      --raised: #fbf9f3;
      --ink: #211d17;
      --ink-soft: #5d564c;
      --ink-faint: #8b8275;
      --line: #ddd6c7;
      --pink: #cf4f86;
      --green: #107c58;
    }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: "Noto Sans SC", -apple-system, "Segoe UI", "PingFang SC", sans-serif;
      font-size: 15px;
      line-height: 1.75;
    }
    .page { max-width: 860px; margin: 0 auto; padding: 56px 40px 72px; }
    .cover { border-bottom: 2px solid var(--ink); padding-bottom: 28px; margin-bottom: 34px; }
    .kicker {
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--pink);
      font-weight: 600;
    }
    h1 {
      font-family: "Noto Serif SC", Georgia, "Songti SC", serif;
      font-size: 40px;
      line-height: 1.24;
      letter-spacing: -0.01em;
      margin: 14px 0 10px;
    }
    .subtitle {
      font-family: "Noto Serif SC", Georgia, "Songti SC", serif;
      font-size: 18px;
      color: var(--ink-soft);
      margin: 0 0 24px;
    }
    .meta { display: flex; flex-wrap: wrap; gap: 10px 32px; margin: 0; font-size: 13px; }
    .meta div { display: flex; gap: 8px; }
    .meta dt { color: var(--ink-faint); }
    .meta dd { margin: 0; color: var(--ink-soft); }
    .provenance {
      margin-top: 20px;
      padding: 12px 16px;
      background: var(--raised);
      border-left: 3px solid var(--green);
      font-size: 12.5px;
      color: var(--ink-soft);
    }
    .toc { margin: 0 0 40px; padding: 22px 24px; background: var(--raised); border: 1px solid var(--line); }
    .toc-title {
      font-size: 12px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--ink-faint);
      margin: 0 0 14px;
    }
    .toc ol { list-style: none; margin: 0; padding: 0; }
    .toc li {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 7px 0;
      border-top: 1px solid var(--line);
      font-size: 14px;
    }
    .toc li:first-child { border-top: none; }
    .toc-index { font-variant-numeric: tabular-nums; color: var(--pink); font-size: 12px; }
    .toc-name { flex: 1; }
    .toc-count { font-size: 12px; color: var(--ink-faint); }
    .callout {
      margin: 0 0 34px;
      padding: 22px 26px;
      background: var(--raised);
      border: 1px solid var(--line);
      border-left: 4px solid var(--green);
    }
    .callout h2 {
      font-family: "Noto Serif SC", Georgia, "Songti SC", serif;
      font-size: 16px;
      margin: 0 0 10px;
      letter-spacing: 0.02em;
    }
    .callout p { margin: 0; color: var(--ink-soft); }
    .conclusion { border-left-color: var(--pink); }
    .report-section { margin-bottom: 40px; }
    .section-head {
      display: flex;
      align-items: baseline;
      gap: 12px;
      border-bottom: 1px solid var(--ink);
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    .section-index { font-size: 12px; color: var(--pink); font-variant-numeric: tabular-nums; }
    .section-head h2 {
      font-family: "Noto Serif SC", Georgia, "Songti SC", serif;
      font-size: 24px;
      margin: 0;
    }
    .section-summary { margin: 0 0 16px; color: var(--ink-soft); }
    .findings {
      margin: 0 0 20px;
      padding: 16px 20px;
      background: var(--raised);
      border: 1px solid var(--line);
    }
    .findings h3 {
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--green);
      margin: 0 0 8px;
    }
    .findings ul { margin: 0; padding-left: 18px; font-size: 13.5px; color: var(--ink-soft); }
    .findings li { margin: 4px 0; }
    .task {
      background: var(--raised);
      border: 1px solid var(--line);
      padding: 20px 24px;
      margin-bottom: 16px;
    }
    .task h2, .task h3 {
      font-family: "Noto Serif SC", Georgia, "Songti SC", serif;
      font-size: 18px;
      margin: 0 0 10px;
    }
    .task-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 18px;
      font-size: 12px;
      color: var(--ink-faint);
      margin-bottom: 12px;
    }
    .question { white-space: pre-wrap; font-size: 14px; color: var(--ink-soft); }
    .mention { color: #3d5afe; background: #eef1ff; padding: 1px 4px; border-radius: 4px; text-decoration: none; }
    .block { margin-top: 16px; }
    .block h4, .block h3 {
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--ink-faint);
      margin: 0 0 8px;
      font-family: inherit;
    }
    .block ul, .loose ul { margin: 0; padding-left: 18px; font-size: 13.5px; color: var(--ink-soft); }
    .block li, .loose li { margin: 4px 0; }
    .loose { margin-top: 34px; padding: 20px 24px; background: var(--raised); border: 1px solid var(--line); }
    .loose h2 { font-size: 16px; margin: 0 0 10px; font-family: "Noto Serif SC", Georgia, serif; }
    .guide-summary { margin: 0 0 10px; font-size: 13.5px; color: var(--ink-soft); }
    .guide-state {
      display: inline-block;
      margin-right: 6px;
      font-size: 10px;
      letter-spacing: .06em;
      color: var(--green);
      border: 1px solid currentColor;
      border-radius: 999px;
      padding: 0 5px;
    }
    .guide-backfill { display: block; margin-top: 2px; font-size: 12px; color: var(--ink-faint); }
    .empty { color: var(--ink-faint); }
    footer {
      margin-top: 44px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
      font-size: 12px;
      color: var(--ink-faint);
      display: flex;
      justify-content: space-between;
    }
    @page { size: A4; margin: 16mm 14mm 18mm; }
    @media print {
      body { background: #fff; font-size: 11.5pt; }
      .page { max-width: none; padding: 0; }
      .cover { break-after: page; }
      .toc { break-after: page; }
      .callout, .report-section, .task, .loose { break-inside: avoid; }
    }
    @media (max-width: 640px) {
      .page { padding: 32px 20px 48px; }
      h1 { font-size: 28px; }
      .cover, .toc, .callout, .task { padding-left: 16px; padding-right: 16px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="cover">
      <div class="kicker">GoDeeper · ${escapeHtml(locale === "zh" ? "推理报告" : "Reasoning report")}</div>
      <h1>${escapeHtml(title)}</h1>
      ${narrative?.subtitle ? `<p class="subtitle">${escapeHtml(narrative.subtitle)}</p>` : ""}
      <dl class="meta">
        <div><dt>${escapeHtml(labels.generatedAt)}</dt><dd>${escapeHtml(generatedAt)}</dd></div>
        ${scopeLabel ? `<div><dt>${escapeHtml(labels.scope)}</dt><dd>${escapeHtml(scopeLabel)}</dd></div>` : ""}
        <div><dt>${escapeHtml(labels.task)}</dt><dd>${tasks.length}</dd></div>
      </dl>
      <div class="provenance">${escapeHtml(labels.provenance)}：${escapeHtml(labels.user)} ${provenance.userQuestions} · ${escapeHtml(labels.ai)} ${provenance.aiQuestions} · ${escapeHtml(labels.aiEdited)} ${provenance.aiEditedQuestions} · ${escapeHtml(labels.aiResults)} ${provenance.aiResults}</div>
    </header>
    ${toc}
    ${overview}
    ${body}
    ${conclusion}
    ${loose ? `<section class="loose"><h2>${escapeHtml(labels.loose)}</h2><ul>${loose}</ul></section>` : ""}
    <footer><span>GoDeeper</span><span>${escapeHtml(generatedAt)}</span></footer>
  </div>
</body>
</html>`;
}

function normalizeSections(
  input: ReportSection[] | undefined,
  tasks: ReportTask[],
  locale: "zh" | "en",
): ReportSection[] | undefined {
  if (!input?.length) return undefined;
  const validIds = new Set(tasks.map((task) => task.node.id));
  const seen = new Set<string>();
  const sections: ReportSection[] = [];

  for (const section of input) {
    const title = String(section.title ?? "").trim().slice(0, 60);
    if (!title) continue;
    const taskIds = (section.taskIds ?? []).filter((id) => {
      if (!validIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (taskIds.length === 0) continue;
    const next: ReportSection = { title, taskIds };
    const summary = paragraph(section.summary, 200);
    if (summary) next.summary = summary;
    const keyFindings = (section.keyFindings ?? [])
      .map((item) => paragraph(item, 120))
      .filter((item) => item.length > 0)
      .slice(0, 4);
    if (keyFindings.length > 0) next.keyFindings = keyFindings;
    sections.push(next);
  }

  if (sections.length === 0) return undefined;

  const missing = tasks.filter((task) => !seen.has(task.node.id)).map((task) => task.node.id);
  if (missing.length > 0) {
    sections.push({ title: locale === "zh" ? "其他" : "Other", taskIds: missing });
  }

  return sections;
}

export function buildStructuredReport(
  nodes: GoDeeperFlowNode[],
  edges: GoDeeperFlowEdge[],
  options: BuildStructuredReportOptions = {},
): StructuredReport {
  const locale = options.locale ?? "zh";
  const detail = options.detail ?? "full";
  const now = options.now ?? new Date();
  const title = options.title?.trim() || DEFAULT_TITLE[locale];
  const provenance = summarizeTaskProvenance(nodes.map((node) => node.data));
  const { tasks, looseNotes, scopeRootTaskIds, scopeRootNodeId } = buildReportNodes(
    nodes,
    edges,
    options.rootTaskId,
    options.rootTaskIds,
    options.rootNodeId,
  );
  const scopeRootTaskId = scopeRootTaskIds?.length === 1 ? scopeRootTaskIds[0] : undefined;
  const labels = LABELS[locale];
  const scopedTasks = (scopeRootTaskIds ?? [])
    .map((id) => tasks.find((task) => task.node.id === id))
    .filter((task): task is ReportTask => Boolean(task));
  const scopeRootNode = scopeRootNodeId ? nodes.find((node) => node.id === scopeRootNodeId) : undefined;
  const scopeLabel = scopeRootNodeId && scopeRootNode
    ? `${labels.scopeBranch} · ${oneLine(scopeRootNode.data.title) || oneLine(scopeRootNode.data.body) || scopeRootNode.id}`
    : scopeRootTaskIds?.length
      ? `${scopeRootTaskIds.length === 1 ? labels.scopeBranch : `${labels.scopeSelected} ${scopeRootTaskIds.length}`} · ${scopedTasks.map((task) => oneLine(task.question)).filter(Boolean).join(locale === "zh" ? "、" : ", ")}`
      : undefined;
  const sections = normalizeSections(options.sections, tasks, locale);
  const narrative: ReportNarrative = {
    subtitle: paragraph(options.narrative?.subtitle, 120),
    executiveSummary: paragraph(options.narrative?.executiveSummary, 400),
    conclusion: paragraph(options.narrative?.conclusion, 300),
  };

  return {
    title,
    subtitle: narrative.subtitle ?? "",
    generatedAt: now.toISOString(),
    provenance,
    executiveSummary: narrative.executiveSummary ?? "",
    conclusion: narrative.conclusion ?? "",
    tasks,
    looseNotes,
    scopeRootTaskId,
    scopeRootTaskIds,
    scopeRootNodeId,
    scopeLabel,
    sections,
    detail,
    markdown: renderMarkdown(title, now, provenance, tasks, looseNotes, locale, detail, scopeLabel, sections, narrative),
    html: renderHtml(title, now, provenance, tasks, looseNotes, locale, detail, scopeLabel, sections, narrative),
  };
}
