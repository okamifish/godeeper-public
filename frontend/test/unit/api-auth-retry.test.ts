import { beforeEach, describe, expect, it, vi } from "vitest";

// 任务/画布请求 401 时，应先用刷新令牌换新再重试一次。
vi.mock("@/lib/auth", () => ({
  getToken: vi.fn(() => "stale-token"),
  refreshAccessToken: vi.fn(async () => "fresh-token"),
}));

import { api } from "@/lib/api";
import { refreshAccessToken } from "@/lib/auth";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("APIService 401 retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
  });

  it("refreshes once and retries a business request", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

    const result = await api.listCanvases();

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe("Bearer fresh-token");
    expect(result).toEqual({ ok: true });
  });

  it("does not refresh when an auth endpoint returns 401", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid token" }),
    });

    await expect(api.updateApiKey({ apiKey: "k", provider: "custom" })).rejects.toThrow("Invalid token");

    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
