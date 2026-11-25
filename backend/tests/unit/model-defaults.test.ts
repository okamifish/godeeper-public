import { describe, expect, it } from "vitest";
import { resolveDefaultModel } from "../../src/lib/model-defaults";

describe("resolveDefaultModel", () => {
  it("uses deepseek-flash for DeepSeek providers", () => {
    expect(resolveDefaultModel("DeepSeek", null)).toBe("deepseek-flash");
    expect(resolveDefaultModel("custom", "https://api.deepseek.com")).toBe("deepseek-flash");
  });

  it("keeps gpt-4o for OpenAI-compatible providers", () => {
    expect(resolveDefaultModel("openai", null)).toBe("gpt-4o");
    expect(resolveDefaultModel("openrouter", null)).toBe("gpt-4o");
    expect(resolveDefaultModel(null, null)).toBe("gpt-4o");
  });
});
