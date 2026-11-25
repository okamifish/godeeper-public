import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildNode, useCanvasStore } from "@/lib/canvas-store";

vi.mock("zustand", async () => {
  return await vi.importActual<typeof import("zustand")>("zustand");
});

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  applyEdgeChanges: (_changes: unknown, edges: unknown) => edges,
  addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
  MarkerType: { ArrowClosed: "arrowClosed" },
}));

function resetStore() {
  useCanvasStore.setState({
    nodes: [buildNode({ id: "source", kind: "task", title: "Source claim", body: "Source body", x: 0, y: 0 })],
    edges: [],
    selectedNodeId: "source",
    selectedNodeIds: ["source"],
    language: "zh",
    modelName: "",
    defaultModel: "",
  });
}

describe("canvas store connected node and inspire actions", () => {
  beforeEach(resetStore);

  it("creates a connected node in one action", () => {
    const id = useCanvasStore.getState().addConnectedNode({
      fromNodeId: "source",
      fromHandleId: null,
      fromHandleType: "source",
      x: 400,
      y: 300,
      kind: "task",
    });

    const state = useCanvasStore.getState();
    const newNode = state.nodes.find((node) => node.id === id);
    const edge = state.edges.find((item) => item.target === id);

    expect(newNode?.data.kind).toBe("task");
    expect(edge?.source).toBe("source");
    expect(state.selectedNodeId).toBe(id);
  });

  it("supports dropping from a target handle", () => {
    const id = useCanvasStore.getState().addConnectedNode({
      fromNodeId: "source",
      fromHandleId: null,
      fromHandleType: "target",
      x: -300,
      y: 0,
      kind: "text",
    });

    const edge = useCanvasStore.getState().edges.find((item) => item.source === id);
    expect(edge?.target).toBe("source");
  });

  it("creates a pink challenge task next to the selected node", () => {
    useCanvasStore.getState().createInspireActionCard("challenge");

    const state = useCanvasStore.getState();
    const node = state.nodes.find((item) => item.data.inspireAction === "challenge");

    expect(node?.data.kind).toBe("task");
    expect(node?.data.author).toBe("ai");
    expect(node?.data.taskType).toBe("critique");
    expect(node?.data.title).toContain("漏洞");
    expect(state.edges.some((edge) => edge.source === "source" && edge.target === node?.id)).toBe(true);
  });

  it("creates a pink rebuttal task next to the selected node", () => {
    useCanvasStore.getState().createInspireActionCard("rebut");

    const state = useCanvasStore.getState();
    const node = state.nodes.find((item) => item.data.inspireAction === "rebut");

    expect(node?.data.author).toBe("ai");
    expect(node?.data.taskType).toBe("critique");
    expect(node?.data.title).toContain("反驳");
    expect(state.edges.some((edge) => edge.source === "source" && edge.target === node?.id)).toBe(true);
  });
});
