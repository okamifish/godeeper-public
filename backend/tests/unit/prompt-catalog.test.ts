import { describe, expect, it } from "vitest";
import {
  PROMPT_CATALOG,
  PROMPT_CATALOG_BY_ID,
  SEED_PROMPTS,
  TASK_OUTPUT_CONTRACT,
  TASK_TYPE_INSTRUCTIONS,
  buildTaskSystemPromptContent,
  extractTemplateVariables,
  getPromptDefault,
  normalizeTaskType,
  renderPrompt,
  renderTemplateContent,
  validatePromptContent,
} from "../../src/prompts/catalog";

describe("prompt catalog", () => {
  it("gives every entry a purpose and at least one call site", () => {
    for (const item of PROMPT_CATALOG) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.purpose.length).toBeGreaterThan(0);
      expect(item.usedBy.length).toBeGreaterThan(0);
      expect(item.output.length).toBeGreaterThan(0);
      expect(item.content.length).toBeGreaterThan(0);
    }
  });

  it("keeps ids unique", () => {
    const ids = PROMPT_CATALOG.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(PROMPT_CATALOG_BY_ID)).toHaveLength(ids.length);
  });

  it("seeds the editable system prompts", () => {
    expect(SEED_PROMPTS.map((item) => item.feature).sort()).toEqual([
      "critique",
      "expand",
      "inspire",
      "source",
      "task",
    ]);
  });

  it("covers all nine task types and the output contract", () => {
    expect(Object.keys(TASK_TYPE_INSTRUCTIONS).sort()).toEqual([
      "analysis",
      "compare",
      "critique",
      "derive",
      "question",
      "report",
      "research",
      "summary",
      "verify",
    ]);
    expect(TASK_OUTPUT_CONTRACT).toContain('"results"');
  });

  it("keeps Pro prompts out of the public catalog", () => {
    for (const id of [
      "concept",
      "socratic",
      "socratic:summary",
      "organize",
      "task:guide",
      "task:guide-child",
      "socratic:start",
      "socratic:answer",
      "socratic:resume",
      "socratic:finish",
    ]) {
      expect(getPromptDefault(id)).toBeUndefined();
    }
  });

  it("keeps the task prompt focused on direct answers", () => {
    const task = getPromptDefault("task") ?? "";
    expect(task).toContain("answer the user's actual request directly");
    expect(task).toContain("Do not replace it with meta-advice");
  });

  it("renders user message templates with variables", () => {
    const prompt = renderPrompt("source:url-import", {
      url: "https://example.com",
      fragmentCount: 3,
      pageText: "Example content",
    });

    expect(prompt).toBe(
      "URL: https://example.com\n\nDecompose into 3 key viewpoints.\n\nContent:\nExample content",
    );
  });

  it("fails loudly for unknown templates and missing variables", () => {
    expect(() => renderPrompt("does:not-exist")).toThrow("UNKNOWN_PROMPT_TEMPLATE");
    expect(() => renderPrompt("source:url-import", { url: "https://example.com" })).toThrow(
      "MISSING_PROMPT_VARIABLE",
    );
  });

  it("does not leave placeholders in rendered templates", () => {
    const prompt = renderPrompt("expand:insight", { summary: "摘要", pointText: "观点" });
    expect(prompt).not.toContain("{{");
    expect(prompt).toContain("摘要");
    expect(prompt).toContain("观点");
  });

  it("keeps declared variables in sync with template placeholders", () => {
    for (const item of PROMPT_CATALOG) {
      expect(extractTemplateVariables(item.content).sort(), item.id).toEqual([...item.variables].sort());
    }
  });

  it("marks every catalog entry editable in admin", () => {
    expect(PROMPT_CATALOG.every((item) => item.editable)).toBe(true);
  });

  it("validates missing and unknown variables", () => {
    const missing = validatePromptContent("source:url-import", "URL: {{url}}");
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.missing).toEqual(["fragmentCount", "pageText"]);
      expect(missing.unknown).toEqual([]);
    }

    const unknown = validatePromptContent("expand:insight", "{{summary}} {{pointText}} {{bogus}}");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.missing).toEqual([]);
      expect(unknown.unknown).toEqual(["bogus"]);
    }

    expect(validatePromptContent("expand:insight", "{{summary}} {{pointText}}").ok).toBe(true);
  });

  it("renders arbitrary content and normalizes task types", () => {
    expect(renderTemplateContent("Hi {{name}}", "custom", { name: "Ada" })).toBe("Hi Ada");
    expect(() => renderTemplateContent("Hi {{name}}", "custom", {})).toThrow("MISSING_PROMPT_VARIABLE");
    expect(normalizeTaskType("compare")).toBe("compare");
    expect(normalizeTaskType("unknown")).toBe("question");
  });

  it("builds the task prompt as base + contract + type instruction", () => {
    const built = buildTaskSystemPromptContent("BASE", "CONTRACT", "TYPE");
    expect(built).toBe("BASE\n\nCONTRACT\n\nTYPE");

    const alreadyHasSchema = buildTaskSystemPromptContent('BASE {"results": []}', "CONTRACT", "TYPE");
    expect(alreadyHasSchema).toBe('BASE {"results": []}\n\nTYPE');
  });
});
