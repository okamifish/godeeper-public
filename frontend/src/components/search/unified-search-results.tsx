"use client";

import { useEffect, useMemo, useState } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { api, type NodeSearchHit } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { formatMentionsForText } from "@/lib/mentions";
import { CrossCanvasSearchResults } from "@/pro";
import type { CrossCanvasSearchHit } from "@/pro/contract";

interface UnifiedSearchResultsProps {
  open: boolean;
  query: string;
  onClose: () => void;
  onRequireUpgrade: () => void;
}

/** 统一搜索入口的结果面板：当前画布结果 + 其他画布结果（带标签） */
export function UnifiedSearchResults({ open, query, onClose, onRequireUpgrade }: UnifiedSearchResultsProps) {
  const nodes = useCanvasStore((s) => s.nodes);
  const activeCanvasId = useCanvasStore((s) => s.activeCanvasId);
  const focusNode = useCanvasStore((s) => s.focusNode);
  const setActiveCanvasId = useCanvasStore((s) => s.setActiveCanvasId);

  const [crossResults, setCrossResults] = useState<NodeSearchHit[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const trimmed = query.trim();

  const localMatches = useMemo(() => {
    if (!trimmed) return [];
    const q = trimmed.toLowerCase();
    return nodes
      .filter(
        (node) =>
          node.data.title.toLowerCase().includes(q) ||
          node.data.body.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [nodes, trimmed]);

  useEffect(() => {
    if (!open || !trimmed) {
      setCrossResults([]);
      setError("");
      setLoading(false);
      return;
    }
    if (!isAuthenticated()) {
      setCrossResults([]);
      setError("");
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      api.searchNodes(trimmed)
        .then((response) => {
          if (!active) return;
          setLocked(Boolean(response?.locked));
          setCrossResults(Array.isArray(response?.results) ? response.results : []);
        })
        .catch((err) => {
          if (!active) return;
          // 永远不把原始错误码暴露给用户；跨画布相关错误统一转成升级提示
          const message = err instanceof Error ? err.message : "";
          if (/pro|403|membership/i.test(message)) {
            setError("跨画布搜索需要升级为 Pro。");
          } else {
            setError("搜索暂时不可用，请稍后重试。");
          }
          setCrossResults([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, trimmed]);

  const crossMatches = useMemo(
    () => crossResults.filter((hit) => hit.canvasId !== activeCanvasId),
    [crossResults, activeCanvasId],
  );

  if (!open || !trimmed) return null;

  const pickLocal = (nodeId: string) => {
    focusNode(nodeId);
    onClose();
  };

  const pickCross = async (hit: CrossCanvasSearchHit) => {
    if (locked || hit.locked) {
      onRequireUpgrade();
      return;
    }
    try {
      await setActiveCanvasId(hit.canvasId);
      focusNode(hit.id);
      toast.success(`已打开「${hit.canvasTitle || "Untitled Canvas"}」`);
      onClose();
    } catch {
      toast.error("打开画布失败，请稍后重试");
    }
  };

  const hasAnyResult = localMatches.length > 0 || crossMatches.length > 0;

  return (
    <div className="search-results-panel" role="listbox" aria-label="搜索结果">
      {loading ? <div className="search-results-status">正在搜索其他画布…</div> : null}
      {error ? <div className="search-results-status error">{error}</div> : null}

      {localMatches.length > 0 ? (
        <div className="search-results-section">
          <div className="search-results-label">当前画布</div>
          {localMatches.map((node) => (
            <button key={node.id} className="search-result-item" onClick={() => pickLocal(node.id)}>
              <Search size={13} className="search-result-icon" />
              <span className="search-result-main">
                <span className="search-result-title">{node.data.title || "(无标题节点)"}</span>
                {node.data.body ? <span className="search-result-body">{formatMentionsForText(node.data.body)}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {crossMatches.length > 0 ? (
        <CrossCanvasSearchResults
          results={crossMatches}
          locked={locked}
          onPick={(hit) => void pickCross(hit)}
          labels={{
            section: "其他画布",
            crossTag: "跨画布",
            proTag: "Pro",
            untitledNode: "(无标题节点)",
            untitledCanvas: "Untitled Canvas",
          }}
        />
      ) : null}

      {!loading && !error && !hasAnyResult ? (
        <div className="search-results-status">没有找到匹配的节点。</div>
      ) : null}
    </div>
  );
}
