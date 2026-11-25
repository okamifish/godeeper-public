import { describe, expect, it } from "vitest";
import { capabilitiesFor, hasCapability, normalizeMembership } from "../../src/lib/capabilities";

describe("frontend capabilities", () => {
  it("uses the server-provided capability list when present", () => {
    const user = { membership: "pro", capabilities: ["canvas.cloud", "canvas.restore"] };
    expect(hasCapability(user, "canvas.restore")).toBe(true);
    expect(hasCapability(user, "search.crossCanvas")).toBe(false);
  });

  it("falls back to the membership matrix for legacy cached users", () => {
    expect(hasCapability({ membership: "pro" }, "canvas.restore")).toBe(true);
    expect(hasCapability({ membership: "team" }, "mention.crossCanvas")).toBe(true);
    expect(hasCapability({ membership: "free" }, "canvas.restore")).toBe(false);
  });

  it("treats missing or unknown users as free", () => {
    expect(hasCapability(null, "canvas.restore")).toBe(false);
    expect(hasCapability({ membership: "enterprise" }, "canvas.restore")).toBe(false);
    expect(normalizeMembership(undefined)).toBe("free");
  });

  it("returns the expected capability sets", () => {
    expect(capabilitiesFor("free")).toEqual(["canvas.cloud"]);
    expect(capabilitiesFor("pro")).toContain("canvas.restore");
    expect(capabilitiesFor("pro")).not.toContain("team.collab");
    expect(capabilitiesFor("team")).toContain("team.collab");
  });
});
