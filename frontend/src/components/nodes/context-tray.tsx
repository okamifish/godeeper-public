"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Pin, PinOff, X } from "lucide-react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT, type S } from "@/lib/i18n";
import {
  getContextRecipe,
  resolveTaskContext,
  type ContextEntry,
  type ContextReason,
} from "@/lib/context-resolver";
import { getTaskType } from "@/lib/task-model";
import type { GoDeeperNodeData } from "@/lib/types";

const REASON_KEYS: Record<ContextReason, S> = {
  current: "contextReasonCurrent",
  ancestor: "contextReasonAncestor",
  evidence: "contextReasonEvidence",
  pinned: "contextReasonPinned",
  sibling: "contextReasonSibling",
  descendant: "contextReasonDescendant",
  selected: "contextReasonSelected",
  connected: "contextReasonConnected",
};

const FALLBACK_DATA: GoDeeperNodeData = { kind: "task", title: "", body: "" };

/**
 * 任务卡上的上下文托盘：让用户看见“这次 AI 会读哪些卡”，
 * 并能移除、固定、用框选覆盖，而不是把所有连线默默塞给模型。
 */
export function ContextTray({ nodeId }: { nodeId: string }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const data = useCanvasStore((s) => s.nodes.find((node) => node.id === nodeId)?.data);
  const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const nodeData = data ?? FALLBACK_DATA;
  const taskType = getTaskType(nodeData);
  const recipe = useMemo(() => getContextRecipe(taskType), [taskType]);

  const resolved = useMemo(
    () =>
      resolveTaskContext(nodes, edges, nodeId, {
        ...recipe,
        pinnedIds: nodeData.contextPinnedIds,
        excludedIds: nodeData.contextExcludedIds,
        selectedIds: nodeData.contextSelectionIds,
      }),
    [
      nodes,
      edges,
      nodeId,
      recipe,
      nodeData.contextPinnedIds,
      nodeData.contextExcludedIds,
      nodeData.contextSelectionIds,
    ],
  );

  if (!data) return null;

  const pinnedIds = data.contextPinnedIds ?? [];
  const excludedIds = data.contextExcludedIds ?? [];
  const selectionIds = data.contextSelectionIds ?? [];
  const selectableIds = selectedNodeIds.filter((id) => id !== nodeId);

  const update = (patch: Partial<GoDeeperNodeData>) => {
    pushHistory();
    updateNodeData(nodeId, patch);
  };

  const removeEntry = (entry: ContextEntry) => {
    if (entry.node.id === nodeId) return;
    const nextPinned = pinnedIds.filter((id) => id !== entry.node.id);
    const nextSelection = selectionIds.filter((id) => id !== entry.node.id);
    update({
      contextPinnedIds: nextPinned.length > 0 ? nextPinned : undefined,
      contextExcludedIds: Array.from(new Set([...excludedIds, entry.node.id])),
      contextSelectionIds: nextSelection.length > 0 ? nextSelection : undefined,
    });
  };

  const togglePin = (entry: ContextEntry) => {
    const isPinned = pinnedIds.includes(entry.node.id);
    const nextPinned = isPinned
      ? pinnedIds.filter((id) => id !== entry.node.id)
      : [...pinnedIds, entry.node.id];
    const nextExcluded = excludedIds.filter((id) => id !== entry.node.id);
    update({
      contextPinnedIds: nextPinned.length > 0 ? nextPinned : undefined,
      contextExcludedIds: nextExcluded.length > 0 ? nextExcluded : undefined,
    });
  };

  const useSelection = () => {
    if (selectableIds.length === 0) return;
    update({ contextSelectionIds: selectableIds, contextExcludedIds: undefined });
  };

  const clearSelection = () => {
    update({ contextSelectionIds: undefined });
  };

  const restoreDefault = () => {
    update({ contextExcludedIds: undefined, contextSelectionIds: undefined });
  };

  return (
    <div className="context-tray" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="context-tray-summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>
          {t("contextTray")} {resolved.entries.length} · {t("contextApprox")}{" "}
          {resolved.totalTokens} {t("contextTokens")}
        </span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {expanded && (
        <div className="context-tray-body">
          <ul className="context-tray-list">
            {resolved.entries.map((entry) => {
              const isCurrent = entry.node.id === nodeId;
              const isPinned = pinnedIds.includes(entry.node.id);
              return (
                <li className="context-tray-item" key={entry.node.id}>
                  <span className="context-tray-title">{entry.node.data.title}</span>
                  <span className={`context-tray-reason reason-${entry.reason}`}>
                    {t(REASON_KEYS[entry.reason])}
                  </span>
                  <span className="context-tray-tokens">
                    {t("contextApprox")}
                    {entry.tokens}
                  </span>
                  {!isCurrent && (
                    <button
                      type="button"
                      className="context-tray-icon"
                      title={isPinned ? t("contextUnpin") : t("contextPin")}
                      onClick={() => togglePin(entry)}
                    >
                      {isPinned ? <PinOff size={10} /> : <Pin size={10} />}
                    </button>
                  )}
                  {!isCurrent && (
                    <button
                      type="button"
                      className="context-tray-icon"
                      title={t("contextRemove")}
                      onClick={() => removeEntry(entry)}
                    >
                      <X size={10} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {resolved.truncated && <p className="context-tray-note">{t("contextTruncated")}</p>}
          <div className="context-tray-actions">
            <button
              type="button"
              className="context-tray-action"
              disabled={selectableIds.length === 0}
              onClick={useSelection}
            >
              {t("contextUseSelection")}
              {selectableIds.length > 0 ? ` ${selectableIds.length}` : ""}
            </button>
            {selectionIds.length > 0 && (
              <button type="button" className="context-tray-action" onClick={clearSelection}>
                {t("contextClearSelection")}
              </button>
            )}
            {(excludedIds.length > 0 || selectionIds.length > 0) && (
              <button type="button" className="context-tray-action" onClick={restoreDefault}>
                {t("contextRestoreDefault")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
