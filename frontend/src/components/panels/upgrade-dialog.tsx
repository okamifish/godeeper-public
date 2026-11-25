"use client";

import { useCanvasStore } from "@/lib/canvas-store";
import { Sparkles } from "lucide-react";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 免费用户点击“跨画布”搜索结果时的升级提示；不展示任何原始错误码 */
export function UpgradeDialog({ open, onOpenChange }: UpgradeDialogProps) {
  const setProfileOpen = useCanvasStore((s) => s.setProfileOpen);

  if (!open) return null;

  const viewPlan = () => {
    onOpenChange(false);
    setProfileOpen(true);
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
        aria-label="升级 Pro"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(460px, calc(100vw - 32px))",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "22px 24px",
          borderRadius: 16,
          background: "rgba(255, 255, 255, 0.97)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "rgba(61, 90, 254, 0.1)",
              color: "#3d5afe",
              flex: "0 0 auto",
            }}
          >
            <Sparkles size={17} />
          </span>
          <h2 style={{ margin: 0, fontSize: 19, lineHeight: 1.35 }}>跨画布搜索是 Pro 功能</h2>
        </div>

        <p style={{ margin: 0, fontSize: 14, color: "#4b443b" }}>
          升级 Pro 后，可以在你所有的画布中搜索节点，并直接跳转到目标画布和节点。
          免费用户仍然可以使用当前画布内的搜索。
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ghost-button" onClick={() => onOpenChange(false)}>
            稍后再说
          </button>
          <button className="primary-button" onClick={viewPlan}>
            查看我的方案
          </button>
        </div>
      </section>
    </div>
  );
}
