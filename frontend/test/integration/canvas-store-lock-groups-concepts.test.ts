import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildNode, useCanvasStore } from "@/lib/canvas-store";
import { generateConceptExplanation } from "@/lib/llm";
import { hasCapability } from "@/lib/capabilities";

vi.mock("zustand", async () => {
  return await vi.importActual<typeof import("zustand")>("zustand");
});

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: (changes: Array<{ id: string; type: string; position?: { x: number; y: number } }>, nodes: any[]) =>
    nodes.map((node) => {
      const positionChange = changes
        .filter((change) => change.id === node.id && change.type === "position" && change.position)
        .slice(-1)[0];
      return positionChange ? { ...node, position: positionChange.position } : node;
    }),
  applyEdgeChanges: (_changes: unknown, edges: unknown) => edges,
  addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
  MarkerType: { ArrowClosed: "arrowClosed" },
}));

vi.mock("@/lib/llm", () => ({
  runLLMTask: vi.fn().mockResolvedValue({ results: [] }),
  testConnection: vi.fn(),
  analyzeUrl: vi.fn(),
  generateInspiration: vi.fn(),
  generateCritique: vi.fn(),
  generateConceptExplanation: vi.fn(),
}));

// 概念卡已归 Pro；这组用例验证卡片行为，默认放行能力检查。
vi.mock("@/lib/capabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/capabilities")>();
  return { ...actual, hasCapability: vi.fn(() => true) };
});

vi.mock("sonner", () => {
  const toast = vi.fn();
  Object.assign(toast, { info: vi.fn(), error: vi.fn(), success: vi.fn() });
  return { toast };
});

const generateConceptMock = vi.mocked(generateConceptExplanation);
const capabilityMock = vi.mocked(hasCapability);

function resetStore() {
  useCanvasStore.setState({
    nodes: [
      buildNode({ id: "a", kind: "text", title: "A", body: "A", x: 0, y: 0 }),
      buildNode({ id: "b", kind: "text", title: "B", body: "B", x: 400, y: 0 }),
    ],
    edges: [],
    groups: [],
    concepts: [],
    conceptPendingIds: [],
    conceptErrors: {},
    conceptSourceNodeId: null,
    selectedNodeId: "a",
    selectedNodeIds: ["a", "b"],
    language: "zh",
    baseUrl: "http://localhost:3001",
    apiKey: "test-key",
    modelName: "deepseek-chat",
    defaultModel: "",
  });
}

beforeEach(() => {
  resetStore();
  generateConceptMock.mockReset();
  capabilityMock.mockReturnValue(true);
});

describe("node position lock", () => {
  it("ignores position changes for locked nodes and keeps them draggable=false", () => {
    useCanvasStore.getState().toggleNodeLock("a");

    const state = useCanvasStore.getState();
    expect(state.nodes.find((node) => node.id === "a")?.data.locked).toBe(true);
    expect(state.nodes.find((node) => node.id === "a")?.draggable).toBe(false);

    useCanvasStore.getState().onNodesChange([
      { id: "a", type: "position", position: { x: 120, y: 80 }, dragging: false },
    ]);
    expect(useCanvasStore.getState().nodes.find((node) => node.id === "a")?.position).toEqual({ x: 0, y: 0 });

    useCanvasStore.getState().onNodesChange([
      { id: "b", type: "position", position: { x: 500, y: 0 }, dragging: false },
    ]);
    expect(useCanvasStore.getState().nodes.find((node) => node.id === "b")?.position).toEqual({ x: 500, y: 0 });
  });

  it("never pushes a locked node when another card is dropped onto it", () => {
    useCanvasStore.getState().toggleNodeLock("a");
    useCanvasStore.setState({
      nodes: [
        buildNode({ id: "a", kind: "text", title: "A", body: "A", x: 0, y: 0, locked: true }),
        buildNode({ id: "b", kind: "text", title: "B", body: "B", x: 50, y: 0 }),
      ],
    });

    useCanvasStore.getState().onNodesChange([
      { id: "b", type: "position", position: { x: 50, y: 0 }, dragging: false },
    ]);

    const state = useCanvasStore.getState();
    const lockedNode = state.nodes.find((node) => node.id === "a")!;
    const draggedNode = state.nodes.find((node) => node.id === "b")!;
    expect(lockedNode.position).toEqual({ x: 0, y: 0 });
    // 锁定卡不动，被拖的卡被推到另一个位置（沿位移更小的轴）
    expect(draggedNode.position).not.toEqual({ x: 50, y: 0 });
  });
});

describe("soft groups", () => {
  it("creates, renames, recolors, and ungroups without moving nodes", () => {
    useCanvasStore.getState().createGroupFromSelection();
    const group = useCanvasStore.getState().groups[0];
    expect(group.nodeIds).toEqual(["a", "b"]);

    useCanvasStore.getState().renameGroup(group.id, "My group");
    useCanvasStore.getState().setGroupColor(group.id, "rose");
    expect(useCanvasStore.getState().groups[0]).toMatchObject({ title: "My group", color: "rose" });

    const nodesBefore = useCanvasStore.getState().nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }));
    useCanvasStore.getState().deleteGroup(group.id);
    const nodesAfter = useCanvasStore.getState().nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y }));
    expect(nodesAfter).toEqual(nodesBefore);
    expect(useCanvasStore.getState().groups).toHaveLength(0);
  });

  it("toggles a group off when the same selection is grouped again", () => {
    useCanvasStore.getState().toggleGroupSelection();
    expect(useCanvasStore.getState().groups).toHaveLength(1);
    useCanvasStore.getState().toggleGroupSelection();
    expect(useCanvasStore.getState().groups).toHaveLength(0);
  });

  it("prunes deleted nodes out of groups", () => {
    useCanvasStore.getState().createGroupFromSelection();
    useCanvasStore.setState({ selectedNodeIds: ["a"], selectedNodeId: "a" });
    useCanvasStore.getState().deleteSelectedNodes();

    const group = useCanvasStore.getState().groups[0];
    expect(group.nodeIds).toEqual(["b"]);
  });
});

describe("key concepts", () => {
  it("blocks concept creation without the Pro capability", async () => {
    capabilityMock.mockReturnValueOnce(false);

    await useCanvasStore.getState().createConceptFromSelection("Retention", "source");

    expect(useCanvasStore.getState().concepts).toHaveLength(0);
    expect(generateConceptMock).not.toHaveBeenCalled();
  });

  it("creates a concept and fills the explanation from the current context", async () => {
    generateConceptMock.mockResolvedValue({
      explanation: "留存在这里指通知带来的回访比例。",
      points: ["需要对照组", "避免把相关当因果"],
    });

    useCanvasStore.setState({
      nodes: [
        buildNode({ id: "source", kind: "task", title: "Notifications drive retention", body: "Notifications increase retention.", x: 0, y: 0 }),
        buildNode({ id: "parent", kind: "text", title: "Parent", body: "Parent context", x: 0, y: 120 }),
      ],
      edges: [{ id: "e-parent", source: "parent", target: "source" }],
    });

    await useCanvasStore.getState().createConceptFromSelection("Retention", "source");

    expect(generateConceptMock).toHaveBeenCalledTimes(1);
    const [, input] = generateConceptMock.mock.calls[0];
    expect(input.term).toBe("Retention");
    expect(input.locale).toBe("zh");
    expect(input.context.join("\n")).toContain("Parent context");

    const concept = useCanvasStore.getState().concepts[0];
    expect(concept.sourceNodeId).toBe("source");
    expect(concept.explanation).toBe("留存在这里指通知带来的回访比例。");
    expect(concept.points).toHaveLength(2);
    expect(useCanvasStore.getState().conceptPendingIds).toEqual([]);
  });

  it("dedupes the same term and keeps the existing card", async () => {
    generateConceptMock.mockResolvedValue({ explanation: "E", points: [] });
    await useCanvasStore.getState().createConceptFromSelection("Retention", "source");
    await useCanvasStore.getState().createConceptFromSelection(" retention. ", "source");

    expect(useCanvasStore.getState().concepts).toHaveLength(1);
    expect(useCanvasStore.getState().conceptErrors).toEqual({});
  });

  it("keeps the card and records an error when generation fails, then retries", async () => {
    generateConceptMock.mockRejectedValueOnce(new Error("boom"));
    await useCanvasStore.getState().createConceptFromSelection("Retention", "source");

    const concept = useCanvasStore.getState().concepts[0];
    expect(concept.explanation).toBe("");
    expect(useCanvasStore.getState().conceptErrors[concept.id]).toBe("boom");

    generateConceptMock.mockResolvedValueOnce({ explanation: "Retried", points: [] });
    await useCanvasStore.getState().retryConcept(concept.id);
    expect(useCanvasStore.getState().concepts[0].explanation).toBe("Retried");
    expect(useCanvasStore.getState().conceptErrors[concept.id]).toBeUndefined();
  });
});
