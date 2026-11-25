import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { promptTemplates } from "../../src/db/schema";
import { getEffectiveTaskParts, getEffectivePrompt, resolvePrompt } from "../../src/prompts/resolver";
import { getPromptDefault, renderPrompt } from "../../src/prompts/catalog";

const FEATURES = ["expand", "source:url-import", "task:question"];

async function cleanup() {
  for (const feature of FEATURES) {
    await db.delete(promptTemplates).where(eq(promptTemplates.feature, feature));
  }
}

afterEach(cleanup);

describe("prompt resolver", () => {
  it("falls back to the code default when no override exists", async () => {
    await cleanup();
    const effective = await getEffectivePrompt("expand");

    expect(effective.source).toBe("default");
    expect(effective.version).toBe(0);
    expect(effective.content).toBe(getPromptDefault("expand"));
    expect(await resolvePrompt("expand:insight", { summary: "S", pointText: "P" })).toContain("S");
  });

  it("uses the newest enabled database override", async () => {
    await cleanup();
    await db.insert(promptTemplates).values({
      name: "override-expand",
      feature: "expand",
      content: "OVERRIDE",
      enabled: true,
    });

    const effective = await getEffectivePrompt("expand");
    expect(effective.source).toBe("database");
    expect(effective.content).toBe("OVERRIDE");
    expect(effective.version).toBe(1);
    expect(await resolvePrompt("expand")).toBe("OVERRIDE");
  });

  it("ignores disabled overrides", async () => {
    await cleanup();
    await db.insert(promptTemplates).values({
      name: "disabled-expand",
      feature: "expand",
      content: "DISABLED",
      enabled: false,
    });

    const effective = await getEffectivePrompt("expand");
    expect(effective.source).toBe("default");
    expect(effective.content).toBe(getPromptDefault("expand"));
  });

  it("renders user templates from the override", async () => {
    await cleanup();
    const custom = "CUSTOM {{url}}\n{{fragmentCount}}\n{{pageText}}";
    await db.insert(promptTemplates).values({
      name: "override-url-import",
      feature: "source:url-import",
      content: custom,
      enabled: true,
    });

    const rendered = await resolvePrompt("source:url-import", {
      url: "https://example.com",
      fragmentCount: 3,
      pageText: "text",
    });
    expect(rendered).toBe("CUSTOM https://example.com\n3\ntext");
    expect(renderPrompt("source:url-import", {
      url: "https://example.com",
      fragmentCount: 3,
      pageText: "text",
    })).not.toBe(rendered);
  });

  it("assembles task prompt from base, contract, and type override", async () => {
    await cleanup();
    await db.insert(promptTemplates).values({
      name: "override-question",
      feature: "task:question",
      content: "CUSTOM TYPE INSTRUCTION",
      enabled: true,
    });

    const parts = await getEffectiveTaskParts("question");
    expect(parts.instruction.content).toBe("CUSTOM TYPE INSTRUCTION");
    expect(parts.systemPrompt).toContain(parts.base.content);
    expect(parts.systemPrompt).toContain(parts.contract.content);
    expect(parts.systemPrompt).toContain("CUSTOM TYPE INSTRUCTION");
    expect(parts.systemPrompt).toContain('"results"');
  });
});
