import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
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

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const originalSetActiveCanvasId = useCanvasStore.getState().setActiveCanvasId;
const errorMock = vi.mocked(toast.error);

function resetStore() {
  window.localStorage.clear();
  useCanvasStore.setState({
    nodes: [
      buildNode({ id: "source", kind: "text", title: "Source", body: "source body", x: 0, y: 0 }),
      buildNode({ id: "target", kind: "text", title: "Target", body: "target body", x: 240, y: 0 }),
    ],
    edges: [],
    activeCanvasId: "canvas-1",
    canvasName: "Canvas 1",
    selectedNodeId: "",
    selectedNodeIds: [],
    focusNodeId: null,
    setActiveCanvasId: originalSetActiveCanvasId,
  });
}

describe("canvas store mention jump", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    errorMock.mockClear();
    resetStore();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("selects and focuses a target on the current canvas", async () => {
    await useCanvasStore.getState().jumpToMention({
      canvasId: "canvas-1",
      nodeId: "target",
      label: "旧标题",
    });

    const state = useCanvasStore.getState();
    expect(state.selectedNodeId).toBe("target");
    expect(state.focusNodeId).toBe("target");

    const cache = JSON.parse(window.localStorage.getItem("godeeper-mention-labels") ?? "{}");
    expect(cache["canvas-1:target"].label).toBe("Target");

    vi.advanceTimersByTime(600);
    expect(useCanvasStore.getState().focusNodeId).toBeNull();
  });

  it("shows an error when the target is missing", async () => {
    await useCanvasStore.getState().jumpToMention({
      canvasId: "canvas-1",
      nodeId: "missing",
      label: "不存在",
    });

    expect(errorMock).toHaveBeenCalled();
    expect(useCanvasStore.getState().selectedNodeId).toBe("");
  });

  it("switches canvas before focusing a cross-canvas target", async () => {
    const setActiveCanvasId = vi.fn(async (canvasId: string) => {
      useCanvasStore.setState({
        activeCanvasId: canvasId,
        canvasName: "Canvas 2",
        nodes: [buildNode({ id: "target", kind: "text", title: "Target 2", body: "", x: 0, y: 0 })],
      });
    });
    useCanvasStore.setState({ setActiveCanvasId: setActiveCanvasId as unknown as typeof originalSetActiveCanvasId });

    await useCanvasStore.getState().jumpToMention({
      canvasId: "canvas-2",
      nodeId: "target",
      label: "旧标题",
    });

    expect(setActiveCanvasId).toHaveBeenCalledWith("canvas-2");
    expect(useCanvasStore.getState().activeCanvasId).toBe("canvas-2");
    expect(useCanvasStore.getState().selectedNodeId).toBe("target");
  });

  it("shows an error when the canvas switch fails", async () => {
    useCanvasStore.setState({
      setActiveCanvasId: (async () => {}) as unknown as typeof originalSetActiveCanvasId,
    });

    await useCanvasStore.getState().jumpToMention({
      canvasId: "canvas-2",
      nodeId: "target",
      label: "旧标题",
    });

    expect(errorMock).toHaveBeenCalled();
    expect(useCanvasStore.getState().activeCanvasId).toBe("canvas-1");
  });
});
