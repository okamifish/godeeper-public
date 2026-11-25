"use client";

import { useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { GoDeeperFlowNode } from "@/lib/types";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import { Check } from "lucide-react";
import { NodeShell } from "./node-shell";
import { NodeMarkdown } from "./node-markdown";

export function LinkNode({ id, data, selected }: NodeProps<GoDeeperFlowNode>) {
  const expandKeyPoint = useCanvasStore((s) => s.expandKeyPoint);
  const t = useT();
  const updateNodeInternals = useUpdateNodeInternals();

  const isAnalyzing = !data.keyPoints;
  const keyPoints = data.keyPoints ?? [];

  // 要点行有增减时重新测量 handle 位置，避免连线起点使用旧的缓存坐标
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, keyPoints.length, updateNodeInternals]);

  return (
    <NodeShell id={id} kind={data.kind} selected={selected}>
      <div className="url-node-card">
        {data.thumbnailUrl && (
          <div className="url-node-thumbnail">
            <img src={data.thumbnailUrl} alt={data.title || "Webpage preview"} loading="lazy" />
          </div>
        )}
        <div className="url-node-header">
          <span className="node-chip">{data.metaLeft ?? "URL"}</span>
          <span className={`url-node-status ${isAnalyzing ? "analyzing" : ""}`}>
            {isAnalyzing ? (
              <>
                <span className="status-dot running" />
                {t("analyzing")}
              </>
            ) : (
              data.previewLabel ?? t("analyzed")
            )}
          </span>
        </div>

        <h2 className="url-node-title">
          <NodeMarkdown content={data.title} inline />
        </h2>

        {/* 主 handle 直接锚在摘要块上，不依赖像素测量 */}
        <div className="url-node-anchor">
          {data.summary ? (
            <div className="url-node-summary">
              <NodeMarkdown content={data.summary} />
            </div>
          ) : data.body ? (
            <div className="url-node-summary">
              <NodeMarkdown content={data.body} />
            </div>
          ) : null}
          <Handle
            type="source"
            position={Position.Right}
            id="main"
            className="flow-handle link-handle-main"
          />
        </div>

        {keyPoints.length > 0 && (
          <div className="url-node-keypoints">
            <span className="url-node-kp-label">{t("kpLabel")}</span>
            {keyPoints.map((point, index) => (
              <div
                key={index}
                className="url-node-kp-item"
              >
                <span className="url-node-kp-text">
                  <NodeMarkdown content={point.text} inline />
                </span>
                <button
                  className={`url-node-kp-expand ${point.expanded ? "done" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!point.expanded) expandKeyPoint(id, index);
                  }}
                  disabled={point.expanded}
                  title={point.expanded ? t("expanded") : t("expandToText")}
                >
                  {point.expanded ? <Check size={14} /> : "+"}
                </button>
                {/* 每条要点一个 handle，跟着行高走，换行/缩放都不会偏 */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`kp-${index}`}
                  className="flow-handle link-handle-kp"
                />
              </div>
            ))}
          </div>
        )}

        <div className="node-footer">
          <span className="url-node-url" title={data.sourceLabel ?? data.url}>
            {(data.sourceLabel ?? data.url ?? "").slice(0, 40)}
          </span>
          <span>{data.metaRight}</span>
        </div>
      </div>
    </NodeShell>
  );
}
