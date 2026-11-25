import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildNode, buildEdge } from "@/lib/canvas-store";
import type { CanvasNodeSeed, CanvasEdgeSeed } from "@/lib/types";

vi.mock("@xyflow/react", () => ({
  MarkerType: {
    ArrowClosed: "arrowClosed",
  },
}));

describe("CanvasStore Integration", () => {
  describe("buildNode and buildEdge", () => {
    it("creates valid nodes", () => {
      const seed: CanvasNodeSeed = {
        id: "node-1",
        kind: "text",
        title: "Test",
        body: "Content",
        x: 100,
        y: 100,
      };

      const node = buildNode(seed);

      expect(node.id).toBe("node-1");
      expect(node.type).toBe("textNode");
      expect(node.position).toEqual({ x: 100, y: 100 });
      expect(node.data.kind).toBe("text");
      expect(node.data.title).toBe("Test");
      expect(node.data.body).toBe("Content");
    });

    it("renders legacy inspire nodes through the task card", () => {
      const seed: CanvasNodeSeed = {
        id: "legacy-inspire",
        kind: "inspire",
        title: "Why does this matter?",
        body: "Because it changes the baseline.",
        x: 100,
        y: 100,
        inspireQuestion: "Why does this matter?",
        inspireReason: "Because it changes the baseline.",
      };

      const node = buildNode(seed);

      expect(node.type).toBe("taskNode");
      expect(node.data.taskType).toBe("question");
      expect(node.data.author).toBe("ai");
      expect(node.data.body).toBe("Why does this matter?");
    });

    it("creates valid edges", () => {
      const seed: CanvasEdgeSeed = {
        id: "edge-1",
        source: "node-1",
        target: "node-2",
        active: true,
      };

      const edge = buildEdge(seed);

      expect(edge.id).toBe("edge-1");
      expect(edge.source).toBe("node-1");
      expect(edge.target).toBe("node-2");
      expect(edge.animated).toBe(false);
    });
  });

  describe("Node Width Calculation", () => {
    it("returns custom width if provided", () => {
      const node = { width: 500, kind: "text" as const } as CanvasNodeSeed;
      expect(buildNode(node).data.width).toBe(500);
    });

    it("returns 380 for task nodes by default", () => {
      const node = { kind: "task" as const, id: "t1", title: "", body: "", x: 0, y: 0 } as CanvasNodeSeed;
      expect(buildNode(node).data.width).toBe(380);
    });

    it("returns 300 for free nodes by default", () => {
      const node = { kind: "free" as const, id: "f1", title: "", body: "", x: 0, y: 0 } as CanvasNodeSeed;
      expect(buildNode(node).data.width).toBe(300);
    });

    it("returns 340 for other nodes by default", () => {
      const node = { kind: "text" as const, id: "n1", title: "", body: "", x: 0, y: 0 } as CanvasNodeSeed;
      expect(buildNode(node).data.width).toBe(340);
    });
  });

  describe("Edge Creation", () => {
    it("creates non-animated edge by default", () => {
      const seed: CanvasEdgeSeed = {
        id: "edge-1",
        source: "node-1",
        target: "node-2",
      };

      const edge = buildEdge(seed);

      expect(edge.animated).toBe(false);
      expect(edge.type).toBe("default");
    });

    it("all edges default to gray regardless of active flag", () => {
      const seed: CanvasEdgeSeed = {
        id: "edge-2",
        source: "node-1",
        target: "node-2",
        active: true,
      };

      const edge = buildEdge(seed);

      expect(edge.animated).toBe(false);
      expect(edge.style?.stroke).toContain("116, 140, 176");
    });
  });

  describe("Node Metadata", () => {
    it("preserves all metadata fields", () => {
      const seed: CanvasNodeSeed = {
        id: "task-1",
        kind: "task",
        title: "Task Title",
        body: "Task Body",
        x: 100,
        y: 200,
        width: 400,
        metaLeft: "GPT-5",
        metaRight: "RUN TASK",
        chips: ["context 1", "context 2"],
        taskStatus: "running",
      };

      const node = buildNode(seed);

      expect(node.data.metaLeft).toBe("GPT-5");
      expect(node.data.metaRight).toBe("RUN TASK");
      expect(node.data.chips).toEqual(["context 1", "context 2"]);
      expect(node.data.taskStatus).toBe("running");
      expect(node.data.width).toBe(400);
    });

    it("handles link node with source label", () => {
      const seed: CanvasNodeSeed = {
        id: "link-1",
        kind: "link",
        title: "Source",
        body: "https://example.com",
        x: 0,
        y: 0,
        sourceLabel: "SOURCE NODE",
        previewLabel: "Analyzing",
      };

      const node = buildNode(seed);

      expect(node.data.sourceLabel).toBe("SOURCE NODE");
      expect(node.data.previewLabel).toBe("Analyzing");
    });
  });
});
