"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AtSign, Lock, MousePointerClick, Search, X } from "lucide-react";
import { api, type NodeSearchHit } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import type { MentionTarget } from "@/lib/mentions";

interface PickerItem {
  key: string;
  canvasId: string;
  nodeId: string;
  title: string;
  kind: string;
  snippet: string;
  canvasTitle?: string;
  locked?: boolean;
  cross?: boolean;
}

export function MentionPickerHost() {
  const picker = useCanvasStore((s) => s.mentionPicker);
  const nodes = useCanvasStore((s) => s.nodes);
  const activeCanvasId = useCanvasStore((s) => s.activeCanvasId);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const setMentionQuery = useCanvasStore((s) => s.setMentionQuery);
  const closeMentionPicker = useCanvasStore((s) => s.closeMentionPicker);
  const startMentionPicking = useCanvasStore((s) => s.startMentionPicking);
  const t = useT();

  const inputRef = useRef<HTMLInputElement>(null);
  const [crossResults, setCrossResults] = useState<NodeSearchHit[]>([]);
  const [crossLocked, setCrossLocked] = useState(false);
  const [crossLoading, setCrossLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const query = picker?.query ?? "";

  useEffect(() => {
    if (!picker) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [picker?.sourceNodeId, picker?.anchor.left, picker?.anchor.top]);

  useEffect(() => {
    setHighlight(0);
  }, [query, picker?.sourceNodeId]);

  const localItems = useMemo<PickerItem[]>(() => {
    if (!picker) return [];
    const q = query.trim().toLowerCase();
    const selected = nodes.find(
      (node) => node.id === selectedNodeId && node.id !== picker.sourceNodeId,
    );
    const list = nodes
      .filter((node) => node.id !== picker.sourceNodeId)
      .filter((node) => (
        !q
        || node.data.title.toLowerCase().includes(q)
        || (node.data.body ?? "").toLowerCase().includes(q)
      ))
      .slice(0, 8)
      .map<PickerItem>((node) => ({
        key: `local:${node.id}`,
        canvasId: activeCanvasId,
        nodeId: node.id,
        title: node.data.title,
        kind: node.data.kind,
        snippet: (node.data.body ?? "").slice(0, 80),
      }));

    if (q || !selected) return list;
    return [
      {
        key: `selected:${selected.id}`,
        canvasId: activeCanvasId,
        nodeId: selected.id,
        title: selected.data.title,
        kind: selected.data.kind,
        snippet: (selected.data.body ?? "").slice(0, 80),
      },
      ...list.filter((item) => item.nodeId !== selected.id),
    ];
  }, [activeCanvasId, nodes, picker, query, selectedNodeId]);

  useEffect(() => {
    if (!picker || !isAuthenticated() || !query.trim()) {
      setCrossResults([]);
      setCrossLocked(false);
      setCrossLoading(false);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setCrossLoading(true);
      api.searchNodes(query.trim())
        .then((response) => {
          if (!active) return;
          setCrossLocked(Boolean(response?.locked));
          setCrossResults(
            (Array.isArray(response?.results) ? response.results : [])
              .filter((hit) => hit.canvasId !== activeCanvasId),
          );
        })
        .catch(() => {
          if (active) {
            setCrossResults([]);
            setCrossLocked(false);
          }
        })
        .finally(() => {
          if (active) setCrossLoading(false);
        });
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeCanvasId, picker, query]);

  const crossItems = useMemo<PickerItem[]>(() => (
    crossResults.map((hit) => ({
      key: `cross:${hit.canvasId}:${hit.id}`,
      canvasId: hit.canvasId,
      nodeId: hit.id,
      title: hit.title,
      kind: hit.kind,
      snippet: hit.body ?? "",
      canvasTitle: hit.canvasTitle,
      locked: Boolean(crossLocked || hit.locked),
      cross: true,
    }))
  ), [crossLocked, crossResults]);

  const items = useMemo(() => [...localItems, ...crossItems], [localItems, crossItems]);

  useEffect(() => {
    setHighlight((current) => Math.min(current, Math.max(items.length - 1, 0)));
  }, [items.length]);

  if (!picker || typeof document === "undefined") return null;

  const handleClose = () => {
    picker.onClose();
    closeMentionPicker();
  };

  const select = (item: PickerItem) => {
    if (item.locked) return;
    const fallback = (item.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    picker.onSelect({
      canvasId: item.canvasId,
      nodeId: item.nodeId,
      // 任务节点等卡片标题可能为空，用正文片段或类型兜底，保证 chip 有可读文本。
      label: item.title?.trim() || fallback || item.kind,
      canvasTitle: item.canvasTitle,
    });
    closeMentionPicker();
  };

  const pickOnCanvas = () => {
    startMentionPicking(picker.sourceNodeId, picker.onSelect);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, items.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[highlight];
      if (item) select(item);
    }
  };

  const width = 340;
  const estimatedHeight = 360;
  const left = Math.max(8, Math.min(picker.anchor.left, window.innerWidth - width - 8));
  const top = picker.anchor.top + picker.anchor.height + 6 + estimatedHeight > window.innerHeight
    ? Math.max(8, picker.anchor.top - estimatedHeight - 6)
    : picker.anchor.top + picker.anchor.height + 6;

  return createPortal(
    <div className="mention-picker-backdrop" onMouseDown={handleClose}>
      <div
        className="mention-picker"
        style={{ left, top, width }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mention-picker-search">
          <Search size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setMentionQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t("mentionSearchPlaceholder")}
            aria-label={t("mentionSearchPlaceholder")}
          />
          <button type="button" onClick={handleClose} aria-label={t("mentionPickHint")}>
            <X size={14} />
          </button>
        </div>

        <button type="button" className="mention-picker-pick" onClick={pickOnCanvas}>
          <MousePointerClick size={14} />
          {t("mentionPickOnCanvas")}
        </button>

        <div className="mention-picker-list">
          {items.map((item, index) => (
            <button
              type="button"
              key={item.key}
              className={`mention-picker-item${index === highlight ? " on" : ""}${item.locked ? " locked" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => select(item)}
            >
              <span className="mention-picker-kind">{item.kind}</span>
              <span className="mention-picker-main">
                <span className="mention-picker-title">{item.title}</span>
                {item.snippet ? (
                  <span className="mention-picker-snippet">{item.snippet}</span>
                ) : null}
                {item.canvasTitle ? (
                  <span className="mention-picker-canvas">{item.canvasTitle}</span>
                ) : null}
              </span>
              {item.locked ? <Lock size={12} /> : item.cross ? <AtSign size={12} /> : null}
            </button>
          ))}
        </div>

        {crossLoading ? (
          <div className="mention-picker-status">{t("mentionOtherCanvas")}…</div>
        ) : null}
        {!crossLoading && items.length === 0 ? (
          <div className="mention-picker-status">{t("mentionNoResult")}</div>
        ) : null}
        {crossLocked ? (
          <div className="mention-picker-status locked">{t("mentionPro")}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
