import { describe, expect, it } from "vitest";
import { isUuid } from "../../src/lib/params";

describe("params.isUuid", () => {
  it("accepts a valid uuid", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000000")).toBe(true);
  });

  it("rejects plain ids and malformed values", () => {
    expect(isUuid("canvas-1")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
