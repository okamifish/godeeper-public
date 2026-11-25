import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/auth.service", () => ({
  login: vi.fn(async () => ({
    token: "test-access-token",
    refreshToken: "test-refresh-token",
    user: { id: "10000000-0000-4000-8000-000000000002", email: "login-contract@godeeper.local" },
  })),
  register: vi.fn(),
  getUser: vi.fn(),
  updateApiKey: vi.fn(),
  getDecryptedApiKey: vi.fn(),
  deleteAuthUser: vi.fn(),
}));

import { app } from "../../src/app";

describe("POST /auth/login", () => {
  it("returns refreshToken so the client can renew the session silently", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "login-contract@godeeper.local", password: "test-password" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("test-access-token");
    expect(body.refreshToken).toBe("test-refresh-token");
  });
});
