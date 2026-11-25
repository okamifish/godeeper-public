import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "50000000-0000-4000-8000-000000000008",
      email: "admin-prompt-playground@godeeper.local",
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

vi.mock("../../src/services/ai.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/ai.service")>();
  return {
    ...actual,
    runPromptComparison: vi.fn(async (_userId: string, input: any) => {
      if (input.id.startsWith("source:")) {
        throw new Error("USER_TEMPLATE_NOT_RUNNABLE");
      }
      return {
        id: input.id,
        taskType: input.taskType ?? "question",
        systemA: input.contentA,
        systemB: input.contentB,
        userMessage: input.input,
        a: {
          raw: "A-RESULT",
          parsed: null,
          usage: { inputTokens: 10, outputTokens: 5 },
          durationMs: 100,
        },
        b: {
          raw: "B-RESULT",
          parsed: null,
          usage: { inputTokens: 11, outputTokens: 6 },
          durationMs: 120,
          error: "B_FAILED",
        },
      };
    }),
    suggestPromptImprovement: vi.fn(async () => ({
      issues: ["too vague"],
      revisedPrompt: "REVISED PROMPT",
      raw: "",
    })),
  };
});

import { app } from "../../src/app";

async function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin prompt playground", () => {
  it("returns both A and B results, including a failed side", async () => {
    const res = await post("/admin/prompts/test", {
      id: "task",
      contentA: "SAVED PROMPT",
      contentB: "DRAFT PROMPT",
      input: "Explain recursion",
      taskType: "question",
    });
    expect(res.status).toBe(200);

    const body = await res.json() as {
      taskType: string;
      systemA: string;
      systemB: string;
      a: { raw: string; durationMs: number };
      b: { raw: string; error?: string };
    };
    expect(body.taskType).toBe("question");
    expect(body.systemA).toBe("SAVED PROMPT");
    expect(body.systemB).toBe("DRAFT PROMPT");
    expect(body.a.raw).toBe("A-RESULT");
    expect(body.a.durationMs).toBe(100);
    expect(body.b.raw).toBe("B-RESULT");
    expect(body.b.error).toBe("B_FAILED");
  });

  it("rejects user templates in the runnable test bench", async () => {
    const res = await post("/admin/prompts/test", {
      id: "source:url-import",
      contentA: "{{url}} {{fragmentCount}} {{pageText}}",
      contentB: "{{url}} {{fragmentCount}} {{pageText}}",
      input: "ignored",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("USER_TEMPLATE_NOT_RUNNABLE");
  });

  it("requires test input", async () => {
    const res = await post("/admin/prompts/test", {
      id: "task",
      contentA: "A",
      contentB: "B",
      input: "   ",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("INVALID_INPUT");
  });

  it("returns AI suggestions and validates the draft first", async () => {
    const ok = await post("/admin/prompts/suggest", {
      id: "task",
      content: "CURRENT PROMPT",
      input: "Explain recursion",
    });
    expect(ok.status).toBe(200);
    const body = await ok.json() as { issues: string[]; revisedPrompt: string };
    expect(body.issues).toEqual(["too vague"]);
    expect(body.revisedPrompt).toBe("REVISED PROMPT");

    const missingVariable = await post("/admin/prompts/suggest", {
      id: "expand:insight",
      content: "{{summary}}",
    });
    expect(missingVariable.status).toBe(400);
  });
});
