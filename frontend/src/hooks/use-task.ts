"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useCanvasStore } from "@/lib/canvas-store";
import { taskAdapter } from "@/lib/adapters";
import { t } from "@/lib/i18n";

export function useTask() {
  const runTaskStore = useCanvasStore((s) => s.runTask);
  const cancelTaskStore = useCanvasStore((s) => s.cancelTask);

  const runTask = useCallback(async (taskNodeId: string) => {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === taskNodeId);
    if (!node) return;

    const prompt = node.data.body;
    const chips = node.data.chips ?? [];
    const lang = useCanvasStore.getState().language;
    const model = useCanvasStore.getState().defaultModel || useCanvasStore.getState().modelName;

    try {
      await taskAdapter.runTask(taskNodeId, prompt, chips, model || undefined);
      toast.success(t("taskCompleted", lang));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info(t("taskCancelled", lang));
        return;
      }
      toast.error(t("taskFailed", lang), { description: err instanceof Error ? err.message : t("unknownError", lang) });
      throw err;
    }
  }, []);

  const cancelTask = useCallback((taskNodeId: string) => {
    taskAdapter.cancelTask(taskNodeId);
    cancelTaskStore(taskNodeId);
  }, [cancelTaskStore]);

  const runTaskLocal = useCallback((taskNodeId?: string) => {
    runTaskStore(taskNodeId);
  }, [runTaskStore]);

  return { runTask, runTaskLocal, cancelTask };
}
