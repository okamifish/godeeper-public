import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

import { assertSafeBaseUrl, isSafeBaseUrl } from "../../src/lib/base-url";
import { isPrivateIp } from "../../src/lib/safe-fetch";

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  lookupMock.mockReset();
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("isSafeBaseUrl", () => {
  it("allows loopback http only outside production", () => {
    expect(isSafeBaseUrl("http://127.0.0.1:3001/v1")).toBe(true);
    expect(isSafeBaseUrl("http://localhost:8080/v1")).toBe(true);

    process.env.NODE_ENV = "production";
    expect(isSafeBaseUrl("http://127.0.0.1:3001/v1")).toBe(false);
    expect(isSafeBaseUrl("http://localhost:8080/v1")).toBe(false);
    expect(isSafeBaseUrl("https://localhost/v1")).toBe(false);
  });

  it("rejects private literals, userinfo, and non-http schemes", () => {
    expect(isSafeBaseUrl("https://10.0.0.1/v1")).toBe(false);
    expect(isSafeBaseUrl("https://100.100.100.200/v1")).toBe(false);
    expect(isSafeBaseUrl("https://[::ffff:127.0.0.1]/v1")).toBe(false);
    expect(isSafeBaseUrl("https://user:pass@api.example.com/v1")).toBe(false);
    expect(isSafeBaseUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeBaseUrl("https://api.deepseek.com")).toBe(true);
    expect(isSafeBaseUrl(undefined)).toBe(true);
  });
});

describe("assertSafeBaseUrl", () => {
  it("resolves hostnames and rejects private DNS answers", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(assertSafeBaseUrl("https://api.internal.example/v1")).rejects.toThrow(
      "baseUrl resolves to a private address",
    );
  });

  it("rejects CGNAT ranges returned by DNS", async () => {
    lookupMock.mockResolvedValue([{ address: "100.100.100.200", family: 4 }]);
    await expect(assertSafeBaseUrl("https://api.example.com/v1")).rejects.toThrow(
      "baseUrl resolves to a private address",
    );
  });

  it("allows public DNS answers and skips resolution for literals", async () => {
    lookupMock.mockResolvedValue([{ address: "1.1.1.1", family: 4 }]);
    await expect(assertSafeBaseUrl("https://api.example.com/v1")).resolves.toBeUndefined();
    expect(lookupMock).toHaveBeenCalledTimes(1);

    lookupMock.mockClear();
    await expect(assertSafeBaseUrl("https://1.1.1.1/v1")).resolves.toBeUndefined();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("fails closed when DNS resolution fails", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeBaseUrl("https://unresolved.example/v1")).rejects.toThrow(
      "Unable to resolve baseUrl host",
    );
  });
});

describe("isPrivateIp CGNAT coverage", () => {
  it("blocks 100.64.0.0/10 including the Alibaba metadata address", () => {
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("100.127.255.254")).toBe(true);
    expect(isPrivateIp("100.100.100.200")).toBe(true);
    expect(isPrivateIp("100.63.255.254")).toBe(false);
    expect(isPrivateIp("100.128.0.1")).toBe(false);
  });
});
