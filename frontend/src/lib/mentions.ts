import type { GoDeeperFlowNode } from "@/lib/types";

/** 卡片 @ 提及：正文里存轻量 Markdown 链接，画布内解析为 chip。 */
export interface MentionTarget {
  canvasId: string;
  nodeId: string;
  /** 插入时的标题快照；同画布优先实时解析 */
  label: string;
  canvasTitle?: string;
}

export interface ParsedMention extends MentionTarget {
  start: number;
  end: number;
  raw: string;
}

export interface MentionTrigger {
  start: number;
  end: number;
  query: string;
}

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; mention: ParsedMention };

export interface LocalBacklinkHit {
  node: GoDeeperFlowNode;
  label: string;
}

const MENTION_SOURCE = String.raw`\[([^\[\]]*)\]\(gd://c/([^/)]+)/n/([^)]+)\)`;
const MENTION_HREF_SOURCE = String.raw`^gd://c/([^/]+)/n/(.+)$`;

export function sanitizeMentionLabel(label: string): string {
  return label
    .replace(/[\[\]\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function mentionToken(target: MentionTarget): string {
  return `[${sanitizeMentionLabel(target.label)}](gd://c/${target.canvasId}/n/${target.nodeId})`;
}

export function parseMentions(text: string): ParsedMention[] {
  if (!text) return [];
  const regex = new RegExp(MENTION_SOURCE, "g");
  const mentions: ParsedMention[] = [];
  for (const match of text.matchAll(regex)) {
    const raw = match[0];
    const start = match.index ?? 0;
    mentions.push({
      label: match[1] ?? "",
      canvasId: match[2] ?? "",
      nodeId: match[3] ?? "",
      start,
      end: start + raw.length,
      raw,
    });
  }
  return mentions;
}

export function parseMentionHref(href: string): { canvasId: string; nodeId: string } | null {
  const match = new RegExp(MENTION_HREF_SOURCE).exec(href);
  if (!match) return null;
  try {
    return { canvasId: decodeURIComponent(match[1]), nodeId: decodeURIComponent(match[2]) };
  } catch {
    return { canvasId: match[1], nodeId: match[2] };
  }
}

export function isMentionHref(href: string | undefined): boolean {
  return Boolean(href && href.startsWith("gd://c/"));
}

export interface InsertMentionResult {
  text: string;
  cursor: number;
}

/** 把光标处的 “@查询词” 替换成提及 token，光标停在 token 之后。 */
export function insertMention(
  text: string,
  range: { start: number; end: number },
  target: MentionTarget,
): InsertMentionResult {
  const token = mentionToken(target);
  return {
    text: `${text.slice(0, range.start)}${token}${text.slice(range.end)}`,
    cursor: range.start + token.length,
  };
}

/**
 * 检测光标前是否有一个可触发的 @。
 * - @ 必须在开头或空白/标点之后，避免邮箱误触
 * - 查询词不能跨行，最长 60 字
 */
export function findMentionTrigger(text: string, cursor: number): MentionTrigger | null {
  const before = text.slice(0, Math.max(0, cursor));
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && /[\w\u4e00-\u9fa5]/.test(text[at - 1] ?? "")) return null;

  const query = before.slice(at + 1);
  if (query.includes("\n") || query.includes("\r") || query.length > 60) return null;

  return { start: at, end: cursor, query };
}

export function splitMentions(text: string): MentionSegment[] {
  const mentions = parseMentions(text);
  if (mentions.length === 0) return [{ type: "text", text }];

  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const mention of mentions) {
    if (mention.start > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, mention.start) });
    }
    segments.push({ type: "mention", mention });
    cursor = mention.end;
  }
  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) });
  }
  return segments;
}

/** 纯文本场景（AI 上下文、搜索、Markdown 导出）统一把 token 还原成 @标题。 */
export function formatMentionsForText(
  text: string,
  resolveLabel?: (mention: ParsedMention) => string,
): string {
  return splitMentions(text)
    .map((segment) => (
      segment.type === "text"
        ? segment.text
        : `@${resolveLabel ? resolveLabel(segment.mention) : segment.mention.label}`
    ))
    .join("");
}

/** token 不占正文字数，避免链接把可写空间挤掉。 */
export function countTextWithoutMentions(text: string): number {
  return text.replace(new RegExp(MENTION_SOURCE, "g"), "").length;
}

export function extractMentionTargets(text: string): MentionTarget[] {
  const seen = new Set<string>();
  const targets: MentionTarget[] = [];
  for (const mention of parseMentions(text)) {
    const key = `${mention.canvasId}:${mention.nodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      canvasId: mention.canvasId,
      nodeId: mention.nodeId,
      label: mention.label,
    });
  }
  return targets;
}

/** 当前画布反链：扫描所有卡片正文，不做网络请求。 */
export function findLocalBacklinks(
  nodes: GoDeeperFlowNode[],
  targetCanvasId: string,
  targetNodeId: string,
): LocalBacklinkHit[] {
  const hits: LocalBacklinkHit[] = [];
  for (const node of nodes) {
    if (node.id === targetNodeId) continue;
    const mentions = parseMentions(node.data.body ?? "");
    const hit = mentions.find(
      (mention) => mention.canvasId === targetCanvasId && mention.nodeId === targetNodeId,
    );
    if (hit) hits.push({ node, label: hit.label });
  }
  return hits;
}

export function mentionSnippet(text: string, max = 120): string {
  return formatMentionsForText(text).replace(/\s+/g, " ").trim().slice(0, max);
}

// ─── 跨画布标题缓存 ───

const LABEL_CACHE_KEY = "godeeper-mention-labels";
const LABEL_CACHE_LIMIT = 500;

type MentionLabelCache = Record<string, { label: string; canvasTitle?: string }>;

export function mentionLabelKey(canvasId: string, nodeId: string): string {
  return `${canvasId}:${nodeId}`;
}

export function readMentionLabelCache(): MentionLabelCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LABEL_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as MentionLabelCache : {};
  } catch {
    return {};
  }
}

export function writeMentionLabelCache(target: MentionTarget): void {
  if (typeof window === "undefined" || !target.label.trim()) return;
  try {
    const cache = readMentionLabelCache();
    cache[mentionLabelKey(target.canvasId, target.nodeId)] = {
      label: target.label,
      canvasTitle: target.canvasTitle,
    };
    const keys = Object.keys(cache);
    if (keys.length > LABEL_CACHE_LIMIT) {
      for (const key of keys.slice(0, keys.length - LABEL_CACHE_LIMIT)) delete cache[key];
    }
    window.localStorage.setItem(LABEL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

/** 同画布读实时标题；跨画布读缓存，最后回退到插入时的快照。 */
export function resolveMentionLabel(
  target: Pick<MentionTarget, "canvasId" | "nodeId" | "label">,
  nodes: GoDeeperFlowNode[],
  activeCanvasId: string,
): string {
  if (target.canvasId === activeCanvasId) {
    const node = nodes.find((item) => item.id === target.nodeId);
    if (node?.data.title) return node.data.title;
  }
  const cached = readMentionLabelCache()[mentionLabelKey(target.canvasId, target.nodeId)];
  return cached?.label || target.label;
}
