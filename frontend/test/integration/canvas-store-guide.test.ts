import { buildNode, useCanvasStore } from "@/lib/canvas-store";
import { runLLMTask } from "@/lib/llm";

vi.mock("@/lib/auth", () => ({
  isAuthenticated: () => true,
  getUser: () => ({ membership: "pro", capabilities: ["ai.guided"] }),
}));

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
  generateSocraticTurn: vi.fn(),
  generateSocraticSummary: vi.fn(),
}));

const runLLMTaskMock = vi.mocked(runLLMTask);

const planItems = [
  {
    id: "d1",
    title: "RAG 解决了什么问题？",
    body: "RAG 解决了什么问题？",
    why: "先理解它存在的理由。",
    role: "foundation" as const,
    recommended: true,
    source: "ai" as const,
  },
  {
    id: "d2",
    title: "它和微调有什么区别？",
    body: "它和微调有什么区别？",
    why: "两种改造模型的边界。",
    role: "compare" as const,
    source: "ai" as const,
  },
  {
    id: "d3",
    title: "什么情况下不该用？",
    body: "什么情况下不该用 RAG？",
    why: "判断适用边界。",
    role: "judgement" as const,
    source: "ai" as const,
  },
];

function anchorNode() {
  return buildNode({
    id: "anchor",
    kind: "task",
    title: "什么是 RAG？",
    body: "什么是 RAG？",
    x: 0,
    y: 0,
  });
}

function seed(guideMode: boolean, nodes = [anchorNode()]) {
  useCanvasStore.setState({
    nodes,
    edges: [],
    selectedNodeId: nodes[0].id,
    selectedNodeIds: [nodes[0].id],
    guideMode,
    language: "zh",
    runCount: 0,
    baseUrl: "http://localhost:3001",
    apiKey: "test-key",
    modelName: "deepseek-chat",
  });
}

describe("guided mode run branch", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001");
    runLLMTaskMock.mockReset();
    runLLMTaskMock.mockResolvedValue({ results: [] });
  });

  it("writes a directions catalog without creating result nodes or overwriting the question", async () => {
    seed(true);
    runLLMTaskMock.mockResolvedValueOnce({
      mode: "plan",
      summary: "RAG 是先检索再生成。",
      items: planItems,
      results: [],
    });

    useCanvasStore.getState().runTask("anchor");

    await vi.waitFor(() => {
      const node = useCanvasStore.getState().nodes.find((item) => item.id === "anchor");
      expect(node?.data.catalog?.mode).toBe("directions");
    });

    const state = useCanvasStore.getState();
    const node = state.nodes.find((item) => item.id === "anchor");
    expect(node?.data.body).toBe("什么是 RAG？");
    expect(node?.data.catalog?.summary).toBe("RAG 是先检索再生成。");
    expect(node?.data.catalog?.items).toHaveLength(3);
    expect(node?.data.catalog?.items[1].role).toBe("compare");
    expect(node?.data.catalog?.items[0].recommended).toBe(true);
    expect(node?.data.catalogStale).toBe(false);
    expect(node?.data.qualityStatus).toBeUndefined();
    expect(state.nodes.filter((item) => item.data.kind === "result")).toHaveLength(0);
    expect(runLLMTaskMock.mock.calls[0][8]).toEqual({ mode: true, child: false });
  });

  it("keeps the existing answer flow when the model returns an answer", async () => {
    seed(true);
    runLLMTaskMock.mockResolvedValueOnce({
      mode: "answer",
      results: [
        { title: "答案 A", body: "正文 A" },
        { title: "答案 B", body: "正文 B" },
      ],
    });

    useCanvasStore.getState().runTask("anchor");

    await vi.waitFor(() => {
      const catalog = useCanvasStore.getState().nodes.find((item) => item.data.catalog?.mode === "answers");
      expect(catalog).toBeDefined();
    });

    const node = useCanvasStore.getState().nodes.find((item) => item.id === "anchor");
    expect(node?.data.catalog).toBeUndefined();
    expect(runLLMTaskMock.mock.calls[0][8]).toEqual({ mode: true, child: false });
  });

  it("marks guide children and writes the backfill", async () => {
    const anchor = anchorNode();
    const child = buildNode({
      id: "child",
      kind: "task",
      title: "RAG 解决了什么问题？",
      body: "RAG 解决了什么问题？",
      x: 900,
      y: 0,
      author: "ai",
      sourceCatalogId: "anchor",
      sourceCatalogItemId: "d1",
    });
    seed(true, [anchor, child]);
    runLLMTaskMock.mockResolvedValueOnce({
      mode: "answer",
      results: [{ title: "答案", body: "正文" }],
      backfill: "补上了主问题的动机层。",
    });

    useCanvasStore.getState().runTask("child");

    await vi.waitFor(() => {
      const node = useCanvasStore.getState().nodes.find((item) => item.id === "child");
      expect(node?.data.catalogBackfill).toBe("补上了主问题的动机层。");
    });

    expect(runLLMTaskMock.mock.calls[0][8]).toEqual({ mode: false, child: true });
  });

  it("runs result extensions as normal tasks even when guide mode is on", async () => {
    const anchor = anchorNode();
    const child = buildNode({
      id: "result-child",
      kind: "task",
      title: "查封与抵押状态",
      body: "请基于下面这条要点，输出可执行步骤。",
      x: 900,
      y: 0,
      author: "ai",
      sourceCatalogId: "anchor",
      sourceCatalogKind: "result",
      sourceCatalogItemId: "d1",
    });
    seed(true, [anchor, child]);
    runLLMTaskMock.mockResolvedValueOnce({
      mode: "answer",
      results: [{ title: "答案", body: "正文" }],
    });

    useCanvasStore.getState().runTask("result-child");

    await vi.waitFor(() => {
      expect(runLLMTaskMock).toHaveBeenCalled();
    });
    expect(runLLMTaskMock.mock.calls[0][8]).toEqual({ mode: false, child: false });
  });

  it("does not request a plan when the mode is off", async () => {
    seed(false);
    runLLMTaskMock.mockResolvedValueOnce({ results: [{ title: "答案", body: "正文" }] });

    useCanvasStore.getState().runTask("anchor");

    await vi.waitFor(() => {
      expect(runLLMTaskMock).toHaveBeenCalledTimes(1);
    });
    expect(runLLMTaskMock.mock.calls[0][8]).toEqual({ mode: false, child: false });
  });

  it("does not re-plan a node that already has a catalog", async () => {
    const anchor = buildNode({
      id: "anchor",
      kind: "task",
      title: "什么是 RAG？",
      body: "什么是 RAG？",
      x: 0,
      y: 0,
      catalog: {
        mode: "directions",
        collapsed: false,
        summary: "短答",
        items: [{ id: "d1", title: "方向", body: "方向", source: "ai" }],
      },
    });
    seed(true, [anchor]);
    runLLMTaskMock.mockResolvedValueOnce({ results: [{ title: "答案", body: "正文" }] });

    useCanvasStore.getState().runTask("anchor");

    await vi.waitFor(() => {
      expect(runLLMTaskMock).toHaveBeenCalledTimes(1);
    });
    expect(runLLMTaskMock.mock.calls[0][8]).toEqual({ mode: false, child: false });
  });
});
