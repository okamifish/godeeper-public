import { describe, expect, it } from "vitest";
import { MAX_NODE_BODY_CHARS, buildResultCatalogBody, clampNodeBody, estimateCatalogHeight } from "@/lib/node-body";

describe("node body guard", () => {
  it("clamps only at the technical guard", () => {
    expect(clampNodeBody("短正文")).toBe("短正文");
    const long = "字".repeat(MAX_NODE_BODY_CHARS + 50);
    expect(clampNodeBody(long)).toHaveLength(MAX_NODE_BODY_CHARS);
  });

  it("builds a searchable body from catalog items", () => {
    const body = buildResultCatalogBody([
      { id: "1", title: "表示层", body: "向量、嵌入" },
      { id: "2", title: "目标层", body: "损失函数" },
    ]);

    expect(body).toBe("表示层\n向量、嵌入\n\n目标层\n损失函数");
  });

  it("estimates a bounded height for long catalogs", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      title: `答案 ${i}`,
      body: "长".repeat(800),
    }));

    expect(estimateCatalogHeight(items)).toBeLessThanOrEqual(720);
    expect(estimateCatalogHeight(items)).toBeGreaterThan(600);
  });
});
