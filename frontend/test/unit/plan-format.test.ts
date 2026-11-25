import { describe, it, expect } from "vitest";
import { formatPlanLimit, formatPlanUsage, formatCredits } from "@/lib/plan-format";

describe("plan format", () => {
  it("treats null, negative and non-finite limits as unlimited", () => {
    expect(formatPlanLimit(null)).toBe("不限");
    expect(formatPlanLimit(undefined)).toBe("不限");
    expect(formatPlanLimit(-1)).toBe("不限");
    expect(formatPlanLimit(Infinity)).toBe("不限");
  });

  it("formats finite limits and usage", () => {
    expect(formatPlanLimit(0)).toBe("0");
    expect(formatPlanLimit(1)).toBe("1");
    expect(formatPlanUsage(1, 1)).toBe("1 / 1");
    expect(formatPlanUsage(5, null)).toBe("5 / 不限");
  });

  it("supports a custom unlimited label", () => {
    expect(formatPlanLimit(null, "Unlimited")).toBe("Unlimited");
    expect(formatPlanUsage(2, null, "Unlimited")).toBe("2 / Unlimited");
  });

  it("formats credits", () => {
    expect(formatCredits({ taskRun: 10, inspire: 5, summary: 3 })).toBe("10 / 5 / 3");
  });
});
