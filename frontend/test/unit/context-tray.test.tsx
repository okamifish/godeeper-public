import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextTray } from "@/components/nodes/context-tray";

const mocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  pushHistory: vi.fn(),
}));

vi.mock("@/lib/canvas-store", () => {
  const nodes = [
    {
      id: "parent",
      type: "taskNode",
      position: { x: 0, y: 0 },
      data: { kind: "task", title: "Parent question", body: "Parent body" },
    },
    {
      id: "evidence",
      type: "linkNode",
      position: { x: 0, y: 0 },
      data: { kind: "link", title: "Evidence source", body: "Evidence body", sourceLabel: "example.com" },
    },
    {
      id: "current",
      type: "taskNode",
      position: { x: 0, y: 0 },
      data: { kind: "task", title: "Current question", body: "Current body", taskType: "question" },
    },
  ];
  const edges = [
    { id: "e-parent-current", source: "parent", target: "current" },
    { id: "e-evidence-current", source: "evidence", target: "current" },
  ];
  return {
    useCanvasStore: (selector: (state: unknown) => unknown) =>
      selector({
        language: "zh",
        nodes,
        edges,
        selectedNodeIds: ["parent"],
        updateNodeData: mocks.updateNodeData,
        pushHistory: mocks.pushHistory,
      }),
  };
});

describe("ContextTray", () => {
  beforeEach(() => {
    mocks.updateNodeData.mockClear();
    mocks.pushHistory.mockClear();
  });

  it("summarizes the resolved context and expands to show each card", () => {
    render(<ContextTray nodeId="current" />);

    expect(screen.getByText(/上下文/)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /上下文/ }));

    expect(screen.getByText("Parent question")).toBeInTheDocument();
    expect(screen.getByText("Evidence source")).toBeInTheDocument();
  });

  it("excludes a non-current entry and keeps the current task", () => {
    render(<ContextTray nodeId="current" />);
    fireEvent.click(screen.getByRole("button", { name: /上下文/ }));

    const removeButtons = screen.getAllByTitle("移除");
    fireEvent.click(removeButtons[0]);

    expect(mocks.updateNodeData).toHaveBeenCalled();
    const patch = mocks.updateNodeData.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.contextExcludedIds).toContain("evidence");
  });

  it("does not offer removing the current task", () => {
    render(<ContextTray nodeId="current" />);
    fireEvent.click(screen.getByRole("button", { name: /上下文/ }));

    // current + parent + evidence = 3 entries, but only 2 removable
    expect(screen.getAllByTitle("移除")).toHaveLength(2);
  });

  it("applies the canvas selection as explicit context", () => {
    render(<ContextTray nodeId="current" />);
    fireEvent.click(screen.getByRole("button", { name: /上下文/ }));

    fireEvent.click(screen.getByRole("button", { name: /使用选中/ }));

    const patch = mocks.updateNodeData.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.contextSelectionIds).toEqual(["parent"]);
  });
});
