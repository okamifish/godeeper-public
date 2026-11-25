import { describe, expect, it } from "vitest";
import type {
  ProOrganizedReport,
  ProReportGraphInput,
} from "@godeeper/pro-contract";
import { validateOrganizedReport, repairOrganizedReport } from "../../src/services/report-validation";

function graph(): ProReportGraphInput {
  return {
    scope: {
      mode: "canvas",
      rootNodeIds: ["root"],
      nodeIds: ["root", "child", "evidence", "result"],
      edgeIds: ["e-evidence", "e-result", "e-child"],
    },
    canvas: { name: "测试画布", locale: "zh", guideMode: false },
    nodes: [
      { id: "root", kind: "task", title: "根问题", body: "根正文" },
      { id: "child", kind: "task", title: "子问题", body: "子正文" },
      { id: "evidence", kind: "link", title: "证据", body: "证据正文" },
      { id: "result", kind: "result", title: "结果", body: "结果正文", catalog: { mode: "answers", items: [{ id: "item-1", title: "答案", body: "答案正文" }] } },
    ],
    edges: [
      { id: "e-evidence", source: "evidence", target: "root", relation: "evidence" },
      { id: "e-result", source: "root", target: "result", relation: "result" },
      { id: "e-child", source: "root", target: "child", relation: "branch" },
    ],
    groups: [],
    concepts: [],
  };
}

function report(): ProOrganizedReport {
  return {
    title: "报告",
    subtitle: "副标题",
    summary: "总结",
    mainThread: {
      thesis: "主线",
      narrative: "主线叙述",
      stageIds: ["s1"],
    },
    stages: [
      {
        id: "s1",
        title: "阶段一",
        question: "在回答什么",
        reasoning: "推理过程",
        outcome: "阶段结论",
        nodeIds: ["root", "child", "evidence", "result"],
      },
    ],
    milestones: [
      { title: "里程碑", description: "改变了什么", stageId: "s1", nodeIds: ["child"] },
    ],
    brightSpots: [
      { title: "闪光点", insight: "洞察", whyItMatters: "为什么重要", nodeIds: ["result"] },
    ],
    conclusion: "结论",
    openQuestions: [
      { question: "未决问题", nodeIds: ["result"] },
    ],
    relations: [],
  };
}

describe("validateOrganizedReport", () => {
  it("accepts a complete report", () => {
    expect(validateOrganizedReport(graph(), report())).toEqual({ ok: true });
  });

  it("rejects missing nodes", () => {
    const output = report();
    output.stages[0].nodeIds = ["root", "child", "result"];
    const result = validateOrganizedReport(graph(), output);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.rule === "coverage")).toBe(true);
      expect(result.issues.some((issue) => issue.ids?.includes("evidence"))).toBe(true);
    }
  });

  it("rejects duplicate and unknown nodes", () => {
    const output = report();
    output.stages[0].nodeIds = ["root", "root", "ghost", "child", "evidence", "result"];
    const result = validateOrganizedReport(graph(), output);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message.includes("同时出现"))).toBe(true);
      expect(result.issues.some((issue) => issue.message.includes("选区外节点"))).toBe(true);
    }
  });

  it("rejects a milestone anchored to another stage", () => {
    const output = report();
    output.milestones[0].stageId = "missing";
    const result = validateOrganizedReport(graph(), output);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.rule === "anchor")).toBe(true);
    }
  });

  it("rejects anchors outside the scope", () => {
    const output = report();
    output.brightSpots[0].nodeIds = ["ghost"];
    const result = validateOrganizedReport(graph(), output);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message.includes("选区外节点"))).toBe(true);
    }
  });

  it("rejects a result split from its task", () => {
    const output = report();
    output.stages = [
      {
        id: "s1",
        title: "任务阶段",
        question: "问题",
        reasoning: "推理",
        outcome: "结论",
        nodeIds: ["root", "child", "evidence"],
      },
      {
        id: "s2",
        title: "结果阶段",
        question: "问题",
        reasoning: "推理",
        outcome: "结论",
        nodeIds: ["result"],
      },
    ];
    output.mainThread.stageIds = ["s1", "s2"];
    output.milestones[0].stageId = "s1";
    const result = validateOrganizedReport(graph(), output);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.rule === "relation")).toBe(true);
    }
  });

  it("rejects a parent-child chain split across stages", () => {
    const output = report();
    output.stages = [
      {
        id: "s1",
        title: "父阶段",
        question: "问题",
        reasoning: "推理",
        outcome: "结论",
        nodeIds: ["root", "evidence", "result"],
      },
      {
        id: "s2",
        title: "子阶段",
        question: "问题",
        reasoning: "推理",
        outcome: "结论",
        nodeIds: ["child"],
      },
    ];
    output.mainThread.stageIds = ["s1", "s2"];
    output.milestones[0].stageId = "s2";
    output.milestones[0].nodeIds = ["child"];
    const result = validateOrganizedReport(graph(), output);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message.includes("父子任务"))).toBe(true);
    }
  });

  it("requires cross-stage edges to be registered", () => {
    const output = report();
    output.stages = [
      {
        id: "s1",
        title: "任务阶段",
        question: "问题",
        reasoning: "推理",
        outcome: "结论",
        nodeIds: ["root", "child", "result"],
      },
      {
        id: "s2",
        title: "证据阶段",
        question: "问题",
        reasoning: "推理",
        outcome: "结论",
        nodeIds: ["evidence"],
      },
    ];
    output.mainThread.stageIds = ["s1", "s2"];
    output.milestones[0].stageId = "s1";
    output.milestones[0].nodeIds = ["child"];

    const withoutRelation = validateOrganizedReport(graph(), output);
    expect(withoutRelation.ok).toBe(false);
    if (!withoutRelation.ok) {
      expect(withoutRelation.issues.some((issue) => issue.message.includes("跨阶段"))).toBe(true);
    }

    const withRelation = validateOrganizedReport(graph(), {
      ...output,
      relations: [{ edgeId: "e-evidence", note: "证据同时支撑任务阶段" }],
    });
    expect(withRelation).toEqual({ ok: true });
  });

  it("rejects unknown relation edges", () => {
    const output = report();
    output.relations = [{ edgeId: "ghost", note: "不存在" }];
    const result = validateOrganizedReport(graph(), output);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.rule === "edge")).toBe(true);
    }
  });
});

describe("repairOrganizedReport", () => {
  it("maps catalog item anchors back to the owning result card", () => {
    const output = report();
    output.stages[0].nodeIds = ["root", "child", "evidence", "item-1"];
    const { report: repaired } = repairOrganizedReport(graph(), output);

    expect(repaired.stages[0].nodeIds).toContain("result");
    expect(repaired.stages[0].nodeIds).not.toContain("item-1");
    expect(validateOrganizedReport(graph(), repaired)).toEqual({ ok: true });
  });

  it("deduplicates repeated nodes and drops the emptied stage", () => {
    const output = report();
    output.stages = [
      { id: "s1", title: "A", question: "q", reasoning: "r", outcome: "o", nodeIds: ["root", "child", "evidence", "result"] },
      { id: "s2", title: "B", question: "q", reasoning: "r", outcome: "o", nodeIds: ["child"] },
    ];
    output.mainThread.stageIds = ["s1", "s2"];
    output.milestones[0].stageId = "s1";

    const { report: repaired } = repairOrganizedReport(graph(), output);

    expect(repaired.stages.map((stage) => stage.id)).toEqual(["s1"]);
    expect(repaired.mainThread.stageIds).toEqual(["s1"]);
    expect(validateOrganizedReport(graph(), repaired)).toEqual({ ok: true });
  });

  it("moves a milestone to the stage of its anchors", () => {
    const output = report();
    output.stages = [
      { id: "s1", title: "A", question: "q", reasoning: "r", outcome: "o", nodeIds: ["root", "child", "result"] },
      { id: "s2", title: "B", question: "q", reasoning: "r", outcome: "o", nodeIds: ["evidence"] },
    ];
    output.mainThread.stageIds = ["s1", "s2"];
    output.milestones[0] = { title: "M", description: "D", stageId: "s2", nodeIds: ["root"] };
    output.relations = [{ edgeId: "e-evidence", note: "证据跨阶段" }];

    const { report: repaired } = repairOrganizedReport(graph(), output);

    expect(repaired.milestones[0].stageId).toBe("s1");
    expect(validateOrganizedReport(graph(), repaired)).toEqual({ ok: true });
  });

  it("allows a result in a later stage when the relation is registered", () => {
    const output = report();
    output.stages = [
      { id: "s1", title: "任务", question: "q", reasoning: "r", outcome: "o", nodeIds: ["root", "child", "evidence"] },
      { id: "s2", title: "收敛", question: "q", reasoning: "r", outcome: "o", nodeIds: ["result"] },
    ];
    output.mainThread.stageIds = ["s1", "s2"];

    const result = validateOrganizedReport(graph(), {
      ...output,
      relations: [{ edgeId: "e-result", note: "结果在收敛阶段" }],
    });
    expect(result).toEqual({ ok: true });
  });
});
