import { describe, expect, it } from "vitest";
import type { GoDeeperFlowEdge, GoDeeperFlowNode } from "@/lib/types";
import {
  collectScopeNodeIds,
  deriveEdgeRelation,
  estimateReportGraph,
  serializeReportGraph,
} from "@/lib/report-graph";

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

function edge(id: string, source: string, target: string, sourceHandle?: string): GoDeeperFlowEdge {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) };
}

function fixture() {
  const nodes: GoDeeperFlowNode[] = [
    node("root", "task", "Root", "Root body"),
    node("child", "task", "Child", "Child body"),
    node("sibling", "task", "Sibling", "Sibling body"),
    node("evidence", "link", "Evidence", "Evidence body", {
      url: "https://example.com",
      summary: "Evidence summary",
      keyPoints: [{ text: "Point", body: "Point body" }],
    }),
    node("result", "result", "Result", "Result body", {
      catalog: {
        mode: "answers",
        collapsed: false,
        items: [{ id: "i1", title: "答案一", body: "完整答案正文" }],
      },
    }),
    node("note", "note", "Note", "Note body", {
      notePages: [{
        id: "p1",
        imageDataUrl: "data:image/png;base64,AAAA",
        fileName: "note.png",
        width: 100,
        height: 100,
        ocrMarkdown: "OCR 全文",
        editedMarkdown: "用户修正全文",
        status: "done",
      }],
    }),
    node("loose", "text", "Loose", "Loose body"),
  ];
  const edges: GoDeeperFlowEdge[] = [
    edge("e1", "evidence", "root", "kp-0"),
    edge("e2", "root", "result"),
    edge("e3", "root", "child"),
    edge("e4", "loose", "root"),
  ];
  return { nodes, edges };
}

function graphFor(
  nodes: GoDeeperFlowNode[],
  edges: GoDeeperFlowEdge[],
  scope: Parameters<typeof collectScopeNodeIds>[2],
) {
  return serializeReportGraph({
    nodes,
    edges,
    scope,
    canvasName: "测试画布",
    locale: "zh",
    guideMode: false,
  });
}

describe("report graph scope", () => {
  it("keeps the whole canvas for canvas scope", () => {
    const { nodes, edges } = fixture();
    const scope = collectScopeNodeIds(nodes, edges, { mode: "canvas" });
    expect(scope.size).toBe(nodes.length);
  });

  it("keeps the selected root and descendants for branch scope", () => {
    const { nodes, edges } = fixture();
    const graph = graphFor(nodes, edges, { mode: "branch", rootNodeId: "root" });
    expect(graph.scope.nodeIds.sort()).toEqual(["child", "result", "root"]);
    expect(graph.scope.rootNodeIds).toEqual(["root"]);
  });

  it("keeps only selected nodes for selection scope", () => {
    const { nodes, edges } = fixture();
    const graph = graphFor(nodes, edges, { mode: "selection", nodeIds: ["root", "evidence", "sibling"] });
    expect(graph.scope.nodeIds.sort()).toEqual(["evidence", "root", "sibling"]);
    // 只保留两个端点都在选区内的边。
    expect(graph.edges.map((item) => item.id)).toEqual(["e1"]);
  });
});

describe("report graph serialization", () => {
  it("serializes all node kinds with full text and no image binary", () => {
    const { nodes, edges } = fixture();
    const graph = graphFor(nodes, edges, { mode: "canvas" });

    const result = graph.nodes.find((item) => item.id === "result");
    expect(result?.catalog?.items[0]).toMatchObject({
      title: "答案一",
      body: "完整答案正文",
    });

    const note = graph.nodes.find((item) => item.id === "note");
    expect(note?.notePages?.[0]).toEqual({
      ocrMarkdown: "OCR 全文",
      editedMarkdown: "用户修正全文",
    });
    expect(JSON.stringify(graph)).not.toContain("data:image/png");
    expect(JSON.stringify(graph)).not.toContain("thumbnailUrl");
  });

  it("derives edge relations from node kinds and handles", () => {
    const { nodes, edges } = fixture();
    const graph = graphFor(nodes, edges, { mode: "canvas" });
    const relation = new Map(graph.edges.map((item) => [item.id, item.relation]));

    expect(relation.get("e1")).toBe("evidence");
    expect(relation.get("e2")).toBe("result");
    expect(relation.get("e3")).toBe("branch");
    expect(relation.get("e4")).toBe("attachment");
  });

  it("exports relation directly for edge tests", () => {
    const { nodes } = fixture();
    const byId = new Map(nodes.map((item) => [item.id, item]));
    expect(deriveEdgeRelation(byId.get("evidence"), byId.get("root"), "kp-0")).toBe("evidence");
    expect(deriveEdgeRelation(byId.get("root"), byId.get("result"))).toBe("result");
    expect(deriveEdgeRelation(byId.get("root"), byId.get("child"))).toBe("branch");
  });

  it("filters groups and concepts to the selected scope", () => {
    const { nodes, edges } = fixture();
    const graph = serializeReportGraph({
      nodes,
      edges,
      groups: [
        { id: "g1", title: "整组", color: "#fff", nodeIds: ["root", "child", "sibling"] },
        { id: "g2", title: "区外", color: "#000", nodeIds: ["sibling"] },
      ],
      concepts: [
        { id: "c1", term: "概念", explanation: "解释", points: ["点"], sourceNodeId: "root" },
        { id: "c2", term: "区外概念", explanation: "解释", points: [], sourceNodeId: "sibling" },
      ],
      scope: { mode: "branch", rootNodeId: "root" },
      canvasName: "测试画布",
      locale: "zh",
    });

    expect(graph.groups).toHaveLength(1);
    expect(graph.groups[0]).toMatchObject({
      id: "g1",
      nodeIds: ["root", "child"],
      partial: true,
    });
    expect(graph.concepts.map((item) => item.id)).toEqual(["c1"]);
  });

  it("estimates node and edge counts", () => {
    const { nodes, edges } = fixture();
    const graph = graphFor(nodes, edges, { mode: "canvas" });
    const estimate = estimateReportGraph(graph);
    expect(estimate.nodeCount).toBe(nodes.length);
    expect(estimate.edgeCount).toBe(edges.length);
    expect(estimate.charCount).toBeGreaterThan(0);
    expect(estimate.byKind.task).toBe(3);
  });
});
