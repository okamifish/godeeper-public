"use client";

import { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import { useCanvasStore } from "@/lib/canvas-store";
import { isTypingTarget } from "@/hooks/use-keyboard-shortcuts";
import { useT } from "@/lib/i18n";
import {
  Copy,
  X,
  PenLine,
  Sparkles,
  Link2,
  FileText,
  StickyNote,
  Lightbulb,
  NotebookPen,
  Image as ImageIcon,
  Lock,
  LockOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BacklinkRow } from "./backlink-row";

/** 便签卡右上角徽章：每类节点一枚语义图标 */
const NODE_KIND_ICONS: Record<string, LucideIcon> = {
  text: PenLine,
  free: StickyNote,
  task: Sparkles,
  link: Link2,
  result: FileText,
  inspire: Lightbulb,
  note: NotebookPen,
  image: ImageIcon,
};

interface NodeShellProps {
  id: string;
  kind: string;
  selected: boolean;
  onDoubleClick?: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}

export function NodeShell({ id, kind, selected, onDoubleClick, children }: NodeShellProps) {
  const selectNode = useCanvasStore((state) => state.selectNode);
  const duplicateNode = useCanvasStore((state) => state.duplicateNode);
  const deleteSelectedNodes = useCanvasStore((state) => state.deleteSelectedNodes);
  const toggleNodeLock = useCanvasStore((state) => state.toggleNodeLock);
  const isLocked = useCanvasStore((state) => Boolean(state.nodes.find((node) => node.id === id)?.data.locked));
  const brokenInputNodeIds = useCanvasStore((state) => state.brokenInputNodeIds);
  const isInputBroken = Boolean(brokenInputNodeIds?.includes(id));
  const mentionPicking = useCanvasStore((state) => state.mentionPicking);

  const t = useT();
  const [modifierHint, setModifierHint] = useState<string | null>(null);
  const KindIcon = NODE_KIND_ICONS[kind] ?? PenLine;

  useEffect(() => {
    const inTypingOrDialog = (target: EventTarget | null) => {
      if (isTypingTarget(target)) return true;
      // 登录/导出等弹窗打开时不要在画布卡片上显示修饰键提示
      return Boolean(document.querySelector(".modal-shell, [role='dialog']"));
    };
    const onKeyChange = (e: KeyboardEvent) => {
      if (inTypingOrDialog(e.target)) {
        setModifierHint(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) setModifierHint("focus");
      else if (e.ctrlKey || e.metaKey || e.altKey) setModifierHint("multi");
      else setModifierHint(null);
    };
    const onKeyUp = () => setModifierHint(null);
    window.addEventListener("keydown", onKeyChange);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyChange);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    useCanvasStore.setState({ selectedNodeIds: [id], selectedNodeId: id });
    setTimeout(() => deleteSelectedNodes(), 0);
  };

  return (
    <div
      className={`flow-node flow-node--note flow-node-${kind} ${selected ? "selected" : ""}${isInputBroken ? " flow-node-broken-input" : ""}`}
      onMouseDown={(event) => {
        if (mentionPicking) event.stopPropagation();
      }}
      onClick={(event) => {
        if (mentionPicking) {
          event.stopPropagation();
          if (mentionPicking.sourceNodeId !== id) {
            useCanvasStore.getState().completeMentionPick(id);
          }
          return;
        }
        // 带修饰键时交给 React Flow 处理多选/聚焦，这里不能把选中状态改回单选
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        selectNode(id);
      }}
      onDoubleClick={mentionPicking ? undefined : onDoubleClick}
    >
      <span className="node-icon" aria-hidden="true">
        <KindIcon size={20} strokeWidth={2.1} />
      </span>
      {isInputBroken && (
        <span className="node-input-warning" title={t("inputMissing")} aria-label={t("inputMissing")}>
          !
        </span>
      )}
      {isLocked && (
        <span className="node-lock-badge" title={t("nodeLocked")} aria-label={t("nodeLocked")}>
          <Lock size={11} />
        </span>
      )}
      <div className={`node-accent-bar node-accent-${kind}`} />
      <Handle
        className={`flow-handle${isInputBroken ? " flow-handle--broken" : ""}`}
        type="target"
        position={Position.Left}
      />
      {selected && (
        <div className="node-toolbar">
          <button
            className={`icon-button${isLocked ? " active" : ""}`}
            title={isLocked ? t("unlockNode") : t("lockNode")}
            onClick={(e) => { e.stopPropagation(); toggleNodeLock(id); }}
          >
            {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
          </button>
          <button className="icon-button" title="Duplicate node" onClick={(e) => { e.stopPropagation(); duplicateNode(id); }}><Copy size={14} /></button>
          <button className="icon-button danger" title="Delete node" onClick={handleDelete}><X size={14} /></button>
        </div>
      )}
      {modifierHint && (
        <div className="node-modifier-hint">
          {modifierHint === "focus" ? t("focusModeHint") : t("multiSelectHint")}
        </div>
      )}
      {children}
      <BacklinkRow nodeId={id} />
      {mentionPicking ? (
        <div
          className="mention-pick-layer"
          title={t("mentionPickOnCanvas")}
          onClick={(event) => {
            event.stopPropagation();
            if (mentionPicking.sourceNodeId !== id) {
              useCanvasStore.getState().completeMentionPick(id);
            }
          }}
        />
      ) : null}
      {kind !== "link" && (
        <Handle className="flow-handle" type="source" position={Position.Right} />
      )}
    </div>
  );
}
