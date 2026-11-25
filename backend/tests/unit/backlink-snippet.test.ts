import { describe, expect, it } from "vitest";
import { backlinkSnippet } from "../../src/lib/backlink";

const mention = "[目标节点](gd://c/11111111-1111-1111-1111-111111111111/n/node-1)";

describe("backlinkSnippet", () => {
  it("短正文原样返回", () => {
    expect(backlinkSnippet("hello")).toBe("hello");
  });

  it("超长但不含提及时按长度截断", () => {
    expect(backlinkSnippet("a".repeat(10), 4)).toBe("aaaa");
  });

  it("提及 token 被截断时整段丢弃，不留下生 ID", () => {
    const body = `前缀 ${mention} 后缀`;
    const cut = body.indexOf("gd://") + 2;
    expect(backlinkSnippet(body, cut)).toBe("前缀 ");
  });

  it("完整提及 token 在长度内时保留", () => {
    const body = `前缀 ${mention}`;
    expect(backlinkSnippet(body, body.length)).toBe(body);
  });
});
