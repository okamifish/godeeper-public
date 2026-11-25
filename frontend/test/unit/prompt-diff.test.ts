import { describe, expect, it } from "vitest";
import { checkTemplateVariables, diffLines, diffStats } from "@/lib/prompt-diff";

describe("prompt diff", () => {
  it("returns no lines for two empty strings", () => {
    expect(diffLines("", "")).toEqual([]);
  });

  it("marks a single changed line as remove + add", () => {
    const lines = diffLines("A\nB\nC", "A\nB2\nC");
    expect(lines).toEqual([
      { type: "same", text: "A" },
      { type: "remove", text: "B" },
      { type: "add", text: "B2" },
      { type: "same", text: "C" },
    ]);
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1 });
  });

  it("handles added and removed lines", () => {
    expect(diffLines("A", "A\nB")).toEqual([
      { type: "same", text: "A" },
      { type: "add", text: "B" },
    ]);
    expect(diffLines("A\nB", "A")).toEqual([
      { type: "same", text: "A" },
      { type: "remove", text: "B" },
    ]);
  });

  it("treats an empty old text as all additions", () => {
    expect(diffLines("", "A\nB")).toEqual([
      { type: "add", text: "A" },
      { type: "add", text: "B" },
    ]);
  });
});

describe("template variable checks", () => {
  it("reports missing and unknown placeholders", () => {
    expect(checkTemplateVariables("{{url}}", ["url", "pageText"])).toEqual({
      missing: ["pageText"],
      unknown: [],
    });
    expect(checkTemplateVariables("{{url}} {{bogus}}", ["url"])).toEqual({
      missing: [],
      unknown: ["bogus"],
    });
    expect(checkTemplateVariables("{{url}} {{pageText}}", ["url", "pageText"])).toEqual({
      missing: [],
      unknown: [],
    });
  });
});
