"use client";

import { useCallback, useEffect, useState } from "react";
import { useCanvasStore, toCanvasStateSnapshot } from "@/lib/canvas-store";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Copy, Link2, Trash2 } from "lucide-react";

interface CommentRow {
  id: string;
  nodeId?: string | null;
  content: string;
  createdAt: string;
  authorName: string | null;
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publicUrl(canvasId: string) {
  if (typeof window === "undefined") return `/p/${canvasId}`;
  return `${window.location.origin}/p/${canvasId}`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("链接已复制");
  } catch {
    toast.error("复制失败，请手动复制链接");
  }
}

export function ShareDialog({ open, onOpenChange }: ShareDialogProps) {
  const activeCanvasId = useCanvasStore((s) => s.activeCanvasId);
  const canvasName = useCanvasStore((s) => s.canvasName);

  const [isPublic, setIsPublic] = useState(false);
  const [allowPublicComments, setAllowPublicComments] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [commentsBusy, setCommentsBusy] = useState(false);
  const [savingToCloud, setSavingToCloud] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [error, setError] = useState("");

  const isCloudCanvas = UUID_RE.test(activeCanvasId);

  const loadComments = useCallback(async () => {
    if (!isCloudCanvas) return;
    setCommentsLoading(true);
    try {
      const rows = await api.listComments(activeCanvasId) as CommentRow[];
      setComments(Array.isArray(rows) ? rows : []);
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [activeCanvasId, isCloudCanvas]);

  useEffect(() => {
    if (!open || !isCloudCanvas) {
      setIsPublic(false);
      setAllowPublicComments(true);
      setComments([]);
      return;
    }
    let active = true;
    api.getCanvas(activeCanvasId)
      .then((canvas: { isPublic?: boolean; allowPublicComments?: boolean }) => {
        if (!active) return;
        setIsPublic(Boolean(canvas?.isPublic));
        setAllowPublicComments(canvas?.allowPublicComments ?? true);
      })
      .catch(() => {
        if (active) setIsPublic(false);
      });
    void loadComments();
    return () => {
      active = false;
    };
  }, [open, activeCanvasId, isCloudCanvas, loadComments]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const saveCurrentCanvasToCloud = async () => {
    const state = useCanvasStore.getState();
    const snapshot = toCanvasStateSnapshot(state);
    const canvas = await api.createCanvas(state.canvasName || "Untitled Canvas") as { id: string };
    await api.saveSnapshot(canvas.id, snapshot);
    await api.syncNodes(
      canvas.id,
      snapshot.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        title: node.title,
        body: node.body ?? "",
      })),
      [],
      true,
    );
    await useCanvasStore.getState().setActiveCanvasId(canvas.id);
    return canvas.id;
  };

  const handleSaveToCloudAndPublish = async () => {
    setSavingToCloud(true);
    setError("");
    try {
      const canvasId = await saveCurrentCanvasToCloud();
      await api.updateCanvas(canvasId, { isPublic: true, allowPublicComments: true });
      setIsPublic(true);
      setAllowPublicComments(true);
      await copy(publicUrl(canvasId));
      toast.success("已保存到云端并发布；读者登录后可以留言");
      void loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存到云端失败，请重试");
    } finally {
      setSavingToCloud(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!isCloudCanvas) return;
    setPublishing(true);
    setError("");
    const next = !isPublic;
    try {
      await api.updateCanvas(activeCanvasId, { isPublic: next });
      setIsPublic(next);
      if (next) {
        await copy(publicUrl(activeCanvasId));
        toast.success("画布已发布，拿到链接的人无需登录即可查看");
        void loadComments();
      } else {
        toast.success("已取消发布");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "发布状态更新失败");
    } finally {
      setPublishing(false);
    }
  };

  const handleToggleComments = async () => {
    if (!isCloudCanvas) return;
    setCommentsBusy(true);
    setError("");
    const next = !allowPublicComments;
    try {
      await api.updateCanvas(activeCanvasId, { allowPublicComments: next });
      setAllowPublicComments(next);
      toast.success(next ? "已允许登录用户留言" : "已关闭留言");
    } catch (err) {
      setError(err instanceof Error ? err.message : "留言开关更新失败");
    } finally {
      setCommentsBusy(false);
    }
  };

  const handleDeleteComment = async (id: string) => {
    setCommentsBusy(true);
    try {
      await api.deleteComment(id);
      setComments((prev) => prev.filter((item) => item.id !== id));
      toast.success("留言已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除留言失败");
    } finally {
      setCommentsBusy(false);
    }
  };

  return (
    <div
      className="modal-shell"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <section
        className="glass-panel"
        role="dialog"
        aria-modal="true"
        aria-label="发布"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "min(80vh, 720px)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "20px 22px",
          borderRadius: 16,
          background: "rgba(255, 255, 255, 0.97)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 19, lineHeight: 1.35 }}>
              发布「{canvasName || "Untitled Canvas"}」
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
              任何人拿到链接都能只读查看；留言需要登录，而且只有你能看到。
            </p>
          </div>
          <button
            className="ghost-button"
            style={{ whiteSpace: "nowrap", flexShrink: 0 }}
            onClick={() => onOpenChange(false)}
          >
            关闭
          </button>
        </div>

        {!isCloudCanvas ? (
          <>
            <div style={{ border: "1px solid #e6cbb0", background: "#f9eedf", borderRadius: 8, padding: "12px 14px" }}>
              <p style={{ margin: 0, fontSize: 14 }}>
                这张画布还没有保存到云端，无法发布。先把当前内容保存到你账号的一张新画布，再生成公开链接。
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="primary-button"
                onClick={() => void handleSaveToCloudAndPublish()}
                disabled={savingToCloud}
              >
                {savingToCloud ? "保存中…" : "保存到云端并发布"}
              </button>
              <button className="ghost-button" onClick={() => onOpenChange(false)} disabled={savingToCloud}>
                稍后再说
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="setting-row" style={{ padding: "10px 12px", border: "1px solid #e5e1d8", borderRadius: 8 }}>
              <span>公开发布（无需登录即可查看）</span>
              <button
                className={`segment ${isPublic ? "active" : ""}`}
                onClick={() => void handleTogglePublish()}
                aria-pressed={isPublic}
                disabled={publishing}
                style={{ whiteSpace: "nowrap" }}
              >
                {publishing ? "处理中…" : isPublic ? "已发布" : "未发布"}
              </button>
            </div>

            {isPublic && (
              <div
                style={{
                  border: "1px solid #e5e1d8",
                  borderRadius: 8,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#fffdf9",
                }}
              >
                <Link2 size={14} style={{ flexShrink: 0 }} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12,
                    fontFamily: "monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={publicUrl(activeCanvasId)}
                >
                  {publicUrl(activeCanvasId)}
                </span>
                <button
                  className="ghost-button small"
                  onClick={() => void copy(publicUrl(activeCanvasId))}
                  title="复制公开链接"
                >
                  <Copy size={13} />
                </button>
              </div>
            )}

            <div className="setting-row" style={{ padding: "10px 12px", border: "1px solid #e5e1d8", borderRadius: 8 }}>
              <span>
                允许登录用户留言
                <span style={{ display: "block", fontSize: 12, color: "#6b7280", fontWeight: 400 }}>
                  默认开启；留言只有你能看到
                </span>
              </span>
              <button
                className={`segment ${allowPublicComments ? "active" : ""}`}
                onClick={() => void handleToggleComments()}
                aria-pressed={allowPublicComments}
                disabled={commentsBusy || !isPublic}
                style={{ whiteSpace: "nowrap" }}
              >
                {allowPublicComments ? "已开放" : "已关闭"}
              </button>
            </div>

            {!isPublic ? (
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                发布后，读者登录即可留言；留言只有你能看到。
              </p>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <h3 style={{ fontSize: 14, margin: 0 }}>读者留言 · {comments.length}</h3>
                  <button
                    className="ghost-button small"
                    onClick={() => void loadComments()}
                    disabled={commentsLoading}
                  >
                    {commentsLoading ? "刷新中…" : "刷新"}
                  </button>
                </div>

                {!allowPublicComments ? (
                  <p style={{ fontSize: 13, color: "#6b7280", margin: "8px 0 0" }}>
                    留言已关闭，读者无法提交新的留言。
                  </p>
                ) : comments.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#6b7280", margin: "8px 0 0" }}>还没有读者留言。</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        style={{
                          border: "1px solid #e5e1d8",
                          borderRadius: 8,
                          padding: "10px 12px",
                          background: "#fffdf9",
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ flex: 1, fontSize: 12, color: "#6b7280" }}>
                            {comment.authorName || "匿名读者"} · {new Date(comment.createdAt).toLocaleString()}
                          </span>
                          <button
                            className="ghost-button small danger-text"
                            onClick={() => void handleDeleteComment(comment.id)}
                            disabled={commentsBusy}
                            title="删除留言"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{comment.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {error ? <p style={{ color: "#ba1a1a", fontSize: 13, margin: 0 }}>{error}</p> : null}
      </section>
    </div>
  );
}
