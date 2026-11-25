"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ReadOnlyCanvas } from "@/components/canvas/read-only-canvas";
import { api } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { AuthDialog } from "@/components/auth/auth-dialog";
import type { CanvasEdgeSeed, CanvasNodeSeed } from "@/lib/types";

interface ShareView {
  canvasId: string;
  canvasTitle: string;
  canvasSnapshot: { nodes?: CanvasNodeSeed[]; edges?: CanvasEdgeSeed[] } | null;
  allowComment: boolean;
  expiresAt: string | null;
}

interface CommentRow {
  id: string;
  nodeId: string | null;
  userId: string;
  content: string;
  createdAt: string;
  authorName: string | null;
}

function SharedCanvasInner({ token }: { token: string }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [view, setView] = useState<ShareView | null>(null);
  const [allowComment, setAllowComment] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [commentError, setCommentError] = useState("");

  useEffect(() => {
    setAuthenticated(isAuthenticated());
  }, []);

  const loadComments = useCallback(async () => {
    try {
      const result = await api.listShareComments(token) as { allowComment: boolean; comments: CommentRow[] };
      setAllowComment(result.allowComment);
      setComments(Array.isArray(result.comments) ? result.comments : []);
    } catch {
      // 画布加载失败时不再重复报错
    }
  }, [token]);

  useEffect(() => {
    if (!authenticated) {
      setAuthOpen(true);
      return;
    }
    let active = true;
    setError("");
    api.viewShare(token)
      .then((data) => {
        if (active) setView(data as ShareView);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "无法加载分享画布");
      });
    void loadComments();
    return () => {
      active = false;
    };
  }, [authenticated, token, loadComments]);

  const nodeCount = Array.isArray(view?.canvasSnapshot?.nodes) ? view!.canvasSnapshot!.nodes!.length : 0;
  const edgeCount = Array.isArray(view?.canvasSnapshot?.edges) ? view!.canvasSnapshot!.edges!.length : 0;

  const submitComment = async () => {
    const content = draft.trim();
    if (!content) return;
    setPosting(true);
    setCommentError("");
    try {
      await api.createShareComment(token, content);
      setDraft("");
      await loadComments();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "留言失败");
    } finally {
      setPosting(false);
    }
  };

  if (!authenticated) {
    return (
      <ShareShell title="需要登录">
        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: 22 }}>登录后即可查看分享画布</h1>
          <p style={{ color: "#6b7280", marginTop: 8 }}>
            画布默认只有主人可查看；分享链接会把观看者带回 GoDeeper，并要求登录。
          </p>
          <button className="primary-button" onClick={() => setAuthOpen(true)}>登录 GoDeeper</button>
          <AuthDialog
            open={authOpen}
            onOpenChange={setAuthOpen}
            onSuccess={() => setAuthenticated(true)}
          />
        </div>
      </ShareShell>
    );
  }

  if (error) {
    return (
      <ShareShell title="链接不可用">
        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: 22 }}>这条分享链接已失效</h1>
          <p style={{ color: "#6b7280", marginTop: 8 }}>{error}</p>
          <Link href="/" className="primary-button" style={{ textDecoration: "none", display: "inline-block" }}>
            打开我的画布
          </Link>
        </div>
      </ShareShell>
    );
  }

  if (!view) {
    return (
      <ShareShell title="加载中">
        <div style={cardStyle}>
          <p style={{ margin: 0, color: "#6b7280" }}>正在加载画布…</p>
        </div>
      </ShareShell>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#f5f3ee" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          borderBottom: "1px solid #e5e1d8",
          background: "#fffdf9",
        }}
      >
        <div style={{ fontFamily: "monospace", fontWeight: 700 }}>GD</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {view.canvasTitle || "Untitled Canvas"}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            只读分享 · {nodeCount} 个节点 · {edgeCount} 条连线
            {view.expiresAt ? ` · ${new Date(view.expiresAt).toLocaleString()} 失效` : ""}
          </div>
        </div>
        <Link href="/" className="ghost-button" style={{ textDecoration: "none" }}>打开我的画布</Link>
      </header>

      <ReadOnlyCanvas snapshot={view.canvasSnapshot}>
        <h2 style={{ margin: 0, fontSize: 15 }}>留言 · {comments.length}</h2>

          {comments.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>还没有留言。</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {comments.map((comment) => (
                <div key={comment.id} style={{ borderBottom: "1px solid #f0ece4", paddingBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {comment.authorName || "匿名"} · {new Date(comment.createdAt).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 2, whiteSpace: "pre-wrap" }}>{comment.content}</div>
                </div>
              ))}
            </div>
          )}

          {allowComment ? (
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="给画布主人留言…"
                rows={3}
                maxLength={2000}
                style={{
                  width: "100%",
                  resize: "vertical",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #e5e1d8",
                  fontFamily: "inherit",
                  fontSize: 13,
                }}
              />
              {commentError ? <span style={{ color: "#ba1a1a", fontSize: 12 }}>{commentError}</span> : null}
              <button className="primary-button" onClick={() => void submitComment()} disabled={posting || !draft.trim()}>
                {posting ? "发送中…" : "发送留言"}
              </button>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: "auto" }}>
              主人已关闭留言。想看更多？可以请主人导出 JSON 给你完整编辑权。
            </p>
          )}
      </ReadOnlyCanvas>
    </div>
  );
}

const cardStyle = {
  background: "#fffdf9",
  border: "1px solid #e5e1d8",
  borderRadius: 10,
  padding: "24px 28px",
  maxWidth: 480,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "flex-start",
  gap: 8,
};

function ShareShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f5f3ee", display: "grid", placeItems: "center", padding: 24 }}>
      <div>
        <div style={{ fontSize: 12, letterSpacing: "0.08em", color: "#6b7280", marginBottom: 10, textAlign: "center" }}>
          GODEEPER · {title}
        </div>
        {children}
      </div>
    </div>
  );
}

export default function SharedCanvasPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token ?? "";

  return (
    <ReactFlowProvider>
      <SharedCanvasInner token={token} />
    </ReactFlowProvider>
  );
}
