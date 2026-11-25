import { describe, expect, it } from "vitest";
import {
  estimateHostedAiCostUsd,
  HOSTED_AI_INPUT_USD_PER_1M,
  HOSTED_AI_OUTPUT_USD_PER_1M,
} from "../../src/lib/pricing";

describe("hosted AI pricing", () => {
  it("uses GPT-6 Astra standard input price", () => {
    expect(HOSTED_AI_INPUT_USD_PER_1M).toBe(10);
    expect(estimateHostedAiCostUsd(1_000_000, 0)).toBe("10.000000");
  });

  it("uses GPT-6 Astra standard output price", () => {
    expect(HOSTED_AI_OUTPUT_USD_PER_1M).toBe(50);
    expect(estimateHostedAiCostUsd(0, 1_000_000)).toBe("50.000000");
  });

  it("adds input and output tokens", () => {
    expect(estimateHostedAiCostUsd(1_000, 2_000)).toBe("0.110000");
  });

  it("does not invent a cost when usage is missing", () => {
    expect(estimateHostedAiCostUsd(undefined, undefined)).toBeUndefined();
  });
});
