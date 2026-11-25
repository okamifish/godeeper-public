"use client";

import type { ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import {
  formatMentionsForText,
  isMentionHref,
  parseMentionHref,
  resolveMentionLabel,
} from "@/lib/mentions";

export function highlightPlainText(text: string, query: string): ReactNode {
  if (!query.trim() || !text) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let idx = lower.indexOf(q, 0);
  let key = 0;
  while (idx !== -1) {
    if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
    parts.push(<mark key={key++} className="search-highlight">{text.slice(idx, idx + q.length)}</mark>);
    lastIndex = idx + q.length;
    idx = lower.indexOf(q, lastIndex);
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? <>{parts}</> : text;
}

export function MentionLink({ href, children }: { href?: string; children?: ReactNode }) {
  const nodes = useCanvasStore((state) => state.nodes);
  const activeCanvasId = useCanvasStore((state) => state.activeCanvasId);
  const jumpToMention = useCanvasStore((state) => state.jumpToMention);
  const t = useT();

  const target = href ? parseMentionHref(href) : null;
  if (!target) return <span>{children}</span>;

  const tokenLabel = Array.isArray(children)
    ? children.join("")
    : String(children ?? "");
  const targetNode = nodes.find((node) => node.id === target.nodeId);
  const bodyFallback = (targetNode?.data.body ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
  const resolved = resolveMentionLabel(
    { ...target, label: tokenLabel },
    nodes,
    activeCanvasId,
  );
  // 任务节点等卡片可能没有标题，token 的 label 会为空；用正文片段兜底，避免渲染成空白 chip。
  const label = resolved || targetNode?.data.title?.trim() || bodyFallback || t("untitled");
  const missing = target.canvasId === activeCanvasId
    && !nodes.some((node) => node.id === target.nodeId);

  return (
    <button
      type="button"
      className={`mention-chip nodrag${missing ? " mention-chip--missing" : ""}`}
      title={missing ? t("mentionDeleted") : label}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (!missing) void jumpToMention({ ...target, label });
      }}
    >
      <span className="mention-at">@</span>
      {label}
    </button>
  );
}

const renderLink: Components["a"] = ({ node: _node, href, children, ...props }) => {
  if (isMentionHref(href)) {
    return <MentionLink href={href}>{children}</MentionLink>;
  }
  return <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>;
};

/**
 * react-markdown 默认会清洗未知协议，gd:// 提及链接会在渲染前被清空。
 * 只放行本产品自己的提及协议，其它 URL 继续走默认安全策略。
 */
const nodeUrlTransform = (url: string) => (isMentionHref(url) ? url : defaultUrlTransform(url));

const BLOCK_COMPONENTS: Components = {
  a: renderLink,
  table: ({ node: _node, ...props }) => (
    <div className="node-md-table"><table {...props} /></div>
  ),
};

/** 标题只允许行内 Markdown，避免把卡片标题变成一整块文档 */
const INLINE_COMPONENTS: Components = {
  p: ({ children }) => <span>{children}</span>,
  h1: ({ children }) => <strong>{children}</strong>,
  h2: ({ children }) => <strong>{children}</strong>,
  h3: ({ children }) => <strong>{children}</strong>,
  h4: ({ children }) => <strong>{children}</strong>,
  h5: ({ children }) => <strong>{children}</strong>,
  h6: ({ children }) => <strong>{children}</strong>,
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span>{children}</span>,
  blockquote: ({ children }) => <span>{children}</span>,
  a: renderLink,
};

interface NodeMarkdownProps {
  content: string;
  className?: string;
  searchQuery?: string;
  /** 标题等单行场景：把块级元素压成行内元素 */
  inline?: boolean;
}

export function NodeMarkdown({ content, className = "", searchQuery = "", inline = false }: NodeMarkdownProps) {
  const text = content ?? "";
  if (!text) return null;

  // 搜索时退回纯文本高亮，避免 Markdown 结构把命中词拆散
  if (searchQuery.trim()) {
    return (
      <div className={`node-markdown-fallback nodrag ${className}`.trim()}>
        {highlightPlainText(formatMentionsForText(text), searchQuery)}
      </div>
    );
  }

  return (
    <div className={`${inline ? "node-markdown-inline" : "node-markdown"} nodrag ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={nodeUrlTransform}
        components={inline ? INLINE_COMPONENTS : BLOCK_COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
