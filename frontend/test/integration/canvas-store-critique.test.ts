import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildNode, useCanvasStore } from "@/lib/canvas-store";
import { generateCritique } from "@/lib/llm";

// 该文件需要真实 zustand，才能直接调用 store action；全局 setup 里的简易 mock
// 只适用于组件渲染测试。
vi.mock("zustand", async () => {
  return await vi.importActual<typeof import("zustand")>("zustand");
});

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
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

const generateCritiqueMock = vi.mocked(generateCritique);

function resetStore() {
  useCanvasStore.setState({
    nodes: [
      buildNode({
        id: "claim",
        kind: "task",
        title: "Notifications drive retention",
        body: "Enable notifications and users stay.",
        x: 0,
        y: 0,
        taskType: "derive",
      }),
      buildNode({
        id: "evidence",
        kind: "link",
        title: "Retention report",
        body: "Report body",
        summary: "Notification users retain 2x better.",
        x: 0,
        y: 120,
      }),
      buildNode({
        id: "answer",
        kind: "result",
        title: "Supporting answer",
        body: "Notifications matter.",
        x: 0,
        y: 240,
      }),
    ],
    edges: [
      { id: "e-evidence", source: "evidence", target: "claim" },
      { id: "e-answer", source: "answer", target: "claim" },
    ],
    selectedNodeId: "claim",
    selectedNodeIds: ["claim"],
    panelCollapsed: false,
    language: "zh",
    baseUrl: "http://localhost:3001",
    apiKey: "test-key",
    modelName: "deepseek-chat",
    defaultModel: "",
    critiquePreview: null,
    critiqueLoading: false,
    critiqueError: null,
  });
}

beforeEach(() => {
  resetStore();
  generateCritiqueMock.mockReset();
});

describe("adversarial critique store flow", () => {
  it("previews findings without writing nodes or edges", async () => {
    generateCritiqueMock.mockResolvedValue({
      findings: [
        { kind: "flaw", title: "Correlation assumed", body: "Retention may cause notifications, not the reverse." },
        { kind: "missing_evidence", title: "No base rate", body: "No data on users who never enable them." },
      ],
    });

    await useCanvasStore.getState().requestCritique("claim");

    expect(generateCritiqueMock).toHaveBeenCalledTimes(1);
    const [, input] = generateCritiqueMock.mock.calls[0];
    expect(input.claim.title).toBe("Notifications drive retention");
    expect(input.evidence).toEqual([
      { title: "Retention report", text: "Notification users retain 2x better." },
    ]);
    expect(input.locale).toBe("zh");

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(3);
    expect(state.edges).toHaveLength(2);
    expect(state.critiquePreview?.taskId).toBe("claim");
    expect(state.critiquePreview?.findings).toHaveLength(2);
    expect(state.critiqueLoading).toBe(false);
  });

  it("accepts one finding into a critique task node and keeps the rest pending", async () => {
    generateCritiqueMock.mockResolvedValue({
      findings: [
        { kind: "flaw", title: "Correlation assumed", body: "Retention may cause notifications." },
        { kind: "missing_evidence", title: "No base rate", body: "No data on non-enablers." },
      ],
    });
    await useCanvasStore.getState().requestCritique("claim");

    useCanvasStore.getState().acceptCritiqueFinding(0);

    const state = useCanvasStore.getState();
    const critiqueNode = state.nodes.find((node) => node.data.taskType === "critique");
    expect(critiqueNode).toBeDefined();
    expect(critiqueNode?.data.title).toBe("Correlation assumed");
    expect(critiqueNode?.data.author).toBe("ai");
    expect(critiqueNode?.data.adopted).toBe(true);

    const edge = state.edges.find((item) => item.target === critiqueNode?.id);
    expect(edge?.source).toBe("claim");

    expect(state.critiquePreview?.findings).toHaveLength(1);
    expect(state.critiquePreview?.findings[0].title).toBe("No base rate");
    expect(state.selectedNodeId).toBe(critiqueNode?.id);
  });

  it("closes the preview after the last finding is accepted or dismissed", async () => {
    generateCritiqueMock.mockResolvedValue({
      findings: [{ kind: "flaw", title: "Only finding", body: "body" }],
    });
    await useCanvasStore.getState().requestCritique("claim");

    useCanvasStore.getState().acceptCritiqueFinding(0);
    expect(useCanvasStore.getState().critiquePreview).toBeNull();

    await useCanvasStore.getState().requestCritique("claim");
    useCanvasStore.getState().dismissCritique();
    expect(useCanvasStore.getState().critiquePreview).toBeNull();
    expect(useCanvasStore.getState().nodes).toHaveLength(4);
  });
});
