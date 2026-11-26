"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ReadOnlyCanvas } from "@/components/canvas/read-only-canvas";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { api } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import type { CanvasEdgeSeed, CanvasNodeSeed } from "@/lib/types";

interface PublicCanvasView {
  canvasId: string;
  title: string;
  snapshot: { nodes?: CanvasNodeSeed[]; edges?: CanvasEdgeSeed[] } | null;
  updatedAt: string;
  commentsEnabled: boolean;
}

function PublicCanvasInner({ id }: { id: string }) {
  const [view, setView] = useState<PublicCanvasView | null>(null);
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [commentSent, setCommentSent] = useState(false);

  useEffect(() => {
    setAuthenticated(isAuthenticated());
  }, []);

  useEffect(() => {
    let active = true;
    setError("");
    api.getPublicCanvas(id)
      .then((data) => {
        if (active) setView(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "无法加载画布");
      });
    return () => {
      active = false;
    };
  }, [id]);

  const submitComment = async () => {
    const content = draft.trim();
    if (!content || !view) return;
    setPosting(true);
    setCommentError("");
    try {
      await api.createPublicComment(view.canvasId, content);
      setDraft("");
      setCommentSent(true);
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "留言失败，请稍后重试");
    } finally {
      setPosting(false);
    }
  };

  if (error) {
    return (
      <PublicShell title="画布不可用">
        <div style={cardStyle} role="alert">
          <h1 style={{ margin: 0, fontSize: 22 }}>这张画布没有公开</h1>
          <p style={{ color: "#6b7280", marginTop: 8 }}>
            可能已被取消发布，或链接不正确。
          </p>
          <Link href="/" className="primary-button" style={{ textDecoration: "none", display: "inline-block" }}>
            打开 GoDeeper
          </Link>
        </div>
      </PublicShell>
    );
  }

  if (!view) {
    return (
      <PublicShell title="加载中">
        <div style={cardStyle}>
          <p style={{ margin: 0, color: "#6b7280" }}>正在加载画布…</p>
        </div>
      </PublicShell>
    );
  }

  const nodeCount = Array.isArray(view.snapshot?.nodes) ? view.snapshot!.nodes!.length : 0;
  const edgeCount = Array.isArray(view.snapshot?.edges) ? view.snapshot!.edges!.length : 0;

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
            {view.title || "Untitled Canvas"}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            公开发布 · {nodeCount} 个节点 · {edgeCount} 条连线
          </div>
        </div>
        <Link href="/" className="primary-button" style={{ textDecoration: "none" }}>
          用 GoDeeper 打开
        </Link>
      </header>

      <ReadOnlyCanvas snapshot={view.snapshot}>
        {view.commentsEnabled ? (
          <>
            <h2 style={{ margin: 0, fontSize: 15 }}>给作者留言</h2>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              留言需要登录，只有作者能看到。
            </p>

            {!authenticated ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="primary-button" onClick={() => setAuthOpen(true)}>
                  登录后留言
                </button>
                <Link href="/" style={{ fontSize: 12, color: "#6b7280", textDecoration: "none" }}>
                  先看看 GoDeeper →
                </Link>
              </div>
            ) : commentSent ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#107c58" }}>
                  留言已发送给作者。只有作者能看到，感谢你的反馈。
                </p>
                <button
                  className="ghost-button small"
                  onClick={() => setCommentSent(false)}
                >
                  再写一条
                </button>
              </div>
            ) : (
              <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="写点你的看法…"
                  rows={4}
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
                {commentError ? <span role="alert" style={{ color: "#ba1a1a", fontSize: 12 }}>{commentError}</span> : null}
                <button
                  className="primary-button"
                  onClick={() => void submitComment()}
                  disabled={posting || !draft.trim()}
                >
                  {posting ? "发送中…" : "发送留言"}
                </button>
              </div>
            )}
          </>
        ) : null}
      </ReadOnlyCanvas>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onSuccess={() => setAuthenticated(true)}
      />
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

function PublicShell({ title, children }: { title: string; children: React.ReactNode }) {
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

export function PublicCanvasClient({ id }: { id: string }) {
  return (
    <ReactFlowProvider>
      <PublicCanvasInner id={id} />
    </ReactFlowProvider>
  );
}
