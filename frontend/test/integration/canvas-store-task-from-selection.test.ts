import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildNode, useCanvasStore, toCanvasNodeSeed } from "@/lib/canvas-store";
import { runLLMTask } from "@/lib/llm";

// 任务运行现在要求已登录并有后端地址；这些用例只验证上下文与排版，不测鉴权。
vi.mock("@/lib/auth", () => ({
  isAuthenticated: () => true,
  getUser: () => ({ membership: "pro", capabilities: ["ai.guided"] }),
}));

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

const runLLMTaskMock = vi.mocked(runLLMTask);

function resetStore() {
  useCanvasStore.setState({
    nodes: [
      buildNode({ id: "ctx-a", kind: "task", title: "Question A", body: "A", x: 0, y: 0 }),
      buildNode({ id: "ctx-b", kind: "text", title: "Note B", body: "B", x: 0, y: 60 }),
    ],
    edges: [],
    selectedNodeId: "ctx-a",
    selectedNodeIds: ["ctx-a", "ctx-b"],
    language: "zh",
    defaultModel: "",
    modelName: "",
  });
}

describe("createTaskFromSelection context", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001");
    resetStore();
  });

  it("stores the selected node ids as explicit context overrides", () => {
    useCanvasStore.getState().createTaskFromSelection();

    const state = useCanvasStore.getState();
    const taskNode = state.nodes.find((node) => node.id.startsWith("n-task-"));
    expect(taskNode).toBeDefined();
    expect(taskNode?.data.contextSelectionIds).toEqual(["ctx-a", "ctx-b"]);

    // 选中建任务仍生成入边，resolver 可沿入边追溯
    const taskEdgeTargets = state.edges.map((edge) => edge.target);
    expect(taskEdgeTargets).toContain(taskNode?.id);
  });

  it("feeds resolver context instead of legacy chips into runTask", () => {
    const parent = buildNode({
      id: "parent",
      kind: "task",
      title: "Parent question",
      body: "Parent body",
      x: 0,
      y: 0,
    });
    const pinned = buildNode({
      id: "pinned",
      kind: "text",
      title: "Pinned card",
      body: "Pinned body",
      x: 0,
      y: 200,
    });
    const current = buildNode({
      id: "current",
      kind: "task",
      title: "Current question",
      body: "Current body",
      x: 0,
      y: 100,
      taskType: "question",
      chips: ["legacy chip"],
      contextPinnedIds: ["pinned"],
    });

    useCanvasStore.setState({
      nodes: [parent, pinned, current],
      edges: [{ id: "e-parent-current", source: "parent", target: "current" }],
      selectedNodeId: "current",
      selectedNodeIds: ["current"],
      baseUrl: "http://localhost:3001",
      apiKey: "test-key",
      modelName: "deepseek-chat",
    });

    useCanvasStore.getState().runTask("current");

    expect(runLLMTaskMock).toHaveBeenCalledTimes(1);
    const context = runLLMTaskMock.mock.calls[0][4] as string[];
    expect(context.join("\n")).toContain("Parent body");
    expect(context.join("\n")).toContain("Pinned body");
    expect(context).not.toContain("legacy chip");
  });

  it("writes the AI-generated title only when the task has no title", async () => {
    const untitled = buildNode({
      id: "untitled",
      kind: "task",
      title: "",
      body: "列出 AI 基础概念",
      x: 0,
      y: 0,
    });

    useCanvasStore.setState({
      nodes: [untitled],
      edges: [],
      selectedNodeId: "untitled",
      selectedNodeIds: ["untitled"],
      baseUrl: "http://localhost:3001",
      apiKey: "test-key",
      modelName: "deepseek-chat",
    });
    runLLMTaskMock.mockResolvedValueOnce({
      title: "AI 基础概念清单",
      results: [{ title: "概念", body: "向量、嵌入" }],
    });

    useCanvasStore.getState().runTask("untitled");

    await vi.waitFor(() => {
      const node = useCanvasStore.getState().nodes.find((item) => item.id === "untitled");
      expect(node?.data.title).toBe("AI 基础概念清单");
    });
  });

  it("collects many results into one catalog card", async () => {
    const task = buildNode({
      id: "multi-result-task",
      kind: "task",
      title: "列出概念",
      body: "列出概念",
      x: 0,
      y: 0,
    });
    useCanvasStore.setState({
      nodes: [task],
      edges: [],
      selectedNodeId: task.id,
      selectedNodeIds: [task.id],
      baseUrl: "http://localhost:3001",
      apiKey: "test-key",
      modelName: "deepseek-chat",
    });
    runLLMTaskMock.mockResolvedValueOnce({
      results: Array.from({ length: 6 }, (_, index) => ({ title: `概念 ${index}`, body: "说明" })),
    });

    useCanvasStore.getState().runTask(task.id);

    await vi.waitFor(() => {
      const catalog = useCanvasStore.getState().nodes.find((node) => node.data.catalog?.items.length);
      expect(catalog?.data.catalog?.items).toHaveLength(6);
    });
    const resultNodes = useCanvasStore.getState().nodes.filter((node) => node.data.kind === "result");
    expect(resultNodes).toHaveLength(1);
    expect(resultNodes[0].data.body).toContain("概念 0");
    expect(resultNodes[0].data.body).toContain("概念 5");
  });

  it("removes connected edges and marks downstream nodes as missing input", () => {
    const a = buildNode({ id: "a", kind: "task", title: "A", body: "A", x: 0, y: 0 });
    const b = buildNode({ id: "b", kind: "text", title: "B", body: "B", x: 200, y: 0 });
    const c = buildNode({ id: "c", kind: "result", title: "C", body: "C", x: 400, y: 0 });
    useCanvasStore.setState({
      nodes: [a, b, c],
      edges: [
        { id: "a-b", source: "a", target: "b" },
        { id: "b-c", source: "b", target: "c" },
      ],
      selectedNodeId: "b",
      selectedNodeIds: ["b"],
      brokenInputNodeIds: [],
    });

    useCanvasStore.getState().deleteSelectedNodes();
    const state = useCanvasStore.getState();

    expect(state.nodes.map((node) => node.id)).toEqual(["a", "c"]);
    expect(state.edges).toHaveLength(0);
    expect(state.brokenInputNodeIds).toContain("c");
    expect(state.brokenInputNodeIds).not.toContain("a");
  });

  it("clears the missing-input mark after reconnecting the target", () => {
    useCanvasStore.setState({
      nodes: [
        buildNode({ id: "a", kind: "task", title: "A", body: "A", x: 0, y: 0 }),
        buildNode({ id: "c", kind: "result", title: "C", body: "C", x: 400, y: 0 }),
      ],
      edges: [],
      brokenInputNodeIds: ["c"],
    });

    useCanvasStore.getState().onConnect({ source: "a", target: "c", sourceHandle: null, targetHandle: null });
    const state = useCanvasStore.getState();

    expect(state.edges).toHaveLength(1);
    expect(state.brokenInputNodeIds).toEqual([]);
  });

  it("focuses the parent when returning to the branch point", () => {
    useCanvasStore.setState({
      nodes: [
        buildNode({ id: "parent", kind: "task", title: "Parent", body: "P", x: 0, y: 0 }),
        buildNode({ id: "child", kind: "task", title: "Child", body: "C", x: 400, y: 0 }),
      ],
      edges: [{ id: "parent-child", source: "parent", target: "child" }],
      selectedNodeId: "child",
      selectedNodeIds: ["child"],
    });

    useCanvasStore.getState().returnToBranchPoint();
    const state = useCanvasStore.getState();

    expect(state.selectedNodeId).toBe("parent");
    expect(state.selectedNodeIds).toEqual(["parent"]);
    expect(state.focusNodeId).toBe("parent");
  });

  it("clears the previous account canvas on auth change", () => {
    useCanvasStore.setState({
      nodes: [buildNode({ id: "private-node", kind: "text", title: "Private", body: "", x: 0, y: 0 })],
      edges: [],
      activeCanvasId: "11111111-1111-1111-1111-111111111111",
      canvases: {},
      canvasHistory: ["canvas-1"],
      userName: "Previous",
      userEmail: "previous@example.com",
    });

    useCanvasStore.getState().resetForAuthChange();
    const state = useCanvasStore.getState();

    expect(state.activeCanvasId).toBe("canvas-1");
    expect(state.nodes.some((node) => node.id === "private-node")).toBe(false);
    expect(state.canvasHistory).toEqual([]);
    expect(state.userName).toBe("");
    expect(state.userEmail).toBe("");
  });

  it("restores the deleted edges when undoing a node deletion", () => {
    useCanvasStore.setState({
      nodes: [
        buildNode({ id: "u-a", kind: "task", title: "A", body: "A", x: 0, y: 0 }),
        buildNode({ id: "u-b", kind: "text", title: "B", body: "B", x: 200, y: 0 }),
        buildNode({ id: "u-c", kind: "result", title: "C", body: "C", x: 400, y: 0 }),
      ],
      edges: [
        { id: "u-a-b", source: "u-a", target: "u-b" },
        { id: "u-b-c", source: "u-b", target: "u-c" },
      ],
      selectedNodeId: "u-b",
      selectedNodeIds: ["u-b"],
      brokenInputNodeIds: [],
    });

    // 用 pushHistory 记录“删除前”的状态，模拟删除动作本身
    useCanvasStore.getState().pushHistory();
    useCanvasStore.setState((state) => ({
      nodes: state.nodes.filter((node) => node.id !== "u-b"),
      edges: state.edges.filter((edge) => edge.source !== "u-b" && edge.target !== "u-b"),
      canUndo: true,
    }));

    expect(useCanvasStore.getState().edges).toHaveLength(0);

    useCanvasStore.getState().undo();
    const state = useCanvasStore.getState();

    expect(state.nodes.map((node) => node.id).sort()).toEqual(["u-a", "u-b", "u-c"]);
    expect(state.edges.map((edge) => edge.id).sort()).toEqual(["u-a-b", "u-b-c"]);
  });

  it("creates a task node for continue-question and a text node by default", () => {
    useCanvasStore.setState({
      nodes: [buildNode({ id: "root-task", kind: "task", title: "Root", body: "R", x: 0, y: 0 })],
      edges: [],
      selectedNodeId: "root-task",
      selectedNodeIds: ["root-task"],
    });

    const taskChildId = useCanvasStore.getState().addChildNode("root-task", "task");
    const textChildId = useCanvasStore.getState().addChildNode("root-task");

    const state = useCanvasStore.getState();
    const taskChild = state.nodes.find((node) => node.id === taskChildId);
    const textChild = state.nodes.find((node) => node.id === textChildId);

    expect(taskChild?.data.kind).toBe("task");
    expect(taskChild?.data.title).toBe("");
    expect(textChild?.data.kind).toBe("text");
    expect(state.edges).toHaveLength(2);
  });

  it("creates an image node that survives canvas export", () => {
    useCanvasStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedNodeIds: [],
    });

    const imageUrl = "data:image/png;base64,AAAA";
    const id = useCanvasStore.getState().addImageNodeAt(
      { imageUrl, title: "photo.png", naturalWidth: 800, naturalHeight: 600 },
      500,
      400,
    );

    const state = useCanvasStore.getState();
    const node = state.nodes.find((item) => item.id === id);
    expect(node?.data.kind).toBe("image");
    expect(node?.data.thumbnailUrl).toBe(imageUrl);
    expect(state.selectedNodeIds).toEqual([id]);

    const seed = toCanvasNodeSeed(node!);
    expect(seed.kind).toBe("image");
    expect(seed.thumbnailUrl).toBe(imageUrl);
  });

  it("syncs React Flow select changes into the canvas selection", () => {
    useCanvasStore.setState({
      nodes: [
        buildNode({ id: "sel-a", kind: "task", title: "A", body: "A", x: 0, y: 0 }),
        buildNode({ id: "sel-b", kind: "text", title: "B", body: "B", x: 0, y: 60 }),
      ],
      edges: [],
      selectedNodeId: null,
      selectedNodeIds: [],
    });

    useCanvasStore.getState().onNodesChange([
      { id: "sel-a", type: "select", selected: true },
      { id: "sel-b", type: "select", selected: true },
    ]);
    expect(useCanvasStore.getState().selectedNodeIds).toEqual(["sel-a", "sel-b"]);

    useCanvasStore.getState().onNodesChange([
      { id: "sel-a", type: "select", selected: false },
    ]);
    expect(useCanvasStore.getState().selectedNodeIds).toEqual(["sel-b"]);
    expect(useCanvasStore.getState().selectedNodeId).toBe("sel-b");
  });
});
