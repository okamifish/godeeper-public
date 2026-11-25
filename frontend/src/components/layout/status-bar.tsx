"use client";

import { useCanvasStore } from "@/lib/canvas-store";
import { useT, type S } from "@/lib/i18n";

const saveStateKeys: Record<string, S> = {
  Saved: "saved",
  Saving: "saving",
  Unsaved: "unsaved",
  Streaming: "streaming",
  Importing: "importing",
  Error: "saveError",
};

export function StatusBar() {
  const { nodes, edges, saveState, defaultModel, modelName, validatedModels } = useCanvasStore();
  const t = useT();

  const totalNodes = nodes.length;
  const totalEdges = edges.length;
  const runningTasks = nodes.filter((n) => n.data.kind === "task" && n.data.taskStatus === "running").length;
  const currentModel = defaultModel || modelName;
  const activeModel = validatedModels.includes(currentModel) ? (currentModel || null) : null;
  const key = saveStateKeys[saveState];
  const saveLabel = key ? t(key) : t("unsaved");

  return (
    <footer className="statusbar glass-panel">
      {activeModel ? <span>{activeModel}</span> : <span className="status-dim">{t("noModel")}</span>}
      <span className={saveState === "Error" ? "status-error" : undefined}>{saveLabel}</span>
      <span className="status-hide-sm">{totalNodes} {t("nodes")} · {totalEdges} {t("links")}</span>
      {runningTasks > 0 && <span className="status-running">{runningTasks} {t("running")}</span>}
      {activeModel ? (
        <span className="status-connected status-hide-sm">{t("apiConnected")}</span>
      ) : (
        <span className="status-dim status-hide-sm">{t("localMode")}</span>
      )}
      <span className="status-hide-sm">/ {t("search")} · ? {t("shortcuts")}</span>
    </footer>
  );
}
