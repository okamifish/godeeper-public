import { describe, expect, it } from "vitest";
import { SafeFetchError, safeFetchText } from "../../src/lib/safe-fetch";

describe("safeFetchText", () => {
  it("blocks loopback addresses", async () => {
    await expect(safeFetchText("http://127.0.0.1:54321")).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("blocks cloud metadata addresses", async () => {
    await expect(safeFetchText("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("rejects non-http protocols", async () => {
    await expect(safeFetchText("ftp://example.com/file")).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("rejects malformed urls", async () => {
    await expect(safeFetchText("not-a-url")).rejects.toBeInstanceOf(SafeFetchError);
  });
});
