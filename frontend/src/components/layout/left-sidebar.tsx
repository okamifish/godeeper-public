"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import { isAuthenticated, AUTH_CHANGED_EVENT, getUser } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { NodeKind } from "@/lib/types";
import { NODE_KIND_COLORS } from "@/lib/node-colors";
import { TrashSection } from "@/pro";
import { Plus, PanelLeft, PanelLeftClose, Trash2 } from "lucide-react";

interface CloudCanvas {
  id: string;
  title: string;
  nodeCount: number;
  updatedAt: string;
}

interface CloudCanvasRow {
  id: string;
  title?: string;
  nodeCount?: number;
  updatedAt?: string;
  deletedAt?: string;
}

const subscribeToClient = () => () => {};

const RECENT_DOT: Record<NodeKind, string> = NODE_KIND_COLORS;

function canvasGlyph(name: string) {
  const compact = name.replace(/\s+/g, "");
  return (compact.slice(0, 2) || "GD").toUpperCase();
}

export function LeftSidebar() {
  const {
    activeCanvasId,
    setActiveCanvasId,
    canvases,
    createNewCanvas,
    nodes,
    mobileMenuOpen,
    setMobileMenuOpen,
    focusNode,
    deleteCanvas,
    canvasHistory,
    goBackCanvas,
    validatedModels,
    modelName,
    defaultModel,
  } = useCanvasStore();
  const t = useT();
  const [cloudCanvases, setCloudCanvases] = useState<CloudCanvas[]>([]);
  const [trashCanvases, setTrashCanvases] = useState<CloudCanvasRow[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const authUserIdRef = useRef<string | null | undefined>(undefined);
  const canRestore = mounted && hasCapability(getUser(), "canvas.restore");

  useEffect(() => {
    const loadCloudCanvases = () => {
      // 只有“换账号/退出登录”才清空画布；删除/恢复画布触发的刷新不能误清空
      const currentUserId = getUser()?.id ?? null;
      if (authUserIdRef.current !== currentUserId) {
        authUserIdRef.current = currentUserId;
        useCanvasStore.getState().resetForAuthChange();
      }

      if (!isAuthenticated()) {
        setCloudCanvases([]);
        setTrashCanvases([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      api.listCanvases()
        .then((rows: CloudCanvasRow[]) => {
          const mapped = rows.map((r) => ({
            id: r.id,
            title: r.title ?? "Untitled",
            nodeCount: r.nodeCount ?? 0,
            updatedAt: r.updatedAt ?? "",
          }));
          setCloudCanvases(mapped);
          const currentId = useCanvasStore.getState().activeCanvasId;
          const belongsToCurrentUser = mapped.some((canvas) => canvas.id === currentId);
          if (mapped.length > 0) {
            // 当前画布不属于这个账号（例如刚切换账号）时，切到该账号自己的第一张画布
            if (!belongsToCurrentUser) {
              setActiveCanvasId(mapped[0].id);
            }
          } else {
            // 新账号还没有云端画布：创建一张空白画布，避免继续显示上一个账号内容
            void useCanvasStore.getState().createNewCanvas();
          }
        })
        .catch(() => {
          /* cloud list unavailable — local mode fallback */
        })
        .finally(() => setLoading(false));

      if (hasCapability(getUser(), "canvas.restore")) {
        api.listDeletedCanvases()
          .then((rows: CloudCanvasRow[]) => setTrashCanvases(rows))
          .catch(() => setTrashCanvases([]));
      } else {
        setTrashCanvases([]);
      }
    };

    loadCloudCanvases();
    window.addEventListener(AUTH_CHANGED_EVENT, loadCloudCanvases);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, loadCloudCanvases);
  }, [setActiveCanvasId]);

  // Local canvas entries
  const localEntries = Object.keys(canvases).map((id) => {
    const canvas = canvases[id];
    const nodeCount = canvas?.nodes?.length ?? 0;
    return {
      id,
      name: canvas?.canvasName ?? canvas?.nodes?.[0]?.title ?? "Untitled",
      meta: `${nodeCount} ${t("nodes")}`,
      isCloud: false,
    };
  });

  // Cloud canvas entries (skip ones already in local)
  const localIds = new Set(Object.keys(canvases));
  const cloudEntries = cloudCanvases
    .filter((c) => !localIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.title,
      meta: `${c.nodeCount} ${t("nodes")}`,
      isCloud: true,
    }));

  const allEntries = [...localEntries, ...cloudEntries];

  const recentNotes = nodes
    .filter((n) => n.data.kind === "text" || n.data.kind === "free" || n.data.kind === "link")
    .slice(-5)
    .reverse()
    .map((n) => ({ id: n.id, title: n.data.title, kind: n.data.kind }))
    .filter((n) => Boolean(n.title));

  const handleDelete = (canvasId: string) => {
    if (confirmDeleteId === canvasId) {
      void deleteCanvas(canvasId).then(() => {
        window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
      });
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(canvasId);
      setTimeout(() => setConfirmDeleteId((prev) => (prev === canvasId ? null : prev)), 3000);
    }
  };

  const handleRestore = async (canvasId: string) => {
    try {
      await api.restoreCanvas(canvasId);
      setTrashCanvases((prev) => prev.filter((item) => item.id !== canvasId));
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
      toast.success(t("restored"));
    } catch {
      toast.error(t("canvasRestoreFailed"));
    }
  };

  const footLabel = mounted && validatedModels.includes(defaultModel || modelName) ? t("apiConnected") : t("localMode");

  return (
    <>
      {mobileMenuOpen && (
        <div className="side-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}
      <aside
        aria-label={t("canvases")}
        className={`left-sidebar${mobileMenuOpen ? " mobile-open" : ""}${collapsed ? " collapsed" : ""}`}
      >
        <div className="side-head">
          {collapsed ? (
            <button
              className="side-collapse"
              onClick={() => setCollapsed(false)}
              title={t("expandSidebar")}
            >
              <PanelLeft size={16} />
            </button>
          ) : (
            <>
              <button className="new-canvas" onClick={createNewCanvas}>
                <Plus size={14} />
                {t("newCanvas").replace("+ ", "")}
              </button>
              <button
                className="side-collapse"
                onClick={() => setCollapsed(true)}
                title={t("collapseSidebar")}
              >
                <PanelLeftClose size={15} />
              </button>
            </>
          )}
        </div>

        {!collapsed && (
          <>
            {canvasHistory.length > 0 && (
              <div className="side-sec">
                <button className="side-back" onClick={goBackCanvas}>← {t("goBack")}</button>
              </div>
            )}

            <div className="side-sec">
              <div className="side-label">{t("canvases")}</div>
              {mounted && loading && isAuthenticated() && (
                <>
                  <div className="canvas-card-skeleton" />
                  <div className="canvas-card-skeleton" />
                </>
              )}
              {allEntries.map((canvas) => (
                <div key={canvas.id} className={`side-item${canvas.id === activeCanvasId ? " active" : ""}`}>
                  <button
                    className="side-item-main"
                    onClick={() => { setActiveCanvasId(canvas.id); setMobileMenuOpen(false); }}
                  >
                    <span className="ico">{canvasGlyph(canvas.name)}</span>
                    <span className="side-item-title">{canvas.name}</span>
                    <span className="meta">{canvas.meta}</span>
                  </button>
                  <button
                    className={`side-item-delete${confirmDeleteId === canvas.id ? " confirm" : ""}`}
                    onClick={(event) => { event.stopPropagation(); handleDelete(canvas.id); }}
                    title={confirmDeleteId === canvas.id ? t("confirmDelete") : t("deleteCanvas")}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>

            {canRestore && trashCanvases.length > 0 && (
              <TrashSection
                canvases={trashCanvases.map((canvas) => ({
                  id: canvas.id,
                  title: canvas.title,
                }))}
                onRestore={(id) => void handleRestore(id)}
                labels={{ trash: t("trash"), restore: t("restore") }}
              />
            )}

            {recentNotes.length > 0 && (
              <div className="side-sec">
                <div className="side-label">{t("recentNodes")}</div>
                {recentNotes.map((note) => (
                  <button
                    key={note.id}
                    className="side-item side-item-button"
                    onClick={() => { focusNode(note.id); setMobileMenuOpen(false); }}
                  >
                    <span
                      className="nodedot"
                      style={{ background: RECENT_DOT[note.kind] ?? "#8d8679" }}
                    />
                    <span className="side-item-title">{note.title}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="side-foot">
              <span className="dot" />
              {footLabel} · {t("autosaveOn")}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
