import { describe, expect, it } from "vitest";
import { buildNode } from "@/lib/canvas-store";
import { buildCritiqueInput } from "@/lib/critique-context";
import type { GoDeeperFlowEdge } from "@/lib/types";

function edge(id: string, source: string, target: string): GoDeeperFlowEdge {
  return { id, source, target };
}

describe("buildCritiqueInput", () => {
  it("uses the task node as the claim and only direct link nodes as evidence", () => {
    const claim = buildNode({
      id: "claim",
      kind: "task",
      title: "Retention is driven by notifications",
      body: "Users who enable notifications stay longer.",
      x: 0,
      y: 0,
      taskType: "derive",
    });
    const link = buildNode({
      id: "source",
      kind: "link",
      title: "Retention report",
      body: "fallback body",
      summary: "Notification-enabled users have 2x retention.",
      x: 0,
      y: 0,
    });
    const answer = buildNode({
      id: "answer",
      kind: "result",
      title: "Supporting answer",
      body: "Yes, notifications matter.",
      x: 0,
      y: 0,
    });
    const parent = buildNode({
      id: "parent",
      kind: "task",
      title: "Parent question",
      body: "parent body",
      x: 0,
      y: 0,
    });

    const input = buildCritiqueInput(
      [claim, link, answer, parent],
      [
        edge("e-source", "source", "claim"),
        edge("e-answer", "answer", "claim"),
        edge("e-parent", "parent", "claim"),
        edge("e-outgoing", "claim", "answer"),
      ],
      "claim",
    );

    expect(input?.claim.title).toBe("Retention is driven by notifications");
    expect(input?.claim.taskType).toBe("derive");
    expect(input?.evidence).toEqual([
      { title: "Retention report", text: "Notification-enabled users have 2x retention." },
    ]);
  });

  it("caps evidence at eight nodes", () => {
    const claim = buildNode({ id: "c", kind: "task", title: "C", body: "B", x: 0, y: 0 });
    const links = Array.from({ length: 10 }, (_, i) => buildNode({
      id: `l${i}`,
      kind: "link",
      title: `Link ${i}`,
      body: `Body ${i}`,
      x: 0,
      y: 0,
    }));
    const edges = links.map((link) => edge(`e-${link.id}`, link.id, "c"));

    const input = buildCritiqueInput([claim, ...links], edges, "c");
    expect(input?.evidence).toHaveLength(8);
  });

  it("returns null when the task node is missing", () => {
    expect(buildCritiqueInput([], [], "missing")).toBeNull();
  });
});
