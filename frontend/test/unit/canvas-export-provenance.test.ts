import { describe, it, expect } from "vitest";
import { createCanvasExport, parseCanvasExport } from "@/lib/canvas-export";
import type { CanvasNodeSeed } from "@/lib/types";

describe("canvas export provenance", () => {
  it("exports task provenance fields", () => {
    const nodes: CanvasNodeSeed[] = [
      {
        id: "t1",
        kind: "task",
        title: "What is the gap?",
        body: "What is the gap?",
        x: 0,
        y: 0,
        taskType: "question",
        author: "ai",
        adopted: true,
        adoptedAt: "2026-10-30T12:00:00.000Z",
        editedByUser: false,
      },
    ];

    const file = createCanvasExport({ canvasName: "Provenance", nodes, edges: [] });

    expect(file.nodes[0].taskType).toBe("question");
    expect(file.nodes[0].author).toBe("ai");
    expect(file.nodes[0].adopted).toBe(true);
    expect(file.nodes[0].editedByUser).toBe(false);
    expect(file.nodes[0].adoptedAt).toBe("2026-10-30T12:00:00.000Z");
  });

  it("normalizes a legacy inspire node on import without losing its fields", () => {
    const legacyFile = {
      format: "godeeper.canvas",
      version: 1,
      exportedAt: "2026-10-30T12:00:00.000Z",
      canvasName: "Legacy",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "inspire-1",
          kind: "inspire",
          title: "Why?",
          body: "Because.",
          x: 0,
          y: 0,
          inspireQuestion: "Why?",
          inspireReason: "Because.",
          inspirePrerequisites: ["Premise"],
        },
      ],
      edges: [],
      timeline: [],
    };

    const parsed = parseCanvasExport(JSON.stringify(legacyFile));

    expect(parsed.nodes[0].kind).toBe("inspire");
    expect(parsed.nodes[0].taskType).toBe("question");
    expect(parsed.nodes[0].author).toBe("ai");
    expect(parsed.nodes[0].adopted).toBe(true);
    expect(parsed.nodes[0].legacyKind).toBe("inspire");
    expect(parsed.nodes[0].inspireQuestion).toBe("Why?");
    expect(parsed.nodes[0].inspireReason).toBe("Because.");
    expect(parsed.nodes[0].inspirePrerequisites).toEqual(["Premise"]);
  });

  it("defaults ordinary task nodes imported without provenance to user-authored questions", () => {
    const file = {
      format: "godeeper.canvas",
      version: 1,
      exportedAt: "2026-10-30T12:00:00.000Z",
      canvasName: "Old task",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "t1",
          kind: "task",
          title: "Q",
          body: "Q",
          x: 0,
          y: 0,
        },
      ],
      edges: [],
      timeline: [],
    };

    const parsed = parseCanvasExport(JSON.stringify(file));

    expect(parsed.nodes[0].taskType).toBe("question");
    expect(parsed.nodes[0].author).toBe("user");
    expect(parsed.nodes[0].adopted).toBe(true);
  });

  it("round-trips provenance through export and import", () => {
    const nodes: CanvasNodeSeed[] = [
      {
        id: "t1",
        kind: "task",
        title: "Q",
        body: "Q",
        x: 0,
        y: 0,
        taskType: "verify",
        author: "user",
        adopted: true,
        editedByUser: false,
      },
    ];

    const file = createCanvasExport({ canvasName: "Round trip", nodes, edges: [] });
    const parsed = parseCanvasExport(JSON.stringify(file));

    expect(parsed.nodes[0].taskType).toBe("verify");
    expect(parsed.nodes[0].author).toBe("user");
    expect(parsed.nodes[0].adopted).toBe(true);
  });

  it("round-trips context settings through export and import", () => {
    const nodes: CanvasNodeSeed[] = [
      {
        id: "t1",
        kind: "task",
        title: "Q",
        body: "Q",
        x: 0,
        y: 0,
        contextPinnedIds: ["pinned-1", "pinned-2"],
        contextExcludedIds: ["excluded-1"],
        contextSelectionIds: ["selected-1", "selected-2"],
      },
    ];

    const file = createCanvasExport({ canvasName: "Context", nodes, edges: [] });
    const parsed = parseCanvasExport(JSON.stringify(file));

    expect(file.nodes[0].contextPinnedIds).toEqual(["pinned-1", "pinned-2"]);
    expect(parsed.nodes[0].contextPinnedIds).toEqual(["pinned-1", "pinned-2"]);
    expect(parsed.nodes[0].contextExcludedIds).toEqual(["excluded-1"]);
    expect(parsed.nodes[0].contextSelectionIds).toEqual(["selected-1", "selected-2"]);
  });

  it("keeps context settings undefined for canvas files written before phase 2", () => {
    const file = {
      format: "godeeper.canvas",
      version: 1,
      exportedAt: "2026-10-30T12:00:00.000Z",
      canvasName: "Old",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [
        {
          id: "t1",
          kind: "task",
          title: "Q",
          body: "Q",
          x: 0,
          y: 0,
        },
      ],
      edges: [],
      timeline: [],
    };

    const parsed = parseCanvasExport(JSON.stringify(file));

    expect(parsed.nodes[0].contextPinnedIds).toBeUndefined();
    expect(parsed.nodes[0].contextExcludedIds).toBeUndefined();
    expect(parsed.nodes[0].contextSelectionIds).toBeUndefined();
  });

  it("round-trips a socratic session card", () => {
    const session = {
      id: "s1",
      sourceNodeId: "t1",
      sourceTitle: "Q",
      sourceBody: "Q",
      context: ["ctx"],
      rounds: [
        {
          question: "Q1",
          answer: "A1",
          cardTitle: "T",
          cardBody: "B",
          dimension: "definition" as const,
          createdAt: "2026-11-09T00:00:00.000Z",
        },
      ],
      status: "done" as const,
      title: "S",
      summary: "sum",
      blindSpots: ["b1"],
      createdAt: "2026-11-09T00:00:00.000Z",
      updatedAt: "2026-11-09T00:00:00.000Z",
    };
    const nodes: CanvasNodeSeed[] = [
      {
        id: "c1",
        kind: "task",
        title: "S",
        body: "sum",
        x: 0,
        y: 0,
        inspireAction: "socratic",
        socraticSession: session,
      },
    ];

    const file = createCanvasExport({ canvasName: "Socratic", nodes, edges: [] });
    const parsed = parseCanvasExport(JSON.stringify(file));

    expect(file.nodes[0].inspireAction).toBe("socratic");
    expect(parsed.nodes[0].inspireAction).toBe("socratic");
    expect(parsed.nodes[0].socraticSession?.rounds).toHaveLength(1);
    expect(parsed.nodes[0].socraticSession?.blindSpots).toEqual(["b1"]);
  });
});
