"use client";

import { useState, useRef, useEffect } from "react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useRevealNode } from "@/hooks/use-reveal-node";
import { countTextWithoutMentions, findMentionTrigger, insertMention, type MentionTarget } from "@/lib/mentions";
import { MAX_NODE_BODY_CHARS, clampNodeBody } from "@/lib/node-body";
import { NodeMarkdown, highlightPlainText } from "./node-markdown";

interface UseNodeEditOptions {
  nodeId: string;
  title: string;
  body: string;
}

export function useNodeEdit({ nodeId, title, body }: UseNodeEditOptions) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const addSiblingNode = useCanvasStore((state) => state.addSiblingNode);
  const addChildNode = useCanvasStore((state) => state.addChildNode);
  const autoEditNodeId = useCanvasStore((state) => state.autoEditNodeId);
  const clearAutoEdit = useCanvasStore((state) => state.clearAutoEdit);
  const pushHistory = useCanvasStore((state) => state.pushHistory);
  const revealNode = useRevealNode();

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [editBody, setEditBody] = useState(body);

  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (autoEditNodeId === nodeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 由 store 的 autoEdit 请求触发，需要在挂载后同步一次
      setIsEditing(true);
      setEditTitle(title);
      setEditBody(body);
      clearAutoEdit();
    }
  }, [autoEditNodeId, nodeId, title, body, clearAutoEdit]);

  const handleDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsEditing(true);
    setEditTitle(title);
    setEditBody(body);
  };

  const handleSave = () => {
    if (editTitle.trim() !== title || editBody.trim() !== body) {
      pushHistory();
      updateNodeData(nodeId, { title: editTitle.trim(), body: editBody.trim() });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSave();
      return;
    }
    if (event.key === "Enter" && event.altKey && isEditing) {
      event.preventDefault();
      handleSave();
      const newId = addChildNode(nodeId);
      if (newId) revealNode(newId, nodeId);
      return;
    }
    if (event.key === "Escape") {
      setEditTitle(title);
      setEditBody(body);
      setIsEditing(false);
    }
  };

  return {
    isEditing,
    editTitle,
    editBody,
    setEditTitle,
    setEditBody,
    titleInputRef,
    bodyInputRef,
    handleDoubleClick,
    handleSave,
    handleKeyDown,
  };
}

interface NodeEditContainerProps {
  nodeId: string;
  editTitle: string;
  editBody: string;
  titleInputRef: React.RefObject<HTMLTextAreaElement | null>;
  bodyInputRef: React.RefObject<HTMLTextAreaElement | null>;
  onEditTitleChange: (value: string) => void;
  onEditBodyChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onSave: () => void;
  hintText: string;
  displayTitle: string;
  displayBody: string;
  isEditing: boolean;
  searchQuery?: string;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  bodyCollapsed?: boolean;
  canCollapseBody?: boolean;
  onToggleBody?: () => void;
  collapseLabel?: string;
  expandLabel?: string;
}

export function NodeEditContainer({
  nodeId,
  editTitle,
  editBody,
  titleInputRef,
  bodyInputRef,
  onEditTitleChange,
  onEditBodyChange,
  onKeyDown,
  onSave,
  hintText,
  displayTitle,
  displayBody,
  isEditing,
  searchQuery = "",
  bodyRef,
  bodyCollapsed = false,
  canCollapseBody = false,
  onToggleBody,
  collapseLabel = "Collapse",
  expandLabel = "Show all",
}: NodeEditContainerProps) {
  const openMentionPicker = useCanvasStore((state) => state.openMentionPicker);
  const mentionPicking = useCanvasStore((state) => state.mentionPicking);
  const wasPickingRef = useRef(false);

  // 画布点选结束/取消后，把焦点还给正文输入框，避免卡片停在失焦状态。
  useEffect(() => {
    const wasMine = wasPickingRef.current;
    wasPickingRef.current = mentionPicking?.sourceNodeId === nodeId;
    if (wasMine && !mentionPicking && isEditing) {
      bodyInputRef.current?.focus();
    }
  }, [bodyInputRef, isEditing, mentionPicking, nodeId]);

  // 标题与正文在同一容器里，只有焦点离开整个容器才保存；
  // 否则从标题点进正文就会被当成「离开输入框」而直接退出编辑。
  const handleContainerBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const state = useCanvasStore.getState();
    // 提及选择器打开或正在画布点选时，焦点变化不是「结束编辑」。
    if (state.mentionPicker || state.mentionPicking) return;
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    onSave();
  };

  const handleBodyChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    const cursor = event.target.selectionStart ?? next.length;
    const trigger = findMentionTrigger(next, cursor);
    onEditBodyChange(clampNodeBody(next));

    if (!trigger) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const insert = (target: MentionTarget) => {
      const inserted = insertMention(next, { start: trigger.start, end: trigger.end }, target);
      onEditBodyChange(clampNodeBody(inserted.text));
      requestAnimationFrame(() => {
        const input = bodyInputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(inserted.cursor, inserted.cursor);
      });
    };

    openMentionPicker({
      sourceNodeId: nodeId,
      anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      query: trigger.query,
      onSelect: insert,
      onClose: () => requestAnimationFrame(() => bodyInputRef.current?.focus()),
    });
  };

  if (isEditing) {
    return (
      <div className="node-edit-container" onBlur={handleContainerBlur}>
        <textarea
          ref={titleInputRef}
          className="node-edit-title nodrag nowheel"
          value={editTitle}
          onChange={(e) => onEditTitleChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
        />
        <textarea
          ref={bodyInputRef}
          className="node-edit-body nodrag nowheel"
          value={editBody}
          onChange={handleBodyChange}
          onKeyDown={onKeyDown}
          rows={3}
        />
        <div className="node-edit-hint" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{hintText}</span>
          <span>
            {countTextWithoutMentions(editBody)}
            {countTextWithoutMentions(editBody) >= MAX_NODE_BODY_CHARS - 2000
              ? ` / ${MAX_NODE_BODY_CHARS}`
              : ""}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="node-title">
        <NodeMarkdown content={displayTitle} inline searchQuery={searchQuery} />
      </div>
      <div
        ref={bodyRef}
        className={`node-body ${bodyCollapsed ? "node-body--clamped" : ""}`}
      >
        {searchQuery.trim() ? highlightPlainText(displayBody, searchQuery) : (
          <NodeMarkdown content={displayBody} />
        )}
      </div>
      {(canCollapseBody || bodyCollapsed) && onToggleBody && (
        <button
          type="button"
          className="node-body-toggle nodrag"
          aria-expanded={!bodyCollapsed}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleBody();
          }}
        >
          {bodyCollapsed ? expandLabel : collapseLabel}
        </button>
      )}
    </>
  );
}
