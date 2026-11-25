import { describe, it, expect } from "vitest";
import type { GoDeeperFlowEdge, GoDeeperFlowNode } from "@/lib/types";
import { buildStructuredReport, escapeHtml, findBranchTaskId } from "@/lib/structured-report";

function node(
  id: string,
  kind: GoDeeperFlowNode["data"]["kind"],
  title: string,
  body = "",
  extra: Partial<GoDeeperFlowNode["data"]> = {},
): GoDeeperFlowNode {
  return {
    id,
    type: `${kind}Node`,
    position: { x: 0, y: 0 },
    data: { kind, title, body, ...extra },
  };
}

function edge(id: string, source: string, target: string): GoDeeperFlowEdge {
  return { id, source, target };
}

const NOW = new Date("2026-11-01T12:00:00.000Z");

function fixture() {
  const nodes: GoDeeperFlowNode[] = [
    node("root", "task", "Root question", "Root body"),
    node("evidence", "link", "Evidence source", "Evidence body"),
    node("root-result", "result", "Root result", "Root result body"),
    node("child", "task", "Child question", "Child body", {
      author: "ai",
      editedByUser: true,
    }),
    node("child-result", "result", "Child result", "Child result body"),
    node("second-root", "task", "Second root", "Second body"),
    node("loose", "text", "Loose note", "<script>alert(1)</script>"),
  ];
  const edges: GoDeeperFlowEdge[] = [
    edge("e-evidence-root", "evidence", "root"),
    edge("e-root-result", "root", "root-result"),
    edge("e-root-child", "root", "child"),
    edge("e-child-result", "child", "child-result"),
    edge("e-root-evidence-2", "root", "evidence"),
  ];
  return { nodes, edges };
}

describe("structured report", () => {
  it("groups tasks by parent and keeps evidence/results with the right task", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, { title: "Canvas", now: NOW });

    expect(report.tasks.map((task) => task.node.id)).toEqual(["root", "child", "second-root"]);
    const root = report.tasks[0];
    expect(root.evidence.map((item) => item.id)).toEqual(["evidence"]);
    expect(root.results.map((item) => item.id)).toEqual(["root-result"]);
    expect(root.children.map((item) => item.node.id)).toEqual(["child"]);

    const child = root.children[0];
    expect(child.depth).toBe(1);
    expect(child.results.map((item) => item.id)).toEqual(["child-result"]);
    expect(child.authorLabel).toBe("aiEdited");
  });

  it("scopes to a text branch and keeps its own notes and tasks", () => {
    const nodes: GoDeeperFlowNode[] = [
      node("branch", "text", "产权核验"),
      node("note", "text", "查档看查封"),
      node("task", "task", "核验任务", "核验问题"),
      node("task-result", "result", "核验结果", "结果正文"),
      node("hidden", "task", "已收起任务", "已收起", { catalogHidden: true }),
      node("other", "text", "另一个分支"),
    ];
    const edges: GoDeeperFlowEdge[] = [
      edge("e1", "branch", "note"),
      edge("e2", "branch", "task"),
      edge("e3", "task", "task-result"),
      edge("e4", "branch", "hidden"),
      edge("e5", "branch", "other"),
    ];

    const report = buildStructuredReport(nodes, edges, {
      title: "Canvas",
      now: NOW,
      locale: "zh",
      rootNodeId: "branch",
    });

    expect(report.tasks.map((task) => task.node.id)).toEqual(["task"]);
    expect(report.looseNotes.map((item) => item.id)).toEqual(["note", "other"]);
    expect(report.scopeRootNodeId).toBe("branch");
    expect(report.scopeLabel).toContain("当前分支");
    expect(report.scopeLabel).toContain("产权核验");
    expect(report.markdown).not.toContain("已收起任务");
  });

  it("counts provenance and exposes author labels", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, { title: "Canvas", now: NOW });

    expect(report.provenance.userQuestions).toBe(2);
    expect(report.provenance.aiQuestions).toBe(1);
    expect(report.provenance.aiEditedQuestions).toBe(1);
    expect(report.provenance.aiResults).toBe(2);
  });

  it("renders readable Markdown with tasks, evidence, results and children", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, {
      title: "Canvas",
      now: NOW,
      locale: "zh",
    });

    expect(report.markdown).toContain("# Canvas");
    expect(report.markdown).toContain("## 任务 1：Root question");
    expect(report.markdown).toContain("- 来源：你提的");
    expect(report.markdown).toContain("### 证据");
    expect(report.markdown).toContain("Evidence source");
    expect(report.markdown).toContain("### AI 结果");
    expect(report.markdown).toContain("Root result body");
    expect(report.markdown).toContain("任务 1.1：Child question");
    expect(report.markdown).toContain("AI 建议 · 你改写");
    expect(report.markdown).toContain("## 任务 2：Second root");
  });

  it("renders a summary outline without evidence/result details", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, {
      title: "Canvas",
      now: NOW,
      locale: "zh",
      detail: "summary",
    });

    expect(report.detail).toBe("summary");
    expect(report.markdown).toContain("## 任务 1：Root question");
    expect(report.markdown).toContain("直接证据：1 张");
    expect(report.markdown).not.toContain("### 证据");
    expect(report.markdown).not.toContain("Evidence source");
    expect(report.markdown).not.toContain("### AI 结果");
    expect(report.markdown).not.toContain("## 散落笔记");

    expect(report.html).toContain("Root question");
    expect(report.html).not.toContain('class="block"');
    expect(report.html).not.toContain("Evidence source");
    expect(report.html).not.toContain("散落笔记");
  });

  it("escapes HTML and keeps loose notes out of task sections", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, { title: "Canvas", now: NOW });

    expect(report.looseNotes.map((item) => item.id)).toContain("loose");
    expect(report.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(report.html).not.toContain("<script>alert(1)</script>");
    expect(report.html).toContain("散落笔记");
    expect(report.html).toContain("<!DOCTYPE html>");
  });

  it("returns a readable report for an empty canvas", () => {
    const report = buildStructuredReport([], [], { title: "Empty canvas", now: NOW });

    expect(report.tasks).toHaveLength(0);
    expect(report.markdown).toContain("# Empty canvas");
    expect(report.markdown).toContain("暂无内容");
    expect(report.html).toContain("<!DOCTYPE html>");
    expect(report.html).toContain("暂无内容");
  });

  it("escapes arbitrary values for HTML", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(escapeHtml(null)).toBe("");
  });

  it("scopes the report to the selected branch", () => {
    const { nodes, edges } = fixture();
    const scoped = buildStructuredReport(nodes, edges, {
      title: "Canvas",
      now: NOW,
      rootTaskId: "root",
    });

    expect(scoped.scopeRootTaskId).toBe("root");
    expect(scoped.tasks.map((task) => task.node.id)).toEqual(["root", "child"]);
    expect(scoped.looseNotes).toHaveLength(0);
    expect(scoped.markdown).toContain("导出范围");
    expect(scoped.markdown).toContain("Root question");
    expect(scoped.markdown).not.toContain("Second root");

    const childScoped = buildStructuredReport(nodes, edges, {
      title: "Canvas",
      now: NOW,
      rootTaskId: "child",
    });
    expect(childScoped.tasks.map((task) => task.node.id)).toEqual(["child"]);
    expect(childScoped.tasks[0].depth).toBe(0);
    expect(childScoped.tasks[0].path).toBe("1");
  });

  it("scopes the report to multiple selected branches", () => {
    const { nodes, edges } = fixture();
    const scoped = buildStructuredReport(nodes, edges, {
      title: "Canvas",
      now: NOW,
      rootTaskIds: ["root", "second-root"],
    });

    expect(scoped.scopeRootTaskIds).toEqual(["root", "second-root"]);
    expect(scoped.scopeRootTaskId).toBeUndefined();
    expect(scoped.tasks.map((task) => task.node.id)).toEqual(["root", "child", "second-root"]);
    expect(scoped.looseNotes).toHaveLength(0);
    expect(scoped.scopeLabel).toContain("已选分支 2");
    expect(scoped.markdown).toContain("Root question");
    expect(scoped.markdown).toContain("Second root");
    expect(scoped.markdown).not.toContain("散落笔记");
  });

  it("falls back to the whole canvas when selected branches are unknown", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, {
      title: "Canvas",
      now: NOW,
      rootTaskIds: ["missing"],
    });

    expect(report.scopeRootTaskIds).toBeUndefined();
    expect(report.tasks.map((task) => task.node.id)).toEqual(["root", "child", "second-root"]);
    expect(report.looseNotes.map((item) => item.id)).toContain("loose");
  });

  it("renders AI sections and appends tasks omitted by the model", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, {
      title: "Canvas",
      now: NOW,
      sections: [{ title: "Market", taskIds: ["root"] }],
    });

    expect(report.sections).toEqual([
      { title: "Market", taskIds: ["root"] },
      { title: "其他", taskIds: ["child", "second-root"] },
    ]);
    expect(report.markdown).toContain("## Market");
    expect(report.markdown).toContain("### 任务 1：Root question");
    expect(report.html).toContain('class="report-section"');
    expect(report.html).toContain("Market");
  });

  it("renders narrative, section summaries and key findings", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, {
      title: "Canvas",
      now: NOW,
      locale: "zh",
      sections: [{
        title: "Market",
        summary: "这一节说明市场规模。",
        keyFindings: ["需求在增长", "两家直接竞品"],
        taskIds: ["root", "child", "second-root"],
      }],
      narrative: {
        subtitle: "Q4 市场扫描",
        executiveSummary: "本报告覆盖市场、竞品与用户三个阶段。",
        conclusion: "画布最终收敛到中端市场切入点。",
      },
    });

    expect(report.subtitle).toBe("Q4 市场扫描");
    expect(report.executiveSummary).toBe("本报告覆盖市场、竞品与用户三个阶段。");
    expect(report.conclusion).toBe("画布最终收敛到中端市场切入点。");

    expect(report.markdown).toContain("*Q4 市场扫描*");
    expect(report.markdown).toContain("## 全文概述");
    expect(report.markdown).toContain("本报告覆盖市场、竞品与用户三个阶段。");
    expect(report.markdown).toContain("**本节导语**：这一节说明市场规模。");
    expect(report.markdown).toContain("**关键发现**");
    expect(report.markdown).toContain("- 需求在增长");
    expect(report.markdown).toContain("## 结论");
    expect(report.markdown).toContain("画布最终收敛到中端市场切入点。");

    expect(report.html).toContain("Q4 市场扫描");
    expect(report.html).toContain("全文概述");
    expect(report.html).toContain("本报告覆盖市场、竞品与用户三个阶段。");
    expect(report.html).toContain("这一节说明市场规模。");
    expect(report.html).toContain("关键发现");
    expect(report.html).toContain("需求在增长");
    expect(report.html).toContain("结论");
    expect(report.html).toContain("画布最终收敛到中端市场切入点。");
    expect(report.html).toContain("目录");
    expect(report.html).toContain("@page");
  });

  it("escapes narrative text and truncates over-long values", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, {
      title: "Canvas",
      now: NOW,
      sections: [{
        title: "Market",
        summary: "s".repeat(400),
        keyFindings: ["1".repeat(300), "2", "3", "4", "5"],
        taskIds: ["root"],
      }],
      narrative: {
        subtitle: "<b>sub</b>",
        executiveSummary: "e".repeat(900),
        conclusion: "c".repeat(500),
      },
    });

    expect(report.sections?.[0].summary).toHaveLength(200);
    expect(report.sections?.[0].keyFindings).toHaveLength(4);
    expect(report.sections?.[0].keyFindings?.[0]).toHaveLength(120);
    expect(report.executiveSummary).toHaveLength(400);
    expect(report.conclusion).toHaveLength(300);
    expect(report.html).toContain("&lt;b&gt;sub&lt;/b&gt;");
    expect(report.html).not.toContain("<b>sub</b>");
    expect(report.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("finds the task branch for selected tasks and leaves orphan notes unscoped", () => {
    const { nodes, edges } = fixture();

    expect(findBranchTaskId(nodes, edges, "root")).toBe("root");
    expect(findBranchTaskId(nodes, edges, "root-result")).toBe("root");
    expect(findBranchTaskId(nodes, edges, "evidence")).toBe("root");
    expect(findBranchTaskId(nodes, edges, "loose")).toBeUndefined();
    expect(findBranchTaskId(nodes, edges, undefined)).toBeUndefined();
  });

  it("falls back to the whole canvas when the scope task is unknown", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, {
      title: "Canvas",
      now: NOW,
      rootTaskId: "missing",
    });

    expect(report.scopeRootTaskId).toBeUndefined();
    expect(report.tasks.map((task) => task.node.id)).toEqual(["root", "child", "second-root"]);
    expect(report.looseNotes.map((item) => item.id)).toContain("loose");
  });

  it("renders mentions as HTML anchors and plain text in Markdown", () => {
    const token = "[Second root](gd://c/canvas/n/second-root)";
    const nodes: GoDeeperFlowNode[] = [
      node("root", "task", "Root question", `See ${token}`),
      node("second-root", "task", "Second root", "Second body"),
    ];
    const report = buildStructuredReport(nodes, [], { title: "Canvas", now: NOW });

    expect(report.html).toContain('id="node-second-root"');
    expect(report.html).toContain('href="#node-second-root"');
    expect(report.html).toContain("@Second root");
    expect(report.markdown).toContain("@Second root");
    expect(report.markdown).not.toContain("gd://");
  });
});
