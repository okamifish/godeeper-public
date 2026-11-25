import { describe, it, expect } from "vitest";
import type { GoDeeperFlowEdge, GoDeeperFlowNode } from "@/lib/types";
import {
  contextEntriesToPrompt,
  estimateTokens,
  getContextRecipe,
  resolveTaskContext,
} from "@/lib/context-resolver";

function node(
  id: string,
  kind: GoDeeperFlowNode["data"]["kind"],
  title: string,
  body = "",
  extra: Partial<GoDeeperFlowNode["data"]> = {},
): GoDeeperFlowNode {
  return {
    id,
    type: `${kind}Node`,
    position: { x: 0, y: 0 },
    data: { kind, title, body, ...extra },
  };
}

function edge(id: string, source: string, target: string): GoDeeperFlowEdge {
  return { id, source, target };
}

function fixture() {
  const nodes: GoDeeperFlowNode[] = [
    node("root", "task", "Root question", "Root body"),
    node("parent", "task", "Parent question", "Parent body"),
    node("current", "task", "Current question", "Current body", { taskType: "question" }),
    node("evidence", "link", "Evidence source", "Evidence body", { sourceLabel: "example.com" }),
    node("result", "result", "AI result", "Result body"),
    node("sibling", "task", "Sibling question", "Sibling body"),
    node("connected", "result", "Connected result", "Connected body"),
    node("pinned", "text", "Pinned context", "Pinned body"),
  ];
  const edges: GoDeeperFlowEdge[] = [
    edge("e-root-parent", "root", "parent"),
    edge("e-parent-current", "parent", "current"),
    edge("e-evidence-current", "evidence", "current"),
    edge("e-current-result", "current", "result"),
    edge("e-parent-sibling", "parent", "sibling"),
    edge("e-current-connected", "current", "connected"),
  ];
  return { nodes, edges };
}

function ids(entries: ReturnType<typeof resolveTaskContext>["entries"]) {
  return entries.map((entry) => entry.node.id);
}

describe("context resolver", () => {
  it("defaults to current + ancestors + direct evidence, excluding results and siblings", () => {
    const { nodes, edges } = fixture();
    const resolved = resolveTaskContext(nodes, edges, "current");

    expect(ids(resolved.entries)).toEqual(["current", "evidence", "parent", "root"]);
    expect(resolved.entries.find((entry) => entry.node.id === "current")?.reason).toBe("current");
    expect(resolved.entries.find((entry) => entry.node.id === "evidence")?.reason).toBe("evidence");
    expect(resolved.entries.find((entry) => entry.node.id === "parent")?.reason).toBe("ancestor");
  });

  it("respects ancestor depth", () => {
    const { nodes, edges } = fixture();
    const resolved = resolveTaskContext(nodes, edges, "current", { ancestorDepth: 1 });

    expect(ids(resolved.entries)).toEqual(["current", "evidence", "parent"]);
  });

  it("includes pinned context before evidence", () => {
    const { nodes, edges } = fixture();
    const resolved = resolveTaskContext(nodes, edges, "current", { pinnedIds: ["pinned"] });

    expect(ids(resolved.entries)).toEqual(["current", "pinned", "evidence", "parent", "root"]);
    expect(resolved.entries.find((entry) => entry.node.id === "pinned")?.reason).toBe("pinned");
  });

  it("excludes requested nodes but never the current node", () => {
    const { nodes, edges } = fixture();
    const resolved = resolveTaskContext(nodes, edges, "current", {
      excludedIds: ["current", "evidence", "parent"],
    });

    expect(ids(resolved.entries)).toEqual(["current", "root"]);
  });

  it("uses selected nodes as an explicit override", () => {
    const { nodes, edges } = fixture();
    const resolved = resolveTaskContext(nodes, edges, "current", {
      selectedIds: ["pinned", "sibling"],
      pinnedIds: ["pinned"],
    });

    expect(ids(resolved.entries)).toEqual(["current", "pinned", "sibling"]);
    expect(resolved.entries.find((entry) => entry.node.id === "sibling")?.reason).toBe("selected");
  });

  it("includes direct results only when requested", () => {
    const { nodes, edges } = fixture();
    const withoutResults = resolveTaskContext(nodes, edges, "current");
    const withResults = resolveTaskContext(nodes, edges, "current", { includeResults: true });
    const withDescendants = resolveTaskContext(nodes, edges, "current", { includeDescendants: true });

    expect(ids(withoutResults.entries)).not.toContain("result");
    expect(ids(withResults.entries)).toContain("result");
    expect(ids(withResults.entries)).not.toContain("connected");
    expect(ids(withDescendants.entries)).toContain("connected");
    expect(ids(withDescendants.entries)).not.toContain("result");
  });

  it("includes siblings only when requested", () => {
    const { nodes, edges } = fixture();
    const resolved = resolveTaskContext(nodes, edges, "current", { includeSiblings: true });

    expect(ids(resolved.entries)).toContain("sibling");
    expect(resolved.entries.find((entry) => entry.node.id === "sibling")?.reason).toBe("sibling");
  });

  it("includes the whole connected component when explicitly requested", () => {
    const { nodes, edges } = fixture();
    const resolved = resolveTaskContext(nodes, edges, "current", { includeWholeComponent: true });

    expect(ids(resolved.entries)).toEqual([
      "current",
      "evidence",
      "parent",
      "root",
      "sibling",
      "result",
      "connected",
    ]);
  });

  it("survives cycles and multiple parents without duplicating entries", () => {
    const { nodes, edges } = fixture();
    const cycling = [
      ...edges,
      edge("e-current-root", "current", "root"),
      edge("e-parent-current-reverse", "current", "parent"),
    ];
    const resolved = resolveTaskContext(nodes, cycling, "current");

    expect(new Set(ids(resolved.entries)).size).toBe(resolved.entries.length);
    expect(ids(resolved.entries)).toContain("root");
  });

  it("uses the task type recipe for results", () => {
    expect(getContextRecipe("question").includeResults).toBe(false);
    expect(getContextRecipe("summary").includeResults).toBe(true);
    expect(getContextRecipe("compare").includeResults).toBe(true);
    expect(getContextRecipe("critique").includeResults).toBe(false);
  });

  it("estimates tokens and truncates low-priority entries", () => {
    const { nodes, edges } = fixture();
    const resolved = resolveTaskContext(nodes, edges, "current", { maxTokens: 2 });

    expect(resolved.truncated).toBe(true);
    expect(ids(resolved.entries)).toContain("current");
    expect(ids(resolved.entries).length).toBeLessThan(4);
    expect(resolved.totalTokens).toBeGreaterThan(0);
  });

  it("formats entries for the task API", () => {
    const { nodes, edges } = fixture();
    const resolved = resolveTaskContext(nodes, edges, "current", { ancestorDepth: 1 });
    const prompt = contextEntriesToPrompt(resolved.entries);

    expect(prompt[0]).toContain("Current question");
    expect(prompt[0]).toContain("Current body");
    expect(prompt.join("\n")).toContain("Evidence source");
    expect(prompt.join("\n")).toContain("Parent body");
  });

  it("counts CJK characters and English chunks approximately", () => {
    expect(estimateTokens("中文四个字")).toBe(4);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});
