import type { GoDeeperFlowEdge, GoDeeperFlowNode, NodeKind } from "@/lib/types";
import type { OrganizedReport } from "@/lib/report-graph";

export interface RenderAiReportOptions {
  plan: OrganizedReport;
  nodes: GoDeeperFlowNode[];
  edges: GoDeeperFlowEdge[];
  title?: string;
  generatedAt?: Date;
  locale?: "zh" | "en";
  scopeLabel?: string;
}

const KIND_LABELS: Record<NodeKind, { zh: string; en: string }> = {
  text: { zh: "文本", en: "Text" },
  task: { zh: "任务", en: "Task" },
  link: { zh: "来源", en: "Source" },
  result: { zh: "结果", en: "Result" },
  free: { zh: "自由卡", en: "Free card" },
  inspire: { zh: "启发", en: "Inspire" },
  note: { zh: "笔记", en: "Note" },
  image: { zh: "图片", en: "Image" },
};

const LABELS = {
  zh: {
    kicker: "GoDeeper 研究纪要",
    summary: "总结",
    mainThread: "逻辑主线",
    stages: "推理步骤",
    question: "这一阶段在回答",
    reasoning: "推理",
    sources: "依据",
    outcome: "阶段结论",
    milestones: "阶段性里程碑",
    brightSpots: "闪光点",
    whyItMatters: "为什么重要",
    conclusion: "结论",
    openQuestions: "未决问题",
    appendix: "附录：原文索引",
    generatedAt: "生成时间",
    scope: "整理范围",
    counts: "节点 / 连线 / 阶段",
    milestoneBadge: "里程碑",
    crossStage: "跨阶段关联",
    noContent: "无正文",
  },
  en: {
    kicker: "GoDeeper Research Note",
    summary: "Summary",
    mainThread: "Main thread",
    stages: "Reasoning steps",
    question: "This stage answers",
    reasoning: "Reasoning",
    sources: "Basis",
    outcome: "Stage outcome",
    milestones: "Milestones",
    brightSpots: "Bright spots",
    whyItMatters: "Why it matters",
    conclusion: "Conclusion",
    openQuestions: "Open questions",
    appendix: "Appendix: source index",
    generatedAt: "Generated",
    scope: "Scope",
    counts: "Nodes / Edges / Stages",
    milestoneBadge: "Milestone",
    crossStage: "Cross-stage relation",
    noContent: "No body",
  },
} as const;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function oneLine(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function paragraphs(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function excerpt(value: unknown, max = 260): string {
  const text = oneLine(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function kindLabel(kind: NodeKind, locale: "zh" | "en"): string {
  return KIND_LABELS[kind]?.[locale] ?? kind;
}

function nodeExcerpt(node: GoDeeperFlowNode | undefined): string {
  if (!node) return "";
  const catalogBody = node.data.catalog?.items?.map((item) => item.body).filter(Boolean).join("；");
  return excerpt(catalogBody || node.data.summary || node.data.body, 260);
}

function nodeOriginalHtml(node: GoDeeperFlowNode | undefined, locale: "zh" | "en"): string {
  if (!node) return "";
  const labels = LABELS[locale];
  const catalog = node.data.catalog;
  const catalogHtml = catalog?.items?.length
    ? `<ul>${catalog.items.map((item) => `<li><strong>${escapeHtml(item.title)}</strong>${item.body ? `：${escapeHtml(item.body)}` : ""}</li>`).join("")}</ul>`
    : "";
  const keyPointsHtml = node.data.keyPoints?.length
    ? `<ul>${node.data.keyPoints.map((point) => `<li><strong>${escapeHtml(point.text)}</strong>${point.body ? `：${escapeHtml(point.body)}` : ""}</li>`).join("")}</ul>`
    : "";
  const noteHtml = node.data.notePages?.length
    ? node.data.notePages.map((page) => `<div class="body">${escapeHtml(page.editedMarkdown || page.ocrMarkdown || "")}</div>`).join("")
    : "";
  const inspireHtml = node.data.inspireQuestion
    ? `<p><strong>${escapeHtml(node.data.inspireQuestion)}</strong></p>${node.data.inspireReason ? `<p>${escapeHtml(node.data.inspireReason)}</p>` : ""}`
    : "";
  const socraticHtml = node.data.socraticSession
    ? `<p><strong>${escapeHtml(node.data.socraticSession.title || "")}</strong></p>${node.data.socraticSession.summary ? `<p>${escapeHtml(node.data.socraticSession.summary)}</p>` : ""}${node.data.socraticSession.blindSpots?.length ? `<ul>${node.data.socraticSession.blindSpots.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}`
    : "";
  const body = node.data.body ? `<div class="body">${escapeHtml(node.data.body)}</div>` : "";
  const content = catalogHtml || keyPointsHtml || noteHtml || inspireHtml || socraticHtml || body;

  return `<div class="original" id="node-${escapeHtml(node.id)}">
    <h4>${escapeHtml(node.data.title || node.id)} <span class="badge">${escapeHtml(kindLabel(node.data.kind, locale))}</span></h4>
    ${content || `<div class="body">${escapeHtml(labels.noContent)}</div>`}
  </div>`;
}

function crossStageRelations(
  stageNodeIds: string[],
  plan: OrganizedReport,
  edgeById: Map<string, GoDeeperFlowEdge>,
  nodeById: Map<string, GoDeeperFlowNode>,
  locale: "zh" | "en",
): string {
  const labels = LABELS[locale];
  const rows: string[] = [];
  for (const relation of plan.relations) {
    const edge = edgeById.get(relation.edgeId);
    if (!edge) continue;
    const touches = stageNodeIds.includes(edge.source) || stageNodeIds.includes(edge.target);
    if (!touches) continue;
    const bothInStage = stageNodeIds.includes(edge.source) && stageNodeIds.includes(edge.target);
    if (bothInStage) continue;
    const source = nodeById.get(edge.source)?.data.title || edge.source;
    const target = nodeById.get(edge.target)?.data.title || edge.target;
    rows.push(`<div class="relation">${escapeHtml(labels.crossStage)}：${escapeHtml(source)} → ${escapeHtml(target)}${relation.note ? `（${escapeHtml(relation.note)}）` : ""}</div>`);
  }
  return rows.join("");
}

export function renderAiReportHtml(options: RenderAiReportOptions): string {
  const { plan, nodes, edges, title, generatedAt = new Date(), locale = "zh", scopeLabel } = options;
  const labels = LABELS[locale];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));

  const stageChain = plan.mainThread.stageIds
    .map((id, index) => {
      const stage = plan.stages.find((item) => item.id === id);
      if (!stage) return "";
      return `<span class="chain-item"><span class="chain-index">${String(index + 1).padStart(2, "0")}</span>${escapeHtml(stage.title)}</span>`;
    })
    .filter(Boolean)
    .join('<span class="chain-arrow">→</span>');

  const stageHtml = plan.stages.map((stage, index) => {
    const stageNodeIds = stage.nodeIds;
    const milestone = plan.milestones.filter((item) => item.stageId === stage.id);
    const sources = stageNodeIds
      .map((id) => {
        const node = nodeById.get(id);
        if (!node) return "";
        return `<div class="source-card">
          <a class="source-title" href="#node-${escapeHtml(id)}">${escapeHtml(node.data.title || id)}</a>
          <span class="source-kind">${escapeHtml(kindLabel(node.data.kind, locale))}</span>
          <div class="source-excerpt">${escapeHtml(nodeExcerpt(node) || labels.noContent)}</div>
        </div>`;
      })
      .join("");
    const relations = crossStageRelations(stageNodeIds, plan, edgeById, nodeById, locale);
    const milestoneHtml = milestone.length
      ? `<div class="milestone-line">${milestone.map((item) => `<span class="badge milestone-badge">${escapeHtml(labels.milestoneBadge)}：${escapeHtml(item.title)}</span>`).join(" ")}</div>`
      : "";

    return `<section class="stage" id="stage-${escapeHtml(stage.id)}">
      <div class="stage-head">
        <span class="stage-index">${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(stage.title)}</h3>
      </div>
      ${milestoneHtml}
      <div class="question"><strong>${escapeHtml(labels.question)}</strong>：${escapeHtml(stage.question)}</div>
      <div class="reasoning">${paragraphs(stage.reasoning)}</div>
      <div class="sources">
        <h4>${escapeHtml(labels.sources)}</h4>
        ${sources}
      </div>
      ${relations}
      <div class="outcome">
        <h4>${escapeHtml(labels.outcome)}</h4>
        <p>${escapeHtml(stage.outcome)}</p>
      </div>
    </section>`;
  }).join("");

  const milestonesHtml = plan.milestones.length
    ? `<section class="section milestones">
        <h2>${escapeHtml(labels.milestones)}</h2>
        <div class="timeline">
          ${plan.milestones.map((item, index) => {
            const stage = plan.stages.find((entry) => entry.id === item.stageId);
            return `<div class="milestone">
              <span class="milestone-dot">${String(index + 1).padStart(2, "0")}</span>
              <div>
                <h4>${escapeHtml(item.title)}</h4>
                <p>${escapeHtml(item.description)}</p>
                ${stage ? `<div class="milestone-stage">${escapeHtml(stage.title)}</div>` : ""}
              </div>
            </div>`;
          }).join("")}
        </div>
      </section>`
    : "";

  const brightSpotsHtml = plan.brightSpots.length
    ? `<section class="section spots">
        <h2>${escapeHtml(labels.brightSpots)}</h2>
        <div class="spot-grid">
          ${plan.brightSpots.map((spot) => `<div class="spot">
            <h4>${escapeHtml(spot.title)}</h4>
            <p>${escapeHtml(spot.insight)}</p>
            <p class="spot-why">${escapeHtml(labels.whyItMatters)}：${escapeHtml(spot.whyItMatters)}</p>
          </div>`).join("")}
        </div>
      </section>`
    : "";

  const openQuestionsHtml = plan.openQuestions.length
    ? `<section class="section open">
        <h2>${escapeHtml(labels.openQuestions)}</h2>
        <ul>
          ${plan.openQuestions.map((item) => `<li>${escapeHtml(item.question)}</li>`).join("")}
        </ul>
      </section>`
    : "";

  const appendixHtml = `<section class="appendix">
    <h2>${escapeHtml(labels.appendix)}</h2>
    ${plan.stages.map((stage) => `<div class="appendix-stage">
      <h3>${escapeHtml(stage.title)}</h3>
      ${stage.nodeIds.map((id) => nodeOriginalHtml(nodeById.get(id), locale)).join("")}
    </div>`).join("")}
  </section>`;

  const meta = [
    `${labels.generatedAt}：${escapeHtml(generatedAt.toLocaleString(locale === "zh" ? "zh-CN" : "en-US"))}`,
    scopeLabel ? `${labels.scope}：${escapeHtml(scopeLabel)}` : "",
    `${labels.counts}：${nodes.length} / ${edges.length} / ${plan.stages.length}`,
  ].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html lang="${locale === "zh" ? "zh-CN" : "en"}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title || plan.title)}</title>
<style>
:root{--paper:#f4f2eb;--raised:#fbf9f3;--ink:#211d17;--ink-soft:#5d564c;--ink-faint:#8b8275;--line:#ddd6c7;--pink:#cf4f86;--green:#107c58}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:var(--paper);color:var(--ink);font-family:"Noto Sans SC",-apple-system,"Segoe UI","PingFang SC",sans-serif}
.page{max-width:860px;margin:0 auto;padding:56px 40px 80px}
.cover{border-bottom:1px solid var(--line);padding-bottom:32px;margin-bottom:32px}
.kicker{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--pink)}
h1,h2,h3,h4{font-family:"Noto Serif SC",Georgia,serif}
h1{font-size:34px;line-height:1.25;margin:12px 0 8px}
.subtitle{font-size:16px;color:var(--ink-soft)}
.meta{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:18px;font-size:12px;color:var(--ink-faint)}
.summary{background:var(--raised);border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin:28px 0}
.summary h2{margin:0 0 10px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--pink)}
.summary p{margin:0;font-size:17px;line-height:1.85}
.section{margin:44px 0}
.section h2{font-size:24px;margin:0 0 16px}
.main-thread{background:var(--raised);border:1px solid var(--line);border-radius:14px;padding:22px 24px}
.main-thread .thesis{font-size:18px;line-height:1.7;margin:0 0 12px}
.chain{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:16px}
.chain-item{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--paper);border-radius:999px;padding:5px 10px;font-size:12px;color:var(--ink-soft)}
.chain-index{color:var(--pink);font-variant-numeric:tabular-nums}
.chain-arrow{color:var(--ink-faint);font-size:12px}
.stage{border-top:1px solid var(--line);padding-top:22px;margin:34px 0}
.stage-head{display:flex;align-items:baseline;gap:12px}
.stage-index{font-size:12px;color:var(--pink);font-variant-numeric:tabular-nums}
.stage h3{font-size:21px;margin:0}
.milestone-line{margin:10px 0 0}
.milestone-badge{border-color:var(--green);color:var(--green)}
.question{font-size:14px;color:var(--ink-soft);margin:10px 0 14px;line-height:1.7}
.reasoning p{font-size:15px;line-height:1.9;margin:0 0 12px}
.sources{background:var(--raised);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:18px 0}
.sources h4,.outcome h4{margin:0 0 8px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint)}
.source-card{padding:10px 0;border-top:1px dashed var(--line)}
.source-card:first-of-type{border-top:0;padding-top:0}
.source-title{font-weight:600;color:var(--ink);text-decoration:none}
.source-kind{font-size:11px;color:var(--ink-faint);margin-left:8px}
.source-excerpt{font-size:13px;color:var(--ink-soft);line-height:1.7;margin-top:4px}
.outcome{border-left:3px solid var(--green);background:rgba(16,124,88,.06);border-radius:0 10px 10px 0;padding:14px 16px;margin:18px 0}
.outcome p{margin:0;font-size:14px;line-height:1.8}
.relation{font-size:12px;color:var(--ink-soft);margin:6px 0}
.timeline{display:grid;gap:0}
.milestone{display:flex;gap:14px;padding:14px 0;border-top:1px solid var(--line)}
.milestone:first-child{border-top:0}
.milestone-dot{flex:0 0 auto;font-size:11px;color:var(--green);border:1px solid var(--green);border-radius:999px;padding:3px 7px;height:fit-content}
.milestone h4{margin:0 0 4px;font-size:15px}
.milestone p{margin:0;font-size:13px;color:var(--ink-soft);line-height:1.7}
.milestone-stage{font-size:11px;color:var(--ink-faint);margin-top:4px}
.spot-grid{display:grid;gap:14px}
.spot{background:var(--raised);border:1px solid var(--line);border-left:3px solid var(--pink);border-radius:12px;padding:16px 18px}
.spot h4{margin:0 0 6px;font-size:16px}
.spot p{margin:0 0 8px;font-size:14px;line-height:1.8}
.spot-why{font-size:13px;color:var(--ink-soft)}
.open ul{margin:0;padding-left:20px}
.open li{font-size:14px;line-height:1.8;margin-bottom:8px}
.appendix{border-top:2px solid var(--ink);margin-top:56px;padding-top:24px}
.appendix h2{font-size:18px}
.appendix-stage h3{font-size:15px;margin:24px 0 8px}
.original{background:var(--raised);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:10px 0}
.original h4{margin:0 0 6px;font-size:14px}
.original .body{white-space:pre-wrap;font-size:13px;line-height:1.75;color:var(--ink-soft);margin:6px 0}
.original ul{margin:6px 0;padding-left:18px;font-size:13px;line-height:1.7}
.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:var(--paper);border:1px solid var(--line);color:var(--ink-soft);font-family:"Noto Sans SC",sans-serif;font-weight:400}
@media print{body{background:#fff}.page{max-width:none;padding:0}.stage,.spot,.original,.main-thread{break-inside:avoid}.appendix{break-before:page}}
</style>
</head>
<body>
<main class="page">
  <header class="cover">
    <div class="kicker">${escapeHtml(labels.kicker)}</div>
    <h1>${escapeHtml(title || plan.title)}</h1>
    ${plan.subtitle ? `<div class="subtitle">${escapeHtml(plan.subtitle)}</div>` : ""}
    <div class="meta">${meta}</div>
  </header>

  <section class="summary">
    <h2>${escapeHtml(labels.summary)}</h2>
    <p>${escapeHtml(plan.summary)}</p>
  </section>

  <section class="section">
    <h2>${escapeHtml(labels.mainThread)}</h2>
    <div class="main-thread">
      <p class="thesis">${escapeHtml(plan.mainThread.thesis)}</p>
      ${paragraphs(plan.mainThread.narrative)}
      ${stageChain ? `<div class="chain">${stageChain}</div>` : ""}
    </div>
  </section>

  <section class="section">
    <h2>${escapeHtml(labels.stages)}</h2>
    ${stageHtml}
  </section>

  ${milestonesHtml}
  ${brightSpotsHtml}

  <section class="section">
    <h2>${escapeHtml(labels.conclusion)}</h2>
    ${paragraphs(plan.conclusion)}
  </section>

  ${openQuestionsHtml}
  ${appendixHtml}
</main>
</body>
</html>`;
}

export function renderAiReportMarkdown(options: RenderAiReportOptions): string {
  const { plan, nodes, edges, title, generatedAt = new Date(), locale = "zh", scopeLabel } = options;
  const labels = LABELS[locale];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const lines: string[] = [];

  lines.push(`# ${title || plan.title}`);
  if (plan.subtitle) lines.push(`> ${plan.subtitle}`);
  lines.push("");
  lines.push(`- ${labels.generatedAt}：${generatedAt.toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}`);
  if (scopeLabel) lines.push(`- ${labels.scope}：${scopeLabel}`);
  lines.push(`- ${labels.counts}：${nodes.length} / ${edges.length} / ${plan.stages.length}`);
  lines.push("");
  lines.push(`## ${labels.summary}`);
  lines.push(plan.summary);
  lines.push("");
  lines.push(`## ${labels.mainThread}`);
  lines.push(`**${plan.mainThread.thesis}**`);
  lines.push("");
  lines.push(plan.mainThread.narrative);
  lines.push("");
  plan.stages.forEach((stage, index) => {
    lines.push(`## ${index + 1}. ${stage.title}`);
    lines.push(`**${labels.question}**：${stage.question}`);
    lines.push("");
    lines.push(`### ${labels.reasoning}`);
    lines.push(stage.reasoning);
    lines.push("");
    lines.push(`### ${labels.sources}`);
    for (const id of stage.nodeIds) {
      const node = nodeById.get(id);
      if (!node) continue;
      lines.push(`- **${node.data.title || id}**（${kindLabel(node.data.kind, locale)}）：${nodeExcerpt(node)}`);
    }
    lines.push("");
    const relations = plan.relations
      .map((relation) => {
        const edge = edgeById.get(relation.edgeId);
        if (!edge) return null;
        if (!stage.nodeIds.includes(edge.source) && !stage.nodeIds.includes(edge.target)) return null;
        if (stage.nodeIds.includes(edge.source) && stage.nodeIds.includes(edge.target)) return null;
        const source = nodeById.get(edge.source)?.data.title || edge.source;
        const target = nodeById.get(edge.target)?.data.title || edge.target;
        return `- ${labels.crossStage}：${source} → ${target}${relation.note ? `（${relation.note}）` : ""}`;
      })
      .filter(Boolean);
    if (relations.length) {
      lines.push(...relations as string[]);
      lines.push("");
    }
    lines.push(`**${labels.outcome}**：${stage.outcome}`);
    lines.push("");
  });

  if (plan.milestones.length) {
    lines.push(`## ${labels.milestones}`);
    for (const item of plan.milestones) {
      lines.push(`- **${item.title}**：${item.description}`);
    }
    lines.push("");
  }

  if (plan.brightSpots.length) {
    lines.push(`## ${labels.brightSpots}`);
    for (const spot of plan.brightSpots) {
      lines.push(`### ${spot.title}`);
      lines.push(spot.insight);
      lines.push("");
      lines.push(`${labels.whyItMatters}：${spot.whyItMatters}`);
      lines.push("");
    }
  }

  lines.push(`## ${labels.conclusion}`);
  lines.push(plan.conclusion);
  lines.push("");

  if (plan.openQuestions.length) {
    lines.push(`## ${labels.openQuestions}`);
    for (const item of plan.openQuestions) {
      lines.push(`- ${item.question}`);
    }
    lines.push("");
  }

  lines.push(`## ${labels.appendix}`);
  for (const stage of plan.stages) {
    lines.push(`### ${stage.title}`);
    for (const id of stage.nodeIds) {
      const node = nodeById.get(id);
      if (!node) continue;
      lines.push(`#### ${node.data.title || id}（${kindLabel(node.data.kind, locale)}）`);
      if (node.data.body) lines.push(node.data.body);
      for (const item of node.data.catalog?.items ?? []) {
        lines.push(`- **${item.title}**${item.body ? `：${item.body}` : ""}`);
      }
      for (const point of node.data.keyPoints ?? []) {
        lines.push(`- **${point.text}**${point.body ? `：${point.body}` : ""}`);
      }
      for (const page of node.data.notePages ?? []) {
        lines.push(page.editedMarkdown || page.ocrMarkdown || "");
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
