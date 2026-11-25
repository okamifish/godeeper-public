import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "40000000-0000-4000-8000-000000000004",
      email: "import-quota@godeeper.local",
      display_name: null,
      membership: "free",
      api_key_enc: null,
      api_provider: null,
    });
    await next();
  },
}));

// 本测试只验证导入额度；AI 配置中间件由其他测试覆盖，这里直接放行。
vi.mock("../../src/middleware/ai-config", () => ({
  requireAiConfig: async (c: any, next: any) => {
    c.set("aiModel", "test-model");
    await next();
  },
}));

// 不调用真实模型、不抓真实 URL；保留其余导出，避免 app 初始化缺依赖。
vi.mock("../../src/services/ai.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/ai.service")>();
  return {
    ...actual,
    analyzeSource: vi.fn(),
    fetchUrlText: vi.fn(),
    analyzePdfSource: vi.fn(),
  };
});

import { app } from "../../src/app";
import { db } from "../../src/db";
import { aiUsage, credits, creditTransactions, users } from "../../src/db/schema";
import * as aiService from "../../src/services/ai.service";
import { removeUser, resetUser } from "../helpers/db";

const USER_ID = "40000000-0000-4000-8000-000000000004";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function jsonPost(body: unknown) {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  };
}

async function runImport(kind: "text" | "url" | "file"): Promise<Response> {
  if (kind === "text") {
    return app.request("/import/text", jsonPost({
      text: "A short note about context windows and follow-up questions.",
      fragmentCount: 3,
    }));
  }
  if (kind === "url") {
    return app.request("/import/url", jsonPost({
      url: "https://example.com/article",
      fragmentCount: 3,
    }));
  }

  const form = new FormData();
  form.append("file", new Blob(["A short text file used for import quota tests."], { type: "text/plain" }), "note.txt");
  form.append("fragmentCount", "3");
  return app.request("/import/file", { method: "POST", body: form });
}

async function seedUsage(count: number) {
  if (count <= 0) return;
  await db.insert(aiUsage).values(
    Array.from({ length: count }, () => ({
      userId: USER_ID,
      date: today(),
      feature: "source",
      status: "success",
    })),
  );
}

async function usageCount(): Promise<number> {
  const rows = await db.select().from(aiUsage).where(eq(aiUsage.userId, USER_ID));
  return rows.length;
}

async function creditBalance(): Promise<number> {
  const [row] = await db.select().from(credits).where(eq(credits.userId, USER_ID));
  return row?.taskRun ?? 0;
}

async function resetUsage() {
  await db.delete(aiUsage).where(eq(aiUsage.userId, USER_ID));
  await db.delete(creditTransactions).where(eq(creditTransactions.userId, USER_ID));
  await db.delete(credits).where(eq(credits.userId, USER_ID));
  await db.update(users).set({ apiKeyEnc: null, apiProvider: null }).where(eq(users.id, USER_ID));
}

function analyzeSourceSuccess() {
  return async (
    _userId: string,
    _prompt: string,
    _model: string | undefined,
    onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void,
  ) => {
    onUsage?.({ inputTokens: 12, outputTokens: 34 });
    return {
      title: "Imported note",
      summary: "A short summary",
      keyPoints: [
        { text: "Point 1", body: "Body 1" },
        { text: "Point 2", body: "Body 2" },
        { text: "Point 3", body: "Body 3" },
      ],
    };
  };
}

describe("import quota", () => {
  beforeAll(async () => {
    await resetUser(USER_ID, "import-quota@godeeper.local", "free");
  });

  afterAll(async () => {
    await removeUser(USER_ID);
  });

  beforeEach(async () => {
    await resetUsage();
    vi.mocked(aiService.analyzeSource).mockReset().mockImplementation(analyzeSourceSuccess());
    vi.mocked(aiService.fetchUrlText).mockReset().mockResolvedValue("Fetched page text");
    vi.mocked(aiService.analyzePdfSource).mockReset().mockResolvedValue({
      title: "PDF",
      summary: "PDF summary",
      keyPoints: [],
    });
  });

  for (const kind of ["text", "url", "file"] as const) {
    it(`blocks the 11th ${kind} import for a hosted free user`, async () => {
      await seedUsage(10);
      await db.insert(credits).values({ userId: USER_ID, taskRun: 11 });

      const res = await runImport(kind);
      expect(res.status).toBe(429);

      const body = await res.json() as { error?: string };
      expect(body.error).toBe("AI_DAILY_LIMIT");
      expect(await usageCount()).toBe(10);
      expect(await creditBalance()).toBe(11);
      expect(vi.mocked(aiService.analyzeSource)).not.toHaveBeenCalled();
      expect(vi.mocked(aiService.fetchUrlText)).not.toHaveBeenCalled();
      expect(vi.mocked(aiService.analyzePdfSource)).not.toHaveBeenCalled();
    });
  }

  it("allows the 11th import for a BYOK free user", async () => {
    await seedUsage(10);
    await db.update(users).set({ apiKeyEnc: "test-encrypted-key" }).where(eq(users.id, USER_ID));

    const res = await runImport("text");
    expect(res.status).toBe(200);
    expect(await usageCount()).toBe(11);
    expect(await creditBalance()).toBe(0);
    expect(vi.mocked(aiService.analyzeSource)).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(aiUsage).where(eq(aiUsage.userId, USER_ID));
    expect(rows.every((row) => Number(row.costUsd) === 0)).toBe(true);
  });

  it("charges one hosted credit and records tokens on success", async () => {
    await db.insert(credits).values({ userId: USER_ID, taskRun: 1 });

    const res = await runImport("text");
    expect(res.status).toBe(200);
    expect(await creditBalance()).toBe(0);

    const rows = await db.select().from(aiUsage).where(eq(aiUsage.userId, USER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("success");
    expect(rows[0].inputTokens).toBe(12);
    expect(rows[0].outputTokens).toBe(34);
    // GPT-6 Astra 标准价：12 输入 + 34 输出 = 0.00182 USD
    expect(Number(rows[0].costUsd)).toBeCloseTo(0.00182, 6);
  });

  it("refunds the hosted credit and removes the placeholder on failure", async () => {
    await db.insert(credits).values({ userId: USER_ID, taskRun: 1 });
    vi.mocked(aiService.analyzeSource).mockRejectedValueOnce(new Error("mock model failure"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await runImport("text");
      expect(res.status).toBe(500);
    } finally {
      errorSpy.mockRestore();
    }

    expect(await creditBalance()).toBe(1);
    expect(await usageCount()).toBe(0);
  });

});
