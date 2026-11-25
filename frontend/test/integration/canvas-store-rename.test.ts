import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasStore } from "@/lib/canvas-store";

vi.mock("zustand", async () => {
  return await vi.importActual<typeof import("zustand")>("zustand");
});

vi.mock("@xyflow/react", () => ({
  applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  applyEdgeChanges: (_changes: unknown, edges: unknown) => edges,
  addEdge: (edge: unknown, edges: unknown[]) => [...edges, edge],
  MarkerType: { ArrowClosed: "arrowClosed" },
}));

const { updateCanvas } = vi.hoisted(() => ({
  updateCanvas: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/api", () => ({
  api: { updateCanvas },
}));

describe("renameCanvas", () => {
  beforeEach(() => {
    updateCanvas.mockClear();
    useCanvasStore.setState({
      activeCanvasId: "1a464810-ae70-4d70-ae46-4aebf93577dc",
      canvasName: "Old name",
      language: "zh",
    });
  });

  it("persists the new name to the cloud canvas", async () => {
    await useCanvasStore.getState().renameCanvas("新名字");

    expect(updateCanvas).toHaveBeenCalledWith(
      "1a464810-ae70-4d70-ae46-4aebf93577dc",
      { title: "新名字" },
    );
    expect(useCanvasStore.getState().canvasName).toBe("新名字");
  });

  it("keeps local canvases local", async () => {
    useCanvasStore.setState({ activeCanvasId: "canvas-1", canvasName: "Local old" });
    await useCanvasStore.getState().renameCanvas("Local new");

    expect(updateCanvas).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().canvasName).toBe("Local new");
  });
});
