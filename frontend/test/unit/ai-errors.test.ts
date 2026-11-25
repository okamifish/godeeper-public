import { describe, it, expect } from "vitest";
import { aiErrorMessage } from "@/lib/ai-errors";

describe("aiErrorMessage", () => {
  it("maps known backend codes to user-facing text", () => {
    expect(aiErrorMessage("INSUFFICIENT_CREDITS", "zh")).toContain("credits");
    expect(aiErrorMessage("AI_DAILY_LIMIT", "zh")).toContain("托管 AI");
    expect(aiErrorMessage("AI_NOT_CONFIGURED", "zh")).toBe("请先在设置中配置模型");
  });

  it("keeps unknown messages unchanged", () => {
    expect(aiErrorMessage("HTTP 500", "en")).toBe("HTTP 500");
  });
});
