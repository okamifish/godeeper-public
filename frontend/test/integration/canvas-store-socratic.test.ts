import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildNode, useCanvasStore } from "@/lib/canvas-store";
import { generateSocraticSummary, generateSocraticTurn } from "@/lib/llm";

vi.mock("zustand", async () => {
  return await vi.importActual<typeof import("zustand")>("zustand");
});

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  applyEdgeChanges: (_changes: unknown, edges: unknown) => edges,
  addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
  MarkerType: { ArrowClosed: "arrowClosed" },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    generateSocraticTurn: vi.fn(),
    generateSocraticSummary: vi.fn(),
  };
});

const turnMock = vi.mocked(generateSocraticTurn);
const summaryMock = vi.mocked(generateSocraticSummary);

function resetStore() {
  window.localStorage.clear();
  useCanvasStore.setState({
    nodes: [buildNode({ id: "source", kind: "task", title: "更快就是更好", body: "我认为更快就是更好。", x: 0, y: 0 })],
    edges: [],
    selectedNodeId: "source",
    selectedNodeIds: ["source"],
    language: "zh",
    modelName: "test-model",
    defaultModel: "",
    baseUrl: "http://localhost",
    apiKey: "test-key",
    socraticActive: false,
    socraticSourceNodeId: null,
    socraticSession: null,
    socraticNodes: [],
    socraticCurrentQuestion: "",
    socraticCurrentDimension: null,
    socraticLoading: false,
    socraticError: null,
  });
}

describe("canvas store socratic session", () => {
  beforeEach(() => {
    resetStore();
    turnMock.mockReset();
    summaryMock.mockReset();
  });

  it("starts a session and shows the first question", async () => {
    turnMock.mockResolvedValue({
      question: "你说的“更好”具体指什么？",
      dimension: "definition",
      card: null,
      done: false,
    });

    await useCanvasStore.getState().startSocratic("source");

    const state = useCanvasStore.getState();
    expect(state.socraticActive).toBe(true);
    expect(state.socraticCurrentQuestion).toBe("你说的“更好”具体指什么？");
    expect(state.socraticCurrentDimension).toBe("definition");
    expect(state.socraticSession?.rounds).toHaveLength(0);
    expect(state.socraticNodes).toHaveLength(0);
  });

  it("adds one card per answer and advances to the next question", async () => {
    turnMock.mockResolvedValueOnce({
      question: "你说的“更好”具体指什么？",
      dimension: "definition",
      card: null,
      done: false,
    });
    await useCanvasStore.getState().startSocratic("source");

    turnMock.mockResolvedValueOnce({
      question: "这个判断在什么情况下不成立？",
      dimension: "counterexample",
      card: { title: "更快等于更好", body: "用户把速度等同于质量。" },
      done: false,
    });
    await useCanvasStore.getState().submitSocraticAnswer("更快就是更好");

    const state = useCanvasStore.getState();
    expect(state.socraticNodes).toHaveLength(1);
    expect(state.socraticNodes[0].data.title).toBe("更快等于更好");
    expect(state.socraticSession?.rounds).toHaveLength(1);
    expect(state.socraticSession?.rounds[0].answer).toBe("更快就是更好");
    expect(state.socraticCurrentQuestion).toBe("这个判断在什么情况下不成立？");
    expect(state.socraticCurrentDimension).toBe("counterexample");
  });

  it("finishes with a summary card connected to the source node", async () => {
    turnMock.mockResolvedValueOnce({
      question: "你说的“更好”具体指什么？",
      dimension: "definition",
      card: null,
      done: false,
    });
    await useCanvasStore.getState().startSocratic("source");

    turnMock.mockResolvedValueOnce({
      question: "",
      dimension: "consequence",
      card: { title: "更快等于更好", body: "用户把速度等同于质量。" },
      done: true,
    });
    summaryMock.mockResolvedValue({
      title: "追问：更好是什么",
      summary: "用户发现自己从未定义“更好”。",
      blindSpots: ["没有定义“更好”"],
    });

    await useCanvasStore.getState().submitSocraticAnswer("更快就是更好");
    await useCanvasStore.getState().finishSocratic();

    const state = useCanvasStore.getState();
    const card = state.nodes.find((node) => node.data.socraticSession);
    expect(state.socraticActive).toBe(false);
    expect(card?.data.inspireAction).toBe("socratic");
    expect(card?.data.title).toBe("追问：更好是什么");
    expect(card?.data.body).toContain("没有定义“更好”");
    expect(state.edges.some((edge) => edge.source === "source" && edge.target === card?.id)).toBe(true);
  });

  it("restores an unfinished draft without another model call", async () => {
    turnMock.mockResolvedValueOnce({
      question: "你说的“更好”具体指什么？",
      dimension: "definition",
      card: null,
      done: false,
    });
    await useCanvasStore.getState().startSocratic("source");
    expect(turnMock).toHaveBeenCalledTimes(1);

    // 模拟刷新：内存态清空，但草稿仍在 localStorage
    useCanvasStore.setState({
      socraticActive: false,
      socraticSession: null,
      socraticNodes: [],
      socraticCurrentQuestion: "",
      socraticCurrentDimension: null,
    });

    await useCanvasStore.getState().startSocratic("source");

    const state = useCanvasStore.getState();
    expect(turnMock).toHaveBeenCalledTimes(1);
    expect(state.socraticActive).toBe(true);
    expect(state.socraticCurrentQuestion).toBe("你说的“更好”具体指什么？");
  });
});
