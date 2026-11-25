"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CornerDownLeft, Loader2 } from "lucide-react";
import { api, type BacklinkHit } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import { findLocalBacklinks, mentionSnippet } from "@/lib/mentions";

interface BacklinkItem {
  canvasId: string;
  nodeId: string;
  title: string;
  canvasTitle?: string;
  snippet: string;
}

export function BacklinkRow({ nodeId }: { nodeId: string }) {
  const nodes = useCanvasStore((state) => state.nodes);
  const activeCanvasId = useCanvasStore((state) => state.activeCanvasId);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const jumpToMention = useCanvasStore((state) => state.jumpToMention);
  const t = useT();

  const [expanded, setExpanded] = useState(false);
  const [remote, setRemote] = useState<BacklinkHit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hasCrossCanvas, setHasCrossCanvas] = useState(false);

  const local = useMemo(
    () => findLocalBacklinks(nodes, activeCanvasId, nodeId),
    [activeCanvasId, nodeId, nodes],
  );

  const loadRemote = useCallback(async () => {
    if (!isAuthenticated() || loading) return;
    setLoading(true);
    try {
      const response = await api.getNodeBacklinks(activeCanvasId, nodeId);
      setRemote(Array.isArray(response?.backlinks) ? response.backlinks : []);
      setLocked(Boolean(response?.locked));
      setHasCrossCanvas(Boolean(response?.hasCrossCanvas));
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [activeCanvasId, loading, nodeId]);

  // 只在卡片被选中时请求一次，避免整张画布每张卡都发请求。
  useEffect(() => {
    if (selectedNodeId !== nodeId || loaded) return;
    void loadRemote();
  }, [loadRemote, loaded, nodeId, selectedNodeId]);

  const items = useMemo<BacklinkItem[]>(() => {
    const map = new Map<string, BacklinkItem>();
    for (const hit of local) {
      map.set(`${activeCanvasId}:${hit.node.id}`, {
        canvasId: activeCanvasId,
        nodeId: hit.node.id,
        title: hit.node.data.title,
        snippet: mentionSnippet(hit.node.data.body ?? ""),
      });
    }
    for (const hit of remote) {
      map.set(`${hit.canvasId}:${hit.nodeId}`, {
        canvasId: hit.canvasId,
        nodeId: hit.nodeId,
        title: hit.title,
        canvasTitle: hit.canvasTitle,
        snippet: mentionSnippet(hit.snippet ?? ""),
      });
    }
    return Array.from(map.values());
  }, [activeCanvasId, local, remote]);

  if (!loaded && local.length === 0) return null;
  if (items.length === 0 && !hasCrossCanvas) return null;

  const visible = items.slice(0, 5);

  return (
    <div
      className="backlink-row nodrag"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="backlink-toggle"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((value) => !value);
          if (!loaded) void loadRemote();
        }}
      >
        <CornerDownLeft size={11} />
        {t("mentionBacklinks")} {items.length}
        {locked && hasCrossCanvas ? <span className="backlink-pro">Pro</span> : null}
      </button>

      {expanded ? (
        <div className="backlink-list">
          {loading ? (
            <div className="backlink-status">
              <Loader2 size={12} className="socratic-spin" />
            </div>
          ) : null}
          {visible.map((item) => (
            <button
              type="button"
              key={`${item.canvasId}:${item.nodeId}`}
              className="backlink-item"
              onClick={() => void jumpToMention({
                canvasId: item.canvasId,
                nodeId: item.nodeId,
                label: item.title,
                canvasTitle: item.canvasTitle,
              })}
            >
              <span className="backlink-item-title">{item.title}</span>
              {item.canvasTitle && item.canvasId !== activeCanvasId ? (
                <span className="backlink-item-canvas">{item.canvasTitle}</span>
              ) : null}
              {item.snippet ? <span className="backlink-item-snippet">{item.snippet}</span> : null}
            </button>
          ))}
          {items.length > visible.length ? (
            <div className="backlink-status">+{items.length - visible.length}</div>
          ) : null}
          {items.length === 0 ? (
            <div className="backlink-status">{t("mentionBacklinksEmpty")}</div>
          ) : null}
          {locked && hasCrossCanvas ? (
            <div className="backlink-status locked">{t("mentionUpgrade")}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
