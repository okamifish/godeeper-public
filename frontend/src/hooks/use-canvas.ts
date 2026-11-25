"use client";

import { useCallback, useRef } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { canvasAdapter } from "@/lib/adapters";
import type { CanvasData } from "@/lib/api";

export function useCanvas() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const activeCanvasId = useCanvasStore((s) => s.activeCanvasId);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snapshot = useCallback((): CanvasData => ({
    id: activeCanvasId,
    name: activeCanvasId,
    nodes,
    edges,
    createdAt: "",
    updatedAt: new Date().toISOString(),
  }), [activeCanvasId, nodes, edges]);

  const save = useCallback(async () => {
    const data = snapshot();
    await canvasAdapter.saveCanvas(data);
  }, [snapshot]);

  const autoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(), 30000);
  }, [save]);

  const saveNow = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await save();
  }, [save]);

  const load = useCallback(async (id: string) => {
    const data = await canvasAdapter.getCanvas(id);
    if (data) {
      useCanvasStore.setState({
        nodes: data.nodes,
        edges: data.edges,
        activeCanvasId: id,
      });
    }
  }, []);

  return { snapshot, save: saveNow, autoSave, load };
}
