import { describe, it, expect } from "vitest";
import type { GoDeeperNodeData, GoDeeperFlowNode, GoDeeperFlowEdge, CanvasNodeSeed, CanvasEdgeSeed } from "@/lib/types";

describe("types", () => {
  describe("GoDeeperNodeData", () => {
    it("accepts valid text node data", () => {
      const data: GoDeeperNodeData = {
        kind: "text",
        title: "Test Title",
        body: "Test Body",
      };
      expect(data.kind).toBe("text");
    });

    it("accepts valid task node data with all fields", () => {
      const data: GoDeeperNodeData = {
        kind: "task",
        title: "Task Title",
        body: "Task Prompt",
        width: 380,
        metaLeft: "GPT-5",
        metaRight: "RUN TASK",
        chips: ["context 1", "context 2"],
        taskStatus: "running",
      };
      expect(data.kind).toBe("task");
      expect(data.chips).toHaveLength(2);
      expect(data.taskStatus).toBe("running");
    });

    it("accepts valid link node data", () => {
      const data: GoDeeperNodeData = {
        kind: "link",
        title: "Source Title",
        body: "https://example.com",
        sourceLabel: "SOURCE NODE",
        previewLabel: "Analyzing",
      };
      expect(data.kind).toBe("link");
      expect(data.sourceLabel).toBe("SOURCE NODE");
    });
  });

  describe("GoDeeperFlowNode", () => {
    it("creates a valid flow node", () => {
      const node: GoDeeperFlowNode = {
        id: "node-1",
        type: "textNode",
        position: { x: 100, y: 200 },
        data: {
          kind: "text",
          title: "Test",
          body: "Content",
        },
      };
      expect(node.id).toBe("node-1");
      expect(node.position.x).toBe(100);
    });
  });

  describe("GoDeeperFlowEdge", () => {
    it("creates a valid flow edge", () => {
      const edge: GoDeeperFlowEdge = {
        id: "edge-1",
        source: "node-1",
        target: "node-2",
        type: "smoothstep",
      };
      expect(edge.source).toBe("node-1");
      expect(edge.target).toBe("node-2");
    });
  });

  describe("CanvasNodeSeed", () => {
    it("creates a valid node seed", () => {
      const seed: CanvasNodeSeed = {
        id: "seed-1",
        kind: "text",
        title: "Seed Title",
        body: "Seed Body",
        x: 50,
        y: 100,
      };
      expect(seed.id).toBe("seed-1");
      expect(seed.x).toBe(50);
      expect(seed.y).toBe(100);
    });
  });

  describe("CanvasEdgeSeed", () => {
    it("creates a valid edge seed", () => {
      const seed: CanvasEdgeSeed = {
        id: "seed-edge-1",
        source: "node-1",
        target: "node-2",
        active: true,
      };
      expect(seed.active).toBe(true);
    });
  });
});
