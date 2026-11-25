import { describe, expect, it } from "vitest";
import type { GoDeeperFlowEdge, GoDeeperFlowNode } from "@/lib/types";
import type { OrganizedReport } from "@/lib/report-graph";
import { renderAiReportHtml, renderAiReportMarkdown } from "@/lib/ai-report";

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

const nodes: GoDeeperFlowNode[] = [
  node("root", "task", "首付怎么算", "首付正文"),
  node("child", "task", "税费怎么算", "税费正文"),
  node("result", "result", "税费结果", "结果正文", {
    catalog: { mode: "answers", collapsed: false, items: [{ id: "i1", title: "契税", body: "契税答案" }] },
  }),
  node("evidence", "link", "政策来源", "<script>alert(1)</script>", {
    url: "https://example.com",
    keyPoints: [{ text: "满五唯一", body: "满五唯一要点" }],
  }),
  node("note", "note", "看房笔记", "", {
    notePages: [{
      id: "p1",
      imageDataUrl: "data:image/png;base64,AAAA",
      width: 10,
      height: 10,
      ocrMarkdown: "OCR 笔记",
      status: "done",
    }],
  }),
];

const edges: GoDeeperFlowEdge[] = [
  { id: "e1", source: "evidence", target: "root" },
  { id: "e2", source: "root", target: "child" },
  { id: "e3", source: "child", target: "result" },
];

const plan: OrganizedReport = {
  title: "深圳二手房报告",
  subtitle: "首付与税费",
  summary: "这次探索从首付走到税费，最后形成一份可执行的清单。",
  mainThread: {
    thesis: "先算首付，再算税费，最后看总成本。",
    narrative: "因为首付决定预算上限，所以下一步才是税费。",
    stageIds: ["s1", "s2"],
  },
  stages: [
    {
      id: "s1",
      title: "首付与预算",
      question: "首付要准备多少",
      reasoning: "先确定首付比例，再反推可承受总价。",
      outcome: "首付上限明确。",
      nodeIds: ["root", "evidence"],
    },
    {
      id: "s2",
      title: "税费与总成本",
      question: "税费怎么算",
      reasoning: "税费会改变总成本，因此要单独核算。",
      outcome: "得到税费清单。",
      nodeIds: ["child", "result", "note"],
    },
  ],
  milestones: [
    { title: "预算上限确定", description: "首付反推总价", stageId: "s1", nodeIds: ["root"] },
    { title: "税费清单形成", description: "总成本可比较", stageId: "s2", nodeIds: ["result"] },
  ],
  brightSpots: [
    { title: "满五唯一的杠杆", insight: "税费差异会改变选房范围", whyItMatters: "它可能比首付更影响总成本", nodeIds: ["evidence"] },
  ],
  conclusion: "先锁定首付，再用税费修正总成本。",
  openQuestions: [
    { question: "贷款年限如何影响月供", nodeIds: ["root"] },
  ],
  relations: [
    { edgeId: "e1", note: "政策来源同时支撑首付阶段" },
  ],
};

describe("AI report renderer", () => {
  it("renders the research-note structure", () => {
    const html = renderAiReportHtml({ plan, nodes, edges, generatedAt: new Date("2026-11-25T00:00:00Z") });
    expect(html).toContain("GoDeeper 研究纪要");
    expect(html).toContain("深圳二手房报告");
    expect(html).toContain("逻辑主线");
    expect(html).toContain("首付与预算");
    expect(html).toContain("税费与总成本");
    expect(html).toContain("阶段性里程碑");
    expect(html).toContain("闪光点");
    expect(html).toContain("附录：原文索引");
    expect(html).toContain("契税答案");
    expect(html).toContain("OCR 笔记");
  });

  it("escapes source text and never embeds image binaries", () => {
    const html = renderAiReportHtml({ plan, nodes, edges });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("data:image/png");
  });

  it("renders a markdown mirror", () => {
    const markdown = renderAiReportMarkdown({ plan, nodes, edges });
    expect(markdown).toContain("# 深圳二手房报告");
    expect(markdown).toContain("## 逻辑主线");
    expect(markdown).toContain("## 1. 首付与预算");
    expect(markdown).toContain("## 阶段性里程碑");
    expect(markdown).toContain("## 闪光点");
    expect(markdown).toContain("## 附录：原文索引");
  });
});
