"use client";

import { useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import { GROUP_COLORS, getGroupColor } from "@/lib/group-model";
import type { GoDeeperFlowNode } from "@/lib/types";
import { X } from "lucide-react";

export function GroupFrameNode({ data }: NodeProps<GoDeeperFlowNode>) {
  const renameGroup = useCanvasStore((state) => state.renameGroup);
  const setGroupColor = useCanvasStore((state) => state.setGroupColor);
  const deleteGroup = useCanvasStore((state) => state.deleteGroup);
  const t = useT();

  const groupId = (data as unknown as { groupId?: string }).groupId ?? "";
  const title = (data as unknown as { groupTitle?: string }).groupTitle ?? data.title;
  const colorId = (data as unknown as { groupColor?: string }).groupColor ?? "blue";
  const color = getGroupColor(colorId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(title);
      inputRef.current?.focus();
    }
  }, [editing, title]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== title) renameGroup(groupId, next);
    setEditing(false);
  };

  return (
    <div
      className="canvas-group-frame"
      style={{ borderColor: color.stroke, background: color.fill }}
    >
      <div className="canvas-group-head" onDoubleClick={() => setEditing(true)}>
        {editing ? (
          <input
            ref={inputRef}
            className="canvas-group-title-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") setEditing(false);
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="canvas-group-title" title={t("groupRenameHint")}>
            {title}
          </span>
        )}
        <div className="canvas-group-colors">
          {GROUP_COLORS.map((item) => (
            <button
              key={item.id}
              className={`canvas-group-color${item.id === colorId ? " active" : ""}`}
              style={{ background: item.stroke }}
              title={item.label.zh}
              aria-label={item.label.zh}
              onClick={(event) => {
                event.stopPropagation();
                setGroupColor(groupId, item.id);
              }}
            />
          ))}
        </div>
        <button
          className="canvas-group-remove"
          title={t("groupUngroup")}
          aria-label={t("groupUngroup")}
          onClick={(event) => {
            event.stopPropagation();
            deleteGroup(groupId);
          }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
