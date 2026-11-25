import { describe, expect, it } from "vitest";
import {
  buildTaskSystemPrompt,
  normalizeTaskRunResult,
  normalizeTaskType,
} from "../../src/services/ai.service";

describe("normalizeTaskType", () => {
  it("keeps known task types", () => {
    expect(normalizeTaskType("summary")).toBe("summary");
    expect(normalizeTaskType("critique")).toBe("critique");
  });

  it("falls back to question for unknown or missing values", () => {
    expect(normalizeTaskType("summarize")).toBe("question");
    expect(normalizeTaskType(undefined)).toBe("question");
    expect(normalizeTaskType(42)).toBe("question");
  });
});

describe("buildTaskSystemPrompt", () => {
  const base = "You are a reasoning assistant.";

  it("appends a type-specific instruction", () => {
    const prompt = buildTaskSystemPrompt(base, "critique");

    expect(prompt).toContain(base);
    expect(prompt).toContain("counterexample");
    expect(prompt).toContain("Do not agree with or rewrite the claim.");
  });

  it("uses different instructions for different task types", () => {
    const summary = buildTaskSystemPrompt(base, "summary");
    const compare = buildTaskSystemPrompt(base, "compare");

    expect(summary).not.toBe(compare);
    expect(summary).toContain("key takeaways");
    expect(compare).toContain("trade-off");
  });

  it("uses the question instruction when taskType is missing", () => {
    expect(buildTaskSystemPrompt(base)).toContain("Task intent: question.");
  });

  it("tells the model to answer directly and keep one concept per node", () => {
    const prompt = buildTaskSystemPrompt(base, "question");
    expect(prompt).toContain("Answer the user's question directly");
    expect(prompt).toContain("Do not answer with meta-advice");
    expect(prompt).toContain("one result node per requested item");
    expect(prompt).toContain("3-12 result nodes");
  });

  it("adds the new title + results contract to old stored prompts", () => {
    const oldStored = "Given a task prompt, generate 2-3 insight nodes. Respond in JSON array format.";
    const prompt = buildTaskSystemPrompt(oldStored, "question");

    expect(prompt).toContain('"results"');
    expect(prompt).toContain("summarizes the user's question");
  });

  it("no longer caps result body length in the contract", () => {
    const prompt = buildTaskSystemPrompt(base, "question");

    expect(prompt).not.toContain("max 200 chars");
  });
});

describe("normalizeTaskRunResult", () => {
  it("reads the new title + results object", () => {
    const result = normalizeTaskRunResult(JSON.stringify({
      title: "AI 基础概念",
      results: [
        { title: "表示层", body: "向量、嵌入" },
        { title: "目标层", body: "损失函数" },
      ],
    }));

    expect(result.title).toBe("AI 基础概念");
    expect(result.results).toHaveLength(2);
    expect(result.results[0].title).toBe("表示层");
  });

  it("keeps backward compatibility with the old array format", () => {
    const result = normalizeTaskRunResult(JSON.stringify([
      { title: "One", body: "Body" },
    ]));

    expect(result.title).toBeUndefined();
    expect(result.results).toHaveLength(1);
  });

  it("strips markdown fences and falls back for plain text", () => {
    const fenced = normalizeTaskRunResult("```json\n{\"results\":[{\"title\":\"T\",\"body\":\"B\"}]}\n```");
    expect(fenced.results[0].title).toBe("T");

    const plain = normalizeTaskRunResult("not json");
    expect(plain.results[0].title).toBe("AI Response");
  });

  it("caps title and dynamic result count at 12", () => {
    const result = normalizeTaskRunResult(JSON.stringify({
      title: "t".repeat(80),
      results: Array.from({ length: 15 }, (_, i) => ({ title: `R${i}`, body: "B" })),
    }));

    expect(result.title).toHaveLength(40);
    expect(result.results).toHaveLength(12);
  });

  it("keeps long result bodies instead of truncating at 200 chars", () => {
    const longBody = "长".repeat(800);
    const result = normalizeTaskRunResult(JSON.stringify({
      results: [{ title: "长答案", body: longBody }],
    }));

    expect(result.results[0].body).toBe(longBody);
    expect(result.results[0].body).toHaveLength(800);
  });
});
