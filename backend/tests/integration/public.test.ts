import { describe, expect, it } from "vitest";
import { app } from "../../src/app";

describe("public endpoints", () => {
  it("reports health with database status", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; dbOk: boolean };
    expect(body.status).toBe("ok");
    expect(typeof body.dbOk).toBe("boolean");
  });

  it("rejects protected routes without a token", async () => {
    for (const path of ["/canvas", "/node/search?q=x", "/task/x/run", "/share/view/00000000-0000-4000-8000-000000000000"]) {
      const init = path.includes("/run")
        ? { method: "POST", body: JSON.stringify({ prompt: "x" }), headers: { "content-type": "application/json" } }
        : undefined;
      const res = await app.request(path, init);
      expect(res.status, path).toBe(401);
    }
  });

  it("returns 400 for an invalid login payload", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email", password: "x" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("does not expose experimental knowledge routes", async () => {
    const res = await app.request("/knowledge/similar/any-node");
    expect(res.status).toBe(404);
  });
});
