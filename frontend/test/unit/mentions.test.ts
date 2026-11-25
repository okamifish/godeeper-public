import { describe, expect, it } from "vitest";
import type { GoDeeperFlowNode } from "@/lib/types";
import {
  countTextWithoutMentions,
  findLocalBacklinks,
  findMentionTrigger,
  formatMentionsForText,
  insertMention,
  mentionToken,
  parseMentionHref,
  parseMentions,
  resolveMentionLabel,
  sanitizeMentionLabel,
  splitMentions,
  extractMentionTargets,
} from "@/lib/mentions";

function makeNode(id: string, body: string, title = id): GoDeeperFlowNode {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { kind: "text", title, body },
  } as GoDeeperFlowNode;
}

const TARGET = { canvasId: "canvas-a", nodeId: "node-2", label: "目标卡片" };

describe("mention tokens", () => {
  it("builds and parses a mention token", () => {
    const token = mentionToken(TARGET);
    expect(token).toBe("[目标卡片](gd://c/canvas-a/n/node-2)");

    const mentions = parseMentions(`前文 ${token} 后文`);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({
      canvasId: "canvas-a",
      nodeId: "node-2",
      label: "目标卡片",
    });
    expect(mentions[0].start).toBe(3);
  });

  it("parses multiple mentions including cross-canvas", () => {
    const text = [
      mentionToken({ canvasId: "canvas-a", nodeId: "n1", label: "A" }),
      mentionToken({ canvasId: "canvas-b", nodeId: "n2", label: "B" }),
    ].join(" 和 ");

    const mentions = parseMentions(text);
    expect(mentions.map((item) => item.canvasId)).toEqual(["canvas-a", "canvas-b"]);
    expect(mentions.map((item) => item.nodeId)).toEqual(["n1", "n2"]);
  });

  it("parses a gd:// href", () => {
    expect(parseMentionHref("gd://c/canvas-a/n/node-2")).toEqual({
      canvasId: "canvas-a",
      nodeId: "node-2",
    });
    expect(parseMentionHref("https://example.com")).toBeNull();
  });

  it("sanitizes labels that would break Markdown", () => {
    expect(sanitizeMentionLabel("  a[b]\n c  ")).toBe("a b c");
    expect(mentionToken({ ...TARGET, label: "x]y" })).toBe("[x y](gd://c/canvas-a/n/node-2)");
  });
});

describe("mention editing", () => {
  it("replaces the @ query with a token", () => {
    const result = insertMention("看这个 @目标", { start: 4, end: 7 }, TARGET);
    expect(result.text).toBe("看这个 [目标卡片](gd://c/canvas-a/n/node-2)");
    expect(result.cursor).toBe(result.text.length);
  });

  it("detects an @ trigger at the caret", () => {
    expect(findMentionTrigger("看 @目标", 5)).toEqual({ start: 2, end: 5, query: "目标" });
    expect(findMentionTrigger("@a", 2)).toEqual({ start: 0, end: 2, query: "a" });
  });

  it("ignores emails, newlines and overlong queries", () => {
    expect(findMentionTrigger("mail@test", 9)).toBeNull();
    expect(findMentionTrigger("@a\nb", 4)).toBeNull();
    expect(findMentionTrigger(`@${"x".repeat(61)}`, 62)).toBeNull();
  });

  it("counts only text outside mentions", () => {
    const text = `正文 ${mentionToken(TARGET)}`;
    expect(countTextWithoutMentions(text)).toBe(3);
  });

  it("formats mentions for text with a resolver", () => {
    const text = `前 ${mentionToken(TARGET)} 后`;
    expect(formatMentionsForText(text)).toBe("前 @目标卡片 后");
    expect(formatMentionsForText(text, () => "新标题")).toBe("前 @新标题 后");
  });

  it("splits text and mentions into segments", () => {
    const text = `前 ${mentionToken(TARGET)} 后`;
    const segments = splitMentions(text);
    expect(segments.map((segment) => segment.type)).toEqual(["text", "mention", "text"]);
  });

  it("deduplicates targets", () => {
    const text = `${mentionToken(TARGET)} ${mentionToken(TARGET)}`;
    expect(extractMentionTargets(text)).toHaveLength(1);
  });

  it("does not treat a partial token as a mention", () => {
    const partial = "[目标](gd://c/canvas-a/n/node-2";
    expect(parseMentions(partial)).toHaveLength(0);
    expect(formatMentionsForText(partial)).toBe(partial);
  });

  it("keeps the 200-character boundary when a token is present", () => {
    const text = `${"字".repeat(200)}${mentionToken(TARGET)}`;
    expect(countTextWithoutMentions(text)).toBe(200);
  });

  it("treats punctuation before @ as a valid trigger", () => {
    expect(findMentionTrigger("看，（@目标", 6)).toEqual({ start: 3, end: 6, query: "目标" });
  });

  it("decodes URL-encoded mention ids", () => {
    expect(parseMentionHref("gd://c/canvas%20a/n/node%2F2")).toEqual({
      canvasId: "canvas a",
      nodeId: "node/2",
    });
  });
});

describe("backlinks", () => {
  it("finds local backlinks and excludes self mentions", () => {
    const targetToken = mentionToken(TARGET);
    const nodes = [
      makeNode("source-1", `引用 ${targetToken}`),
      makeNode("source-2", "没有引用"),
      makeNode("node-2", `自引用 ${targetToken}`),
    ];

    const hits = findLocalBacklinks(nodes, TARGET.canvasId, TARGET.nodeId);
    expect(hits.map((hit) => hit.node.id)).toEqual(["source-1"]);
  });

  it("returns one hit per source even when it mentions twice", () => {
    const token = mentionToken(TARGET);
    const nodes = [makeNode("source-1", `${token} 和 ${token}`)];
    expect(findLocalBacklinks(nodes, TARGET.canvasId, TARGET.nodeId)).toHaveLength(1);
  });

  it("resolves labels from the current canvas first", () => {
    const nodes = [makeNode("node-2", "", "实时标题")];
    expect(resolveMentionLabel(TARGET, nodes, "canvas-a")).toBe("实时标题");
    expect(resolveMentionLabel(TARGET, nodes, "canvas-b")).toBe(TARGET.label);
  });
});
