"use client";

import { useSyncExternalStore } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT, type S } from "@/lib/i18n";

const subscribeToClient = () => () => {};

const saveStateKeys: Record<string, S> = {
  Saved: "saved",
  Saving: "saving",
  Unsaved: "unsaved",
  Streaming: "streaming",
  Importing: "importing",
  Error: "saveError",
};

export function CanvasStatusTop() {
  const { nodes, edges, selectedNodeIds, saveState, defaultModel, modelName, validatedModels } = useCanvasStore();
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const t = useT();

  const totalNodes = nodes.length;
  const totalEdges = edges.length;
  const runningTasks = nodes.filter((n) => n.data.kind === "task" && n.data.taskStatus === "running").length;
  const currentModel = defaultModel || modelName;
  const activeModel = mounted && validatedModels.includes(currentModel) ? (currentModel || null) : null;
  const hasApiConfig = Boolean(activeModel);
  const key = saveStateKeys[saveState];
  const saveLabel = key ? t(key) : t("unsaved");

  return (
    <div className="canvas-status-top">
      {activeModel ? <span>{activeModel}</span> : <span className="status-dim">{t("noModel")}</span>}
      <span className={saveState === "Error" ? "status-error" : undefined}>{saveLabel}</span>
      <span>{totalNodes} {t("nodes")} {" · "} {totalEdges} {t("links")}</span>
      {selectedNodeIds.length > 0 && <span>{selectedNodeIds.length} {t("selected")}</span>}
      {runningTasks > 0 && <span className="status-running">{runningTasks} {t("running")}</span>}
      {hasApiConfig ? (
        <span className="status-connected status-hide-md">{t("apiConnected")}</span>
      ) : (
        <span className="status-dim status-hide-md">{t("localMode")}</span>
      )}
      <span className="status-hide-md">/ {t("search")} {" · "} ? {t("shortcuts")}</span>
    </div>
  );
}
