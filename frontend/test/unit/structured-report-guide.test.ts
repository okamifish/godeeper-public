import type { GoDeeperFlowEdge, GoDeeperFlowNode } from "@/lib/types";
import { buildStructuredReport } from "@/lib/structured-report";

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

const NOW = new Date("2026-11-15T12:00:00.000Z");

function fixture() {
  const nodes: GoDeeperFlowNode[] = [
    node("anchor", "task", "什么是 RAG？", "什么是 RAG？", {
      author: "user",
      catalog: {
        mode: "directions",
        collapsed: false,
        summary: "RAG 是先检索再生成。",
        items: [
          { id: "d1", title: "RAG 解决了什么问题？", body: "RAG 解决了什么问题？", why: "先理解动机。", role: "foundation", recommended: true, source: "ai" },
          { id: "d2", title: "它和微调有什么区别？", body: "它和微调有什么区别？", why: "辨析边界。", role: "compare", source: "ai" },
          { id: "d3", title: "什么情况下不该用？", body: "什么情况下不该用 RAG？", role: "judgement", source: "ai" },
        ],
      },
    }),
    node("child-d1", "task", "RAG 解决了什么问题？", "RAG 解决了什么问题？", {
      author: "ai",
      taskStatus: "complete",
      sourceCatalogId: "anchor",
      sourceCatalogItemId: "d1",
      catalogBackfill: "补上了「为什么需要它」这一层。",
    }),
  ];
  const edges = [edge("e-anchor-d1", "anchor", "child-d1")];
  return { nodes, edges };
}

describe("structured report guide path", () => {
  it("includes the short answer, every direction and the backfill in markdown", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, { title: "Guide", now: NOW, locale: "zh" });

    expect(report.markdown).toContain("RAG 是先检索再生成。");
    expect(report.markdown).toContain("探索路径");
    expect(report.markdown).toContain("RAG 解决了什么问题？");
    expect(report.markdown).toContain("它和微调有什么区别？");
    expect(report.markdown).toContain("什么情况下不该用？");
    expect(report.markdown).toContain("已完成");
    expect(report.markdown).toContain("未探索");
    expect(report.markdown).toContain("补上了「为什么需要它」这一层。");
  });

  it("renders the same information in html without dropping unexplored directions", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, { title: "Guide", now: NOW, locale: "zh" });

    expect(report.html).toContain("guide-state");
    expect(report.html).toContain("RAG 是先检索再生成。");
    expect(report.html).toContain("它和微调有什么区别？");
    expect(report.html).toContain("补上了「为什么需要它」这一层。");
    expect(report.html).toContain("未探索");
  });

  it("keeps the guide path in summary detail mode", () => {
    const { nodes, edges } = fixture();
    const report = buildStructuredReport(nodes, edges, {
      title: "Guide",
      now: NOW,
      locale: "zh",
      detail: "summary",
    });

    expect(report.markdown).toContain("探索路径");
    expect(report.markdown).toContain("什么情况下不该用？");
  });
});
