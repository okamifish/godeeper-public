"use client";

import type { NodeProps } from "@xyflow/react";
import type { GoDeeperFlowNode } from "@/lib/types";
import { NodeShell } from "./node-shell";
import { NodeMarkdown } from "./node-markdown";
import { Icons } from "@/components/icons";
import { useT } from "@/lib/i18n";

export function InspireNode({ id, data, selected }: NodeProps<GoDeeperFlowNode>) {
  const t = useT();
  const isLoading = data.taskStatus === "running";
  const prerequisites = data.inspirePrerequisites ?? [];
  // 没有结构化字段时退回 title / body，避免出现一块空白面板
  const question = data.inspireQuestion?.trim() || data.title?.trim() || "";
  const reason = data.inspireReason?.trim() || data.body?.trim() || "";

  return (
    <NodeShell id={id} kind="inspire" selected={selected}>
      <div className="inspire-node-content">
        {isLoading ? (
          <div className="inspire-loading">
            <Icons.spinner className="spinner" style={{ width: 20, height: 20 }} />
            <span>{t("inspireThinking")}</span>
          </div>
        ) : (
          <>
            <span className="node-chip">{t("inspireNode")}</span>

            {question && (
              <div className="inspire-section">
                <div className="inspire-section-title">
                  <Icons.help style={{ width: 13, height: 13, flexShrink: 0 }} />
                  <span>{t("inspireQuestion")}</span>
                </div>
                <div className="inspire-section-body">
                  <NodeMarkdown content={question} />
                </div>
              </div>
            )}

            {reason && (
              <div className="inspire-section">
                <div className="inspire-section-title">{t("inspireReason")}</div>
                <div className="inspire-section-body">
                  <NodeMarkdown content={reason} />
                </div>
              </div>
            )}

            {prerequisites.length > 0 && (
              <div className="inspire-section">
                <div className="inspire-section-title">{t("inspirePrerequisites")}</div>
                <ul className="inspire-prereq-list">
                  {prerequisites.map((item, i) => (
                    <li key={i} className="inspire-prereq-item">
                    <NodeMarkdown content={item} inline />
                  </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </NodeShell>
  );
}
