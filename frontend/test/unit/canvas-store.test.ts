import { describe, it, expect } from "vitest";
import { getNodeWidth, buildNode, buildEdge } from "@/lib/canvas-store";
import type { CanvasNodeSeed, CanvasEdgeSeed } from "@/lib/types";

describe("canvas-store utilities", () => {
  describe("getNodeWidth", () => {
    it("returns custom width if provided", () => {
      const node = { width: 500 } as CanvasNodeSeed;
      expect(getNodeWidth(node)).toBe(500);
    });

    it("returns 380 for task nodes", () => {
      const node = { kind: "task" as const } as CanvasNodeSeed;
      expect(getNodeWidth(node)).toBe(380);
    });

    it("returns 300 for free nodes", () => {
      const node = { kind: "free" as const } as CanvasNodeSeed;
      expect(getNodeWidth(node)).toBe(300);
    });

    it("returns 340 for other nodes", () => {
      const node = { kind: "text" as const } as CanvasNodeSeed;
      expect(getNodeWidth(node)).toBe(340);
    });
  });

  describe("buildNode", () => {
    it("creates a valid flow node from seed", () => {
      const seed: CanvasNodeSeed = {
        id: "test-1",
        kind: "text",
        title: "Test Title",
        body: "Test Body",
        x: 100,
        y: 200,
      };

      const node = buildNode(seed);

      expect(node.id).toBe("test-1");
      expect(node.type).toBe("textNode");
      expect(node.position).toEqual({ x: 100, y: 200 });
      expect(node.data.kind).toBe("text");
      expect(node.data.title).toBe("Test Title");
      expect(node.data.body).toBe("Test Body");
      expect(node.draggable).toBe(true);
    });

    it("preserves metadata fields", () => {
      const seed: CanvasNodeSeed = {
        id: "test-2",
        kind: "task",
        title: "Task",
        body: "Prompt",
        x: 0,
        y: 0,
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
    });
  });

  describe("buildEdge", () => {
    it("does not attach an arrow marker to edges", () => {
      const seed: CanvasEdgeSeed = {
        id: "edge-no-marker",
        source: "node-1",
        target: "node-2",
      };

      expect(buildEdge(seed).markerEnd).toBeUndefined();
    });

    it("creates a valid flow edge from seed", () => {
      const seed: CanvasEdgeSeed = {
        id: "edge-1",
        source: "node-1",
        target: "node-2",
      };

      const edge = buildEdge(seed);

      expect(edge.id).toBe("edge-1");
      expect(edge.source).toBe("node-1");
      expect(edge.target).toBe("node-2");
      expect(edge.type).toBe("default");
      expect(edge.animated).toBe(false);
    });

    it("creates edge regardless of active flag (all edges default gray)", () => {
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
});
