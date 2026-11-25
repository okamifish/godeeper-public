import { describe, expect, it } from "vitest";
import type { ReportGraphInput } from "@/lib/report-graph";
import {
  estimateReportRequest,
  estimateTextTokens,
  getModelContextLimit,
} from "@/lib/report-estimate";

function graph(nodeCount: number, body = "正文内容"): ReportGraphInput {
  return {
    scope: {
      mode: "canvas",
      rootNodeIds: ["n0"],
      nodeIds: Array.from({ length: nodeCount }, (_, index) => `n${index}`),
      edgeIds: [],
    },
    canvas: { name: "测试", locale: "zh", guideMode: false },
    nodes: Array.from({ length: nodeCount }, (_, index) => ({
      id: `n${index}`,
      kind: "task" as const,
      title: `问题 ${index}`,
      body,
    })),
    edges: [],
    groups: [],
    concepts: [],
  };
}

describe("report estimate", () => {
  it("estimates Chinese text conservatively", () => {
    expect(estimateTextTokens("这是中文正文")).toBeGreaterThanOrEqual(6);
    expect(estimateTextTokens("hello world")).toBeLessThan(6);
  });

  it("uses conservative context limits for known models", () => {
    expect(getModelContextLimit("deepseek-chat")).toBe(128_000);
    expect(getModelContextLimit("claude-sonnet")).toBe(200_000);
    expect(getModelContextLimit("unknown-model")).toBe(64_000);
  });

  it("returns a token range and one credit for hosted calls", () => {
    const estimate = estimateReportRequest(graph(20));
    expect(estimate.inputTokens).toBeGreaterThan(0);
    expect(estimate.outputTokens.min).toBeGreaterThan(0);
    expect(estimate.outputTokens.max).toBeGreaterThan(estimate.outputTokens.min);
    expect(estimate.credits).toBe(1);
    expect(estimate.byok).toBe(false);
    expect(estimate.contextOk).toBe(true);
  });

  it("flags an oversized selection before calling AI", () => {
    const estimate = estimateReportRequest(graph(600, "很长的正文".repeat(2000)));
    expect(estimate.contextOk).toBe(false);
    expect(estimate.contextUsage).toBeGreaterThan(0.9);
  });

  it("does not charge credits for BYOK", () => {
    const estimate = estimateReportRequest(graph(10), { byok: true });
    expect(estimate.credits).toBe(0);
    expect(estimate.byok).toBe(true);
  });
});
