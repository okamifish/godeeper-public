"use client";

import { useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import type { GoDeeperFlowNode } from "@/lib/types";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import { NodeShell } from "./node-shell";
import { useNodeEdit, NodeEditContainer } from "./node-edit-container";

/** 正文超过这个高度（约 7 行）才显示「收起正文」按钮，默认完整展开 */
const COLLAPSE_THRESHOLD = 168;

interface ContentNodeProps extends NodeProps<GoDeeperFlowNode> {
  label: string;
}

export function ContentNode({ id, data, selected, label }: ContentNodeProps) {
  const edit = useNodeEdit({ nodeId: id, title: data.title, body: data.body });
  const search = useCanvasStore((s) => s.search);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const t = useT();

  // 折叠状态存在节点数据里，随画布快照落库；不再用组件内 state，避免切画布/撤销后错位
  const bodyCollapsed = data.bodyCollapsed ?? false;
  const [canCollapseBody, setCanCollapseBody] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 默认展开：只有正文确实很长时才给「收起」按钮
  useEffect(() => {
    if (edit.isEditing) return;
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      if (!bodyCollapsed) setCanCollapseBody(el.scrollHeight > COLLAPSE_THRESHOLD);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [data.body, bodyCollapsed, edit.isEditing]);

  const toggleBody = () => {
    pushHistory();
    updateNodeData(id, { bodyCollapsed: !bodyCollapsed });
  };

  return (
    <NodeShell id={id} kind={data.kind} selected={selected} onDoubleClick={edit.handleDoubleClick}>
      <div className="node-inner">
        <span className="node-chip">{label}</span>
        <NodeEditContainer
          nodeId={id}
          editTitle={edit.editTitle}
          editBody={edit.editBody}
          titleInputRef={edit.titleInputRef}
          bodyInputRef={edit.bodyInputRef}
          onEditTitleChange={edit.setEditTitle}
          onEditBodyChange={edit.setEditBody}
          onKeyDown={edit.handleKeyDown}
          onSave={edit.handleSave}
          hintText={t("editHint")}
          displayTitle={data.title}
          displayBody={data.body}
          isEditing={edit.isEditing}
          searchQuery={search}
          bodyRef={bodyRef}
          bodyCollapsed={bodyCollapsed}
          canCollapseBody={canCollapseBody}
          onToggleBody={toggleBody}
          collapseLabel={t("collapseBody")}
          expandLabel={t("expandBody")}
        />
        <div className="node-footer">
          <span>{data.metaLeft}</span>
          <span>{data.metaRight}</span>
        </div>
      </div>
    </NodeShell>
  );
}
