import { describe, expect, it, vi } from "vitest";
import * as proBackend from "@godeeper/pro-backend";

vi.mock("../../src/middleware/auth", () => ({
  authMiddleware: async (c: any, next: any) => {
    c.set("user", {
      id: "30000000-0000-4000-8000-000000000008",
      email: "restore-ce-pro@godeeper.local",
      display_name: null,
      membership: "pro",
      api_key_enc: null,
      api_provider: null,
    });
    await next();
  },
}));

import { app } from "../../src/app";

const proEnabled = (proBackend as { edition?: string }).edition === "pro";

// 社区版即使用户被标成 pro，也不应暴露 Pro 实现；避免“界面没有、接口可调”。
describe.skipIf(proEnabled)("community edition pro routes", () => {
  it("keeps trash and restore closed even for pro membership", async () => {
    const trash = await app.request("/canvas/trash");
    expect(trash.status).toBe(403);
    const trashBody = await trash.json() as { code?: string; capability?: string };
    expect(trashBody.code).toBe("CAPABILITY_REQUIRED");
    expect(trashBody.capability).toBe("canvas.restore");

    const restore = await app.request(
      "/canvas/30000000-0000-4000-8000-000000000099/restore",
      { method: "POST" },
    );
    expect(restore.status).toBe(403);
  });

  it("reports the community edition in health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json() as { edition?: string };
    expect(body.edition).toBe("stub");
  });
});
