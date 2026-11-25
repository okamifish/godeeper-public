"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useCanvasStore } from "@/lib/canvas-store";
import { useRevealNode } from "@/hooks/use-reveal-node";
import { actionForCombo, eventToCombo } from "@/lib/shortcut-settings";
import { t } from "@/lib/i18n";

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"),
  );
}

function focusSearch() {
  document.querySelector<HTMLInputElement>(".searchbar input")?.focus();
}

export function useKeyboardShortcuts() {
  const revealNode = useRevealNode();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || isTypingTarget(event.target)) return;
      // 焦点在按钮/链接上时保留原生 Enter/空格行为，避免把「确认」变成新建节点；
      // 但节点卡片本身也是 button，它代表画布选区，不能吞掉 Enter/Tab/Delete 等画布快捷键。
      const targetEl = event.target instanceof HTMLElement ? event.target : null;
      const insideNode = Boolean(targetEl?.closest(".react-flow__node"));
      if (!insideNode
        && targetEl?.closest("button, a, [role='button'], [role='menuitem'], [role='menuitemcheckbox']")) {
        return;
      }
      // 任何弹窗打开时都不触发画布快捷键，避免在设置/分享/登录/导出弹窗里误建节点
      if (document.querySelector(".modal-shell, [role='dialog']")) return;

      const store = useCanvasStore.getState();

      // Esc 不参与自定义：始终用于退出当前选择/浮层
      if (event.key === "Escape") {
        if (store.socraticActive) {
          store.closeSocratic();
          return;
        }
        store.clearSelection();
        return;
      }

      // 追问会话期间停用主画布快捷键，避免误建/误删主画布节点
      if (store.socraticActive) return;

      const combo = eventToCombo(event);
      const action = actionForCombo(combo);
      if (!action) return;

      switch (action) {
        case "addSibling": {
          if (!store.selectedNodeId) return;
          event.preventDefault();
          store.addSiblingNode(store.selectedNodeId);
          break;
        }
        case "addChild": {
          if (!store.selectedNodeId) return;
          event.preventDefault();
          const newId = store.addChildNode(store.selectedNodeId);
          if (newId) revealNode(newId, store.selectedNodeId);
          break;
        }
        case "deleteNode": {
          if (store.selectedNodeIds.length === 0) return;
          event.preventDefault();
          store.deleteSelectedNodes();
          break;
        }
        case "duplicateNode": {
          if (!store.selectedNodeId) return;
          event.preventDefault();
          store.duplicateNode(store.selectedNodeId);
          break;
        }
        case "autoLayout": {
          event.preventDefault();
          store.autoLayout();
          break;
        }
        case "undo": {
          if (!store.canUndo) return;
          event.preventDefault();
          store.undo();
          break;
        }
        case "redo": {
          if (!store.canRedo) return;
          event.preventDefault();
          store.redo();
          break;
        }
        case "selectAll": {
          event.preventDefault();
          const lastNode = store.nodes[store.nodes.length - 1];
          useCanvasStore.setState({
            selectedNodeIds: store.nodes.map((node) => node.id),
            selectedNodeId: lastNode?.id ?? "",
          });
          break;
        }
        case "search": {
          event.preventDefault();
          focusSearch();
          break;
        }
        case "inspire": {
          event.preventDefault();
          const selected = store.nodes.find((node) => node.id === store.selectedNodeId);
          if (!selected || (selected.data.kind !== "task" && selected.data.kind !== "inspire")) {
            toast(t("aiAskNeedTask", store.language));
            return;
          }
          void store.createAiQuestionFromTask(selected.id);
          break;
        }
        case "branchPoint": {
          event.preventDefault();
          store.returnToBranchPoint();
          break;
        }
        case "groupNodes": {
          event.preventDefault();
          if (store.selectedNodeIds.length < 2) {
            toast(t("groupNeedsSelection", store.language));
            return;
          }
          store.toggleGroupSelection();
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [revealNode]);
}
