"use client";

import { useState, useCallback } from "react";
import type { NodeMouseHandler } from "@xyflow/react";
import { useCanvasStore } from "@/lib/canvas-store";

export interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const { toggleNodeSelection, selectNode, createTaskFromSelection, deleteSelectedNodes, duplicateNode } = useCanvasStore();

  const handleNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    // 分组区域框有自己标题栏里的操作，不参与普通节点右键菜单。
    if (node.id.startsWith("group-frame-")) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleDuplicate = useCallback(() => {
    if (!contextMenu) return;
    duplicateNode(contextMenu.nodeId);
    closeContextMenu();
  }, [contextMenu, duplicateNode, closeContextMenu]);

  const handleAddToSelection = useCallback(() => {
    if (!contextMenu) return;
    toggleNodeSelection(contextMenu.nodeId);
    closeContextMenu();
  }, [contextMenu, toggleNodeSelection, closeContextMenu]);

  const handleCreateTask = useCallback(() => {
    if (!contextMenu) return;
    selectNode(contextMenu.nodeId);
    createTaskFromSelection();
    closeContextMenu();
  }, [contextMenu, selectNode, createTaskFromSelection, closeContextMenu]);

  const handleDelete = useCallback(() => {
    if (!contextMenu) return;
    const nodeId = contextMenu.nodeId;
    const { selectedNodeIds } = useCanvasStore.getState();
    const idsToDelete = selectedNodeIds.includes(nodeId) ? selectedNodeIds : [...selectedNodeIds, nodeId];
    useCanvasStore.setState({
      selectedNodeIds: idsToDelete,
      selectedNodeId: idsToDelete[idsToDelete.length - 1],
    });
    setTimeout(() => deleteSelectedNodes(), 0);
    closeContextMenu();
  }, [contextMenu, deleteSelectedNodes, closeContextMenu]);

  return {
    contextMenu,
    setContextMenu,
    handleNodeContextMenu,
    closeContextMenu,
    handleDuplicate,
    handleAddToSelection,
    handleCreateTask,
    handleDelete,
  };
}
