import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/prompts/resolver", () => ({
  resolvePrompt: vi.fn(async () => "judge question depth"),
}));

import { evaluateQuestionDepth, resetQualityRateLimits } from "../../src/services/jev.service";

function mockJevResponse(choice: string, confidence: number) {
  return {
    ok: true,
    json: async () => ({
      model: "jev-1.13.0",
      answers: {
        quality: {
          type: "choice",
          choice,
          probabilities: { [choice]: confidence },
          confidence,
        },
      },
      usage: { input_tokens: 100 },
    }),
  } as Response;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubEnv("JEV_API_KEY", "test-key");
  vi.stubEnv("JEV_MOCK_RESULT", "");
  vi.stubEnv("JEV_MIN_CONFIDENCE", "0.80");
  vi.stubEnv("JEV_DAILY_LIMIT_PER_USER", "200");
  resetQualityRateLimits();
});

describe("evaluateQuestionDepth", () => {
  it("returns the mocked result without calling JEV", async () => {
    vi.stubEnv("JEV_MOCK_RESULT", "qualified");
    vi.stubEnv("JEV_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await evaluateQuestionDepth({ userId: "u1", question: "Why?" });
    expect(result.status).toBe("qualified");
    expect(result.model).toBe("jev-mock");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns disabled when no key is configured", async () => {
    vi.stubEnv("JEV_API_KEY", "");
    const result = await evaluateQuestionDepth({ userId: "u1", question: "Why?" });
    expect(result.status).toBe("disabled");
  });

  it("returns qualified for a high-confidence QUALIFIED choice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockJevResponse("QUALIFIED", 0.95)));
    const result = await evaluateQuestionDepth({ userId: "u1", question: "Why?" });
    expect(result.status).toBe("qualified");
    expect(result.confidence).toBeCloseTo(0.95);
  });

  it("downgrades a low-confidence QUALIFIED to normal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockJevResponse("QUALIFIED", 0.79)));
    const result = await evaluateQuestionDepth({ userId: "u1", question: "Why?" });
    expect(result.status).toBe("normal");
  });

  it("keeps NORMAL as normal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockJevResponse("NORMAL", 0.9)));
    const result = await evaluateQuestionDepth({ userId: "u1", question: "Why?" });
    expect(result.status).toBe("normal");
  });

  it("returns skipped when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const result = await evaluateQuestionDepth({ userId: "u1", question: "Why?" });
    expect(result.status).toBe("skipped");
  });

  it("returns skipped when JEV responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    const result = await evaluateQuestionDepth({ userId: "u1", question: "Why?" });
    expect(result.status).toBe("skipped");
  });

  it("enforces the per-user daily limit", async () => {
    vi.stubEnv("JEV_DAILY_LIMIT_PER_USER", "1");
    vi.stubGlobal("fetch", vi.fn(async () => mockJevResponse("NORMAL", 0.9)));
    const first = await evaluateQuestionDepth({ userId: "u1", question: "Why?" });
    const second = await evaluateQuestionDepth({ userId: "u1", question: "Why?" });
    expect(first.status).toBe("normal");
    expect(second.status).toBe("rate_limited");
  });
});
