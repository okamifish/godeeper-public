import { describe, expect, it } from "vitest";
import { normalizePlanLimits } from "../../src/lib/plan-limits";

describe("plan limits", () => {
  it("honors a free plan row with unlimited nodes", () => {
    expect(normalizePlanLimits({
      canvasesLimit: 1,
      nodesPerCanvas: -1,
      aiTasksPerDay: 10,
      isUnlimited: false,
    })).toEqual({ canvases: 1, nodesPerCanvas: Infinity, aiTasksPerDay: 10 });
  });

  it("treats AI tasks per day 0 as unlimited", () => {
    expect(normalizePlanLimits({
      canvasesLimit: 2,
      nodesPerCanvas: 50,
      aiTasksPerDay: 0,
      isUnlimited: false,
    })).toEqual({ canvases: 2, nodesPerCanvas: 50, aiTasksPerDay: Infinity });
  });

  it("treats canvases limit -1 as unlimited", () => {
    expect(normalizePlanLimits({
      canvasesLimit: -1,
      nodesPerCanvas: 100,
      aiTasksPerDay: 10,
      isUnlimited: false,
    })).toEqual({ canvases: Infinity, nodesPerCanvas: 100, aiTasksPerDay: 10 });
  });

  it("isUnlimited overrides all three limits", () => {
    expect(normalizePlanLimits({
      canvasesLimit: 3,
      nodesPerCanvas: 50,
      aiTasksPerDay: 10,
      isUnlimited: true,
    })).toEqual({ canvases: Infinity, nodesPerCanvas: Infinity, aiTasksPerDay: Infinity });
  });
});
