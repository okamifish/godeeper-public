import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateAiText: vi.fn(),
  getDecryptedApiKey: vi.fn(),
}));

vi.mock("../../src/ai-harness/runtime", () => ({
  generateAiText: mocks.generateAiText,
  streamAiText: vi.fn(),
}));

vi.mock("../../src/services/auth.service", () => ({
  getDecryptedApiKey: mocks.getDecryptedApiKey,
}));

import { runPromptComparison, suggestPromptImprovement } from "../../src/services/ai.service";

beforeEach(() => {
  mocks.generateAiText.mockReset();
  mocks.getDecryptedApiKey.mockReset();
  mocks.getDecryptedApiKey.mockResolvedValue({
    apiKey: "test-key",
    provider: "openai",
    baseUrl: null,
    modelName: "test-model",
  });
});

describe("runPromptComparison", () => {
  it("runs both sides and isolates a failure on side B", async () => {
    mocks.generateAiText
      .mockResolvedValueOnce({
        text: '{"title":"Title","results":[{"title":"A","body":"body"}]}',
        usage: { inputTokens: 12, outputTokens: 8 },
      })
      .mockRejectedValueOnce(new Error("provider exploded"));

    const result = await runPromptComparison("admin-user", {
      id: "task",
      contentA: "SAVED BASE",
      contentB: "DRAFT BASE",
      input: "Summarize this",
      taskType: "summary",
    });

    expect(mocks.generateAiText).toHaveBeenCalledTimes(2);
    expect(result.a.raw).toContain("Title");
    expect(result.a.parsed).toEqual({
      title: "Title",
      results: [{ title: "A", body: "body" }],
    });
    expect(result.a.usage).toEqual({ inputTokens: 12, outputTokens: 8 });
    expect(result.b.raw).toBe("");
    expect(result.b.error).toBe("provider exploded");

    expect(result.systemA).toContain("SAVED BASE");
    expect(result.systemB).toContain("DRAFT BASE");
    expect(result.systemA).toContain('"results"');
    expect(result.systemA).toContain("Task intent: summary");
    expect(result.userMessage).toBe("Summarize this");
    expect(mocks.generateAiText.mock.calls[0][1]).toMatchObject({ temperature: 0.3 });
  });

  it("falls back to deepseek-flash when a DeepSeek key has no model name", async () => {
    mocks.getDecryptedApiKey.mockResolvedValueOnce({
      apiKey: "deepseek-key",
      provider: "custom",
      baseUrl: "https://api.deepseek.com",
      modelName: null,
    });
    mocks.generateAiText.mockResolvedValue({
      text: '{"title":"T","results":[]}',
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await runPromptComparison("admin-user", {
      id: "task",
      contentA: "A",
      contentB: "B",
      input: "hello",
      taskType: "question",
    });

    expect(mocks.generateAiText.mock.calls[0][1]).toMatchObject({ model: "deepseek-flash" });
    expect(mocks.generateAiText.mock.calls[1][1]).toMatchObject({ model: "deepseek-flash" });
  });
});

describe("suggestPromptImprovement", () => {
  it("uses enough output budget for reasoning models", async () => {
    mocks.generateAiText.mockResolvedValueOnce({
      text: JSON.stringify({ issues: ["too vague"], revisedPrompt: "Be concrete." }),
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    const result = await suggestPromptImprovement("admin-user", {
      id: "task",
      content: "Answer briefly.",
      input: "hello",
      taskType: "question",
    });

    expect(mocks.generateAiText).toHaveBeenCalledTimes(1);
    expect(mocks.generateAiText.mock.calls[0][1]).toMatchObject({
      temperature: 0.3,
      maxTokens: 3000,
      model: "test-model",
    });
    expect(result.issues).toEqual(["too vague"]);
    expect(result.revisedPrompt).toBe("Be concrete.");
  });
});
