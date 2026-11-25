import { describe, expect, it } from "vitest";
import { buildNode } from "@/lib/canvas-store";
import { buildConceptContext, findConceptByTerm, normalizeConceptTerm } from "@/lib/concepts";
import type { GoDeeperFlowEdge, KeyConcept } from "@/lib/types";

function edge(id: string, source: string, target: string): GoDeeperFlowEdge {
  return { id, source, target };
}

function concept(term: string): KeyConcept {
  return {
    id: `concept-${term}`,
    term,
    explanation: "",
    points: [],
    sourceNodeId: "n1",
    sourceNodeTitle: "",
    createdAt: "",
  };
}

describe("concept helpers", () => {
  it("normalizes terms for dedupe", () => {
    expect(normalizeConceptTerm("  Retention Rate. ")).toBe("retention rate");
    expect(normalizeConceptTerm("留存率，")).toBe("留存率");
    expect(normalizeConceptTerm("A（B）")).toBe("ab");
  });

  it("finds an existing concept regardless of case and punctuation", () => {
    const concepts = [concept("Retention Rate"), concept("留存率")];
    expect(findConceptByTerm(concepts, " retention rate. ")?.term).toBe("Retention Rate");
    expect(findConceptByTerm(concepts, "留存率。")?.term).toBe("留存率");
    expect(findConceptByTerm(concepts, "其他")).toBeUndefined();
  });

  it("builds context from the source card, ancestors, and direct evidence", () => {
    const parent = buildNode({ id: "parent", kind: "task", title: "Parent", body: "Parent body", x: 0, y: 0 });
    const source = buildNode({ id: "source", kind: "task", title: "Claim", body: "Claim body", x: 0, y: 0 });
    const evidence = buildNode({ id: "evidence", kind: "link", title: "Evidence", body: "Evidence body", x: 0, y: 0 });
    const answer = buildNode({ id: "answer", kind: "result", title: "Answer", body: "Answer body", x: 0, y: 0 });

    const context = buildConceptContext(
      [parent, source, evidence, answer],
      [
        edge("e1", "parent", "source"),
        edge("e2", "evidence", "source"),
        edge("e3", "source", "answer"),
      ],
      "source",
    );

    const joined = context.join("\n");
    expect(joined).toContain("Claim body");
    expect(joined).toContain("Parent body");
    expect(joined).toContain("Evidence body");
    expect(joined).not.toContain("Answer body");
  });

  it("returns an empty context when the source is missing", () => {
    expect(buildConceptContext([], [], "missing")).toEqual([]);
  });
});
