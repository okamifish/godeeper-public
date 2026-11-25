import { describe, expect, it } from "vitest";
import {
  CAPABILITY_IDS,
  capabilitiesFor,
  hasCapability,
  normalizeMembership,
  PLAN_CAPABILITIES,
} from "../../src/lib/capabilities";

describe("capabilities", () => {
  it("gives free members only the base cloud canvas capability", () => {
    expect(capabilitiesFor("free")).toEqual(["canvas.cloud"]);
  });

  it("gives pro members cloud, restore, cross-canvas and pro AI capabilities", () => {
    const caps = capabilitiesFor("pro");
    for (const id of [
      "canvas.cloud",
      "canvas.cloud.multi",
      "canvas.restore",
      "search.crossCanvas",
      "mention.crossCanvas",
      "ai.concept",
      "ai.socratic",
      "ai.guided",
      "report.aiOrganize",
      "export.pdf",
    ] as const) {
      expect(caps).toContain(id);
    }
    expect(caps).not.toContain("team.collab");
  });

  it("gives team members every pro capability plus team collaboration", () => {
    const caps = capabilitiesFor("team");
    for (const id of PLAN_CAPABILITIES.pro) {
      expect(caps).toContain(id);
    }
    expect(caps).toContain("team.collab");
  });

  it("treats unknown membership as free", () => {
    expect(normalizeMembership(null)).toBe("free");
    expect(normalizeMembership("")).toBe("free");
    expect(normalizeMembership("enterprise")).toBe("free");
    expect(hasCapability("enterprise", "canvas.restore")).toBe(false);
  });

  it("does not leak the internal matrix when callers mutate the result", () => {
    const caps = capabilitiesFor("free");
    caps.push("canvas.restore");
    expect(hasCapability("free", "canvas.restore")).toBe(false);
  });

  it("keeps every capability id addressable", () => {
    const known = new Set<string>(CAPABILITY_IDS);
    for (const id of PLAN_CAPABILITIES.pro) {
      expect(known.has(id)).toBe(true);
    }
    for (const id of PLAN_CAPABILITIES.team) {
      expect(known.has(id)).toBe(true);
    }
  });
});
