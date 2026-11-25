import { describe, expect, it, vi } from "vitest";
import * as proBackend from "@godeeper/pro-backend";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "70000000-0000-4000-8000-000000000001",
      email: "ai-gate@godeeper.local",
      display_name: null,
      membership: c.req.header("x-test-membership") ?? "pro",
      api_key_enc: null,
      api_provider: null,
    });
    await next();
  },
}));

vi.mock("../../src/middleware/ai-config", () => ({
  requireAiConfig: async (c: any, next: any) => {
    c.set("aiModel", "test-model");
    await next();
  },
}));

import { app } from "../../src/app";

const proEnabled = (proBackend as { edition?: string }).edition === "pro";

function headers(membership?: string) {
  return {
    "Content-Type": "application/json",
    ...(membership ? { "x-test-membership": membership } : {}),
  };
}

// 社区版没有 Pro 服务：即使会员是 pro，也不能调用这四个 Pro AI 能力。
describe.skipIf(proEnabled)("community edition pro AI gates", () => {
  it("denies concept explanation for free and pro members", async () => {
    for (const membership of ["free", "pro"]) {
      const res = await app.request("/ai/explain-concept", {
        method: "POST",
        headers: headers(membership),
        body: JSON.stringify({ term: "留存", context: [] }),
      });
      expect(res.status).toBe(403);
      const body = await res.json() as { code?: string; capability?: string };
      expect(body.code).toBe("CAPABILITY_REQUIRED");
      expect(body.capability).toBe("ai.concept");
    }
  });

  it("denies socratic questioning even for pro membership", async () => {
    const res = await app.request("/ai/socratic", {
      method: "POST",
      headers: headers("pro"),
      body: JSON.stringify({ action: "start", source: "claim" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { capability?: string };
    expect(body.capability).toBe("ai.socratic");
  });

  it("denies report organization even for pro membership", async () => {
    const res = await app.request("/ai/organize-report", {
      method: "POST",
      headers: headers("pro"),
      body: JSON.stringify({
        scope: { mode: "canvas", rootNodeIds: ["a"], nodeIds: ["a"], edgeIds: [] },
        canvas: { name: "test", locale: "zh", guideMode: false },
        nodes: [{ id: "a", kind: "task", title: "Q", body: "Q" }],
        edges: [],
        groups: [],
        concepts: [],
      }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { capability?: string };
    expect(body.capability).toBe("report.aiOrganize");
  });

  it("denies guided task runs for free and pro members", async () => {
    for (const membership of ["free", "pro"]) {
      const res = await app.request("/task/t1/run", {
        method: "POST",
        headers: headers(membership),
        body: JSON.stringify({ prompt: "Q", guideMode: true }),
      });
      expect(res.status).toBe(403);
      const body = await res.json() as { code?: string; capability?: string };
      expect(body.code).toBe("CAPABILITY_REQUIRED");
      expect(body.capability).toBe("ai.guided");
    }
  });
});
