import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { promptTemplates } from "../../src/db/schema";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "50000000-0000-4000-8000-000000000007",
      email: "admin-prompt-edit@godeeper.local",
      display_name: null,
      membership: "pro",
      api_key_enc: null,
      api_provider: null,
    });
    await next();
  },
}));

vi.mock("../../src/middleware/admin", () => ({
  adminMiddleware: async (_c: any, next: any) => {
    await next();
  },
}));

import { app } from "../../src/app";
import { getPromptDefault } from "../../src/prompts/catalog";

const FEATURES = ["expand", "source:url-import", "source:text-import", "task:question"];

async function cleanup() {
  for (const feature of FEATURES) {
    await db.delete(promptTemplates).where(eq(promptTemplates.feature, feature));
  }
}

async function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function put(path: string, body: unknown) {
  return app.request(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(cleanup);

describe("admin prompt editing", () => {
  it("rejects content that drops required variables", async () => {
    const res = await post("/admin/prompts", {
      feature: "source:url-import",
      content: "URL: {{url}}",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toContain("fragmentCount");
    expect(body.message).toContain("pageText");
  });

  it("rejects undeclared variables", async () => {
    const res = await post("/admin/prompts", {
      feature: "expand:insight",
      content: "{{summary}} {{pointText}} {{bogus}}",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toContain("bogus");
  });

  it("saves, reads, updates, and removes an override", async () => {
    const content = "CUSTOM {{url}} {{fragmentCount}} {{pageText}}";
    const created = await post("/admin/prompts", {
      feature: "source:url-import",
      content,
    });
    expect(created.status).toBe(201);

    const effective = await app.request("/admin/prompts/effective?feature=source:url-import");
    expect(effective.status).toBe(200);
    const effectiveBody = await effective.json() as { source: string; content: string; version: number };
    expect(effectiveBody.source).toBe("database");
    expect(effectiveBody.content).toBe(content);
    expect(effectiveBody.version).toBe(1);

    const row = await db.select().from(promptTemplates).where(eq(promptTemplates.feature, "source:url-import"));
    expect(row).toHaveLength(1);

    const updated = await put(`/admin/prompts/${row[0].id}`, {
      content: "UPDATED {{url}} {{fragmentCount}} {{pageText}}",
    });
    expect(updated.status).toBe(200);

    const after = await app.request("/admin/prompts/effective?feature=source:url-import");
    const afterBody = await after.json() as { content: string; version: number };
    expect(afterBody.content).toBe("UPDATED {{url}} {{fragmentCount}} {{pageText}}");
    expect(afterBody.version).toBe(2);

    const removed = await app.request(`/admin/prompts/${row[0].id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);

    const fallback = await app.request("/admin/prompts/effective?feature=source:url-import");
    const fallbackBody = await fallback.json() as { source: string; content: string };
    expect(fallbackBody.source).toBe("default");
    expect(fallbackBody.content).toBe(getPromptDefault("source:url-import"));
  });

  it("rejects a second override for the same prompt", async () => {
    const content = "CUSTOM {{url}} {{fragmentCount}} {{pageText}}";
    expect((await post("/admin/prompts", { feature: "source:url-import", content })).status).toBe(201);

    const duplicate = await post("/admin/prompts", { feature: "source:url-import", content });
    expect(duplicate.status).toBe(400);
    const body = await duplicate.json() as { error: string };
    expect(body.error).toBe("DUPLICATE_PROMPT_FEATURE");
  });

  it("previews a user template without calling a model", async () => {
    const res = await post("/admin/prompts/preview", {
      id: "source:url-import",
      content: "PREVIEW {{url}} {{fragmentCount}} {{pageText}}",
      variables: { url: "https://example.com", fragmentCount: 2, pageText: "abc" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { systemPrompt: string; userMessage: string; scope: string };
    expect(body.scope).toBe("user");
    expect(body.systemPrompt).toBe("");
    expect(body.userMessage).toBe("PREVIEW https://example.com 2 abc");
  });

  it("previews the assembled task prompt", async () => {
    const res = await post("/admin/prompts/preview", {
      id: "task",
      content: "BASE PROMPT",
      taskType: "compare",
      input: "Compare A and B",
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { systemPrompt: string; userMessage: string };
    expect(body.systemPrompt).toContain("BASE PROMPT");
    expect(body.systemPrompt).toContain('"results"');
    expect(body.systemPrompt).toContain("Task intent: compare");
    expect(body.userMessage).toBe("Compare A and B");
  });
});
