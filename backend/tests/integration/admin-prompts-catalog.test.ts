import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "50000000-0000-4000-8000-000000000006",
      email: "admin-prompts@godeeper.local",
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

describe("admin prompt catalog", () => {
  it("returns definitions with purpose and call sites", async () => {
    const res = await app.request("/admin/prompts/catalog");
    expect(res.status).toBe(200);

    const body = await res.json() as Array<{
      id: string;
      purpose: string;
      scope: string;
      usedBy: string[];
    }>;

    expect(body.length).toBeGreaterThan(0);
    const task = body.find((item) => item.id === "task");
    expect(task).toBeTruthy();
    expect(task?.purpose.length).toBeGreaterThan(0);
    expect(task?.usedBy.length).toBeGreaterThan(0);
    // 4 个苏格拉底用户模板已随 Pro 提示词移出公开目录，故从 13 降为 9。
    expect(body.filter((item) => item.scope === "user")).toHaveLength(9);
  });
});
