"use client";

import { LayoutGrid, CornerUpLeft, Plus, Sparkles, NotebookPen } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import { WIDTH_BY_KIND } from "@/data/node-defaults";
import { NODE_HEIGHT_BY_KIND } from "@/data/layout-constants";

export function CanvasToolbar() {
  const {
    selectedNodeIds,
    createTaskFromSelection,
    returnToBranchPoint,
    autoLayout,
    addNode,
    generateSummary,
    summaryLoading,
  } = useCanvasStore();
  const t = useT();
  const { screenToFlowPosition } = useReactFlow();

  const canSummarize = selectedNodeIds.length >= 2 && !summaryLoading;

  const addNoteCard = () => {
    const point = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const width = WIDTH_BY_KIND.note ?? 760;
    const height = NODE_HEIGHT_BY_KIND.note ?? 540;
    addNode(point.x - width / 2, point.y - height / 2, "note");
  };

  return (
    <div className="canvas-toolbar">
      <button className="tb" onClick={returnToBranchPoint} title={t("returnToParent")}>
        <CornerUpLeft size={13} />
        <span className="tb-label">{t("returnToParent")}</span>
      </button>
      <div className="toolbar-divider" />
      <button className="tb" onClick={addNoteCard} title={t("noteNode")}>
        <NotebookPen size={13} />
        <span className="tb-label">{t("noteNode")}</span>
      </button>
      <div className="toolbar-divider" />
      <button className="tb" onClick={autoLayout} title={t("autoLayout")}>
        <LayoutGrid size={13} />
        <span className="tb-label">{t("autoLayout")}</span>
      </button>
      <div className="toolbar-divider" />
      <button
        className="tb primary"
        disabled={!canSummarize}
        onClick={() => { if (canSummarize) generateSummary(selectedNodeIds); }}
        title={selectedNodeIds.length < 2 ? t("summaryDisabledHint") : (t("summaryTooltip") ?? "")}
      >
        <Sparkles size={13} />
        <span className="tb-label">{summaryLoading ? t("generating") : t("genSummary")}</span>
      </button>
      <div className="toolbar-divider" />
      <button
        className="tb"
        onClick={createTaskFromSelection}
        disabled={selectedNodeIds.length === 0}
        title={selectedNodeIds.length === 0 ? t("taskDisabledHint") : t("taskFromSelection")}
      >
        <Plus size={13} />
        <span className="tb-label">{t("taskFromSelection")}</span>
        <span className="count">{selectedNodeIds.length}</span>
      </button>
    </div>
  );
}
