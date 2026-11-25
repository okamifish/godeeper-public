"use client";

import { useState, useRef, useEffect } from "react";
import type { NodeProps } from "@xyflow/react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import type { GoDeeperFlowNode } from "@/lib/types";
import { ChevronDown, Star, Square } from "lucide-react";
import { detectTaskType } from "@/lib/task-model";
import { findMentionTrigger, insertMention, type MentionTarget } from "@/lib/mentions";
import { NodeShell } from "./node-shell";
import { ContextTray } from "./context-tray";
import { CatalogList } from "./catalog-list";
import { NodeMarkdown } from "./node-markdown";
import { StarReward } from "./star-reward";

export function TaskNode({ id, data, selected }: NodeProps<GoDeeperFlowNode>) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const runTask = useCanvasStore((state) => state.runTask);
  const cancelTask = useCanvasStore((state) => state.cancelTask);
  const resumeSocratic = useCanvasStore((state) => state.resumeSocratic);
  const removeChip = useCanvasStore((state) => state.removeChip);
  const validatedModels = useCanvasStore((s) => s.validatedModels);
  const defaultModel = useCanvasStore((s) => s.defaultModel);
  const nodes = useCanvasStore((s) => s.nodes);
  const openMentionPicker = useCanvasStore((s) => s.openMentionPicker);
  const mentionPicking = useCanvasStore((s) => s.mentionPicking);
  const focusNode = useCanvasStore((s) => s.focusNode);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const wasPickingRef = useRef(false);

  const [isEditingPrompt, setIsEditingPrompt] = useState(() => !data.title?.trim());
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(data.title);
  const t = useT();
  const [editBody, setEditBody] = useState(data.body);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  // 旧画布把错误写进了 metaRight（"Error: ..."），这里兼容读取，避免继续撑爆运行按钮。
  const legacyError = (data.metaRight ?? "").startsWith("Error: ")
    ? (data.metaRight ?? "").slice("Error: ".length)
    : "";
  const taskError = data.taskError ?? legacyError;

  // 星星只在“本次从无星变有星”时播放动画；刷新加载时初始即有星，不播放
  const qualified = data.qualityStatus === "qualified";
  const prevQualifiedRef = useRef(qualified);
  const [animateStar, setAnimateStar] = useState(false);

  useEffect(() => {
    if (qualified && !prevQualifiedRef.current) {
      setAnimateStar(true);
    } else if (!qualified) {
      setAnimateStar(false);
    }
    prevQualifiedRef.current = qualified;
  }, [qualified]);

  const directionsCatalog = data.catalog?.mode === "directions" ? data.catalog : null;
  const sourceCatalog = data.sourceCatalogId
    ? nodes.find((node) => node.id === data.sourceCatalogId)
    : undefined;
  const isGuideChild =
    data.sourceCatalogKind === "guide"
    || (
      data.sourceCatalogKind !== "result"
      && (
        sourceCatalog?.data.catalog?.mode === "directions"
        || Boolean(data.catalogBackfill)
      )
    );
  const isResultExtension = Boolean(data.sourceCatalogId) && !isGuideChild;
  const guideAnchorId = isGuideChild ? data.sourceCatalogId : undefined;

  // 启发类任务沿用旧启发卡的粉色主题；其他任务仍是紫色任务卡
  const isInspiration =
    !isResultExtension
    && (
      data.kind === "inspire"
      || data.legacyKind === "inspire"
      || data.author === "ai"
    );
  const inspirationLabel =
    data.inspireAction === "socratic"
      ? t("socraticCard")
      : data.inspireAction === "challenge"
        ? t("critiqueRun")
        : data.inspireAction === "rebut" || data.taskType === "critique"
          ? t("taskTypeCritique")
          : t("inspireNode");
  const nodeLabel = directionsCatalog
    ? t("guideNode")
    : isGuideChild
      ? t("guideChild")
      : isResultExtension
        ? t("taskNode")
        : isInspiration
          ? inspirationLabel
          : t("taskNode");

  useEffect(() => {
    if (isEditingPrompt && promptInputRef.current) {
      promptInputRef.current.focus();
    }
  }, [isEditingPrompt]);

  // 画布点选结束/取消后，把焦点还给提示词输入框。
  useEffect(() => {
    const wasMine = wasPickingRef.current;
    wasPickingRef.current = mentionPicking?.sourceNodeId === id;
    if (wasMine && !mentionPicking && isEditingPrompt) {
      promptInputRef.current?.focus();
    }
  }, [id, isEditingPrompt, mentionPicking]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showModelSelector) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModelSelector(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelSelector]);

  const handleSavePrompt = () => {
    const nextBody = editBody.trim();
    const nextType = detectTaskType(editBody);
    if (nextBody !== data.body || nextType !== data.taskType) {
      pushHistory();
      updateNodeData(id, {
        body: nextBody,
        taskType: nextType,
        // 问题改了，旧的星星判断立即失效
        qualityStatus: undefined,
        qualityConfidence: undefined,
        qualityHash: undefined,
        qualityModel: undefined,
        qualityCheckedAt: undefined,
      });
    }
    setIsEditingPrompt(false);
  };

  const handlePromptBlur = () => {
    const state = useCanvasStore.getState();
    if (state.mentionPicker || state.mentionPicking) return;
    handleSavePrompt();
  };

  const handlePromptChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    setEditBody(next);

    const cursor = event.target.selectionStart ?? next.length;
    const trigger = findMentionTrigger(next, cursor);
    if (!trigger) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const insert = (target: MentionTarget) => {
      const inserted = insertMention(next, { start: trigger.start, end: trigger.end }, target);
      setEditBody(inserted.text);
      requestAnimationFrame(() => {
        const input = promptInputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(inserted.cursor, inserted.cursor);
      });
    };

    openMentionPicker({
      sourceNodeId: id,
      anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      query: trigger.query,
      onSelect: insert,
      onClose: () => requestAnimationFrame(() => promptInputRef.current?.focus()),
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      handleSavePrompt();
      return;
    }
    if (event.key === "Escape") {
      setEditBody(data.body);
      setIsEditingPrompt(false);
    }
  };

  const handleModelSelect = (modelName: string) => {
    updateNodeData(id, { metaLeft: modelName });
    setShowModelSelector(false);
  };

  const currentModel = data.metaLeft || defaultModel || t("selectModel");

  return (
    <NodeShell id={id} kind={isInspiration ? "inspire" : data.kind} selected={selected}>
      <div className="node-inner">
        <div className="task-header">
          <span className="node-chip">{nodeLabel}</span>
          {qualified && <StarReward animate={animateStar} />}
        </div>
        {(data.title || isEditingTitle) && (isEditingTitle ? (
          <input
            className="node-title-edit nodrag nowheel"
            value={editTitle}
            autoFocus
            onChange={(e) => setEditTitle(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (editTitle.trim() !== data.title) {
                  pushHistory();
                  updateNodeData(id, { title: editTitle.trim() });
                }
                setIsEditingTitle(false);
              }
              if (e.key === "Escape") setIsEditingTitle(false);
            }}
            onBlur={() => {
              if (editTitle.trim() !== data.title) {
                pushHistory();
                updateNodeData(id, { title: editTitle.trim() });
              }
              setIsEditingTitle(false);
            }}
            placeholder={t("enterPrompt")}
          />
        ) : (
          <h2
            className="node-title"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditTitle(data.title);
              setIsEditingTitle(true);
            }}
            style={{ cursor: "text" }}
          >
            <NodeMarkdown content={data.title} inline />
          </h2>
        ))}
        {isEditingPrompt ? (
          <div className="prompt-edit-container">
            <textarea
              ref={promptInputRef}
              className="prompt-edit-textarea nodrag nowheel"
              value={editBody}
              onChange={handlePromptChange}
              onKeyDown={handleKeyDown}
              onBlur={handlePromptBlur}
              onMouseDown={(e) => e.stopPropagation()}
              rows={4}
              placeholder={t("enterPrompt")}
            />
            <div className="prompt-edit-hint">{t("promptHint")}</div>
          </div>
        ) : directionsCatalog ? (
          <div
            className="guide-question nodrag"
            onClick={(e) => {
              e.stopPropagation();
              setEditBody(data.body);
              setIsEditingPrompt(true);
            }}
          >
            <span className="guide-question-label">{t("guideQuestionLabel")}</span>
            <span className="guide-question-text">{data.body || t("clickEditPrompt")}</span>
          </div>
        ) : (
          <div
            className="prompt-box prompt-editable"
            onClick={(e) => {
              e.stopPropagation();
              if ((e.target as HTMLElement).closest("a")) return;
              setEditBody(data.body);
              setIsEditingPrompt(true);
            }}
          >
            {data.body ? <NodeMarkdown content={data.body} /> : t("clickEditPrompt")}
          </div>
        )}
        {directionsCatalog ? (
          <CatalogList nodeId={id} catalog={directionsCatalog} label={t("guideNode")} />
        ) : null}
        {isGuideChild && data.catalogBackfill ? (
          <div className="guide-backfill">
            <b>{t("guideBackfillLabel")}</b>
            {data.catalogBackfill}
          </div>
        ) : null}
        {isInspiration && (data.inspireReason || (data.inspirePrerequisites?.length ?? 0) > 0) && (
          <div className="task-legacy-inspire">
            {data.inspireReason && (
              <NodeMarkdown content={data.inspireReason} />
            )}
            {(data.inspirePrerequisites?.length ?? 0) > 0 && (
              <ul>
                {data.inspirePrerequisites!.map((item, index) => (
                  <li key={`${item}-${index}`}>
                    <NodeMarkdown content={item} inline />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <ContextTray nodeId={id} />
        <div className="chip-row">
          {(data.chips ?? []).map((chip) => (
            <span className="context-chip" key={chip}>
              {chip}
              <button
                className="chip-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(id, chip);
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {taskError ? (
          <p className="task-error" role="alert">{taskError}</p>
        ) : null}
        <div className="task-footer">
          <div className="model-selector-container" ref={dropdownRef}>
            <button
              className="model-pill model-selector-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setShowModelSelector(!showModelSelector);
              }}
            >
              {currentModel}
              <span className="model-selector-arrow"><ChevronDown size={10} /></span>
            </button>
            {showModelSelector && (
              <div className="model-selector-dropdown" onClick={(e) => e.stopPropagation()}>
                {validatedModels.map((model) => (
                  <button
                    key={model}
                    className={`model-selector-option ${model === data.metaLeft ? "selected" : ""}`}
                    onClick={() => handleModelSelect(model)}
                  >
                    <span className="model-name">{model}</span>
                    {model === defaultModel && <span className="model-default-badge"><Star size={12} fill="currentColor" /></span>}
                  </button>
                ))}
                {validatedModels.length === 0 && (
                  <div className="model-selector-empty">{t("noModelsConfigured")}</div>
                )}
              </div>
            )}
          </div>
          <div className="task-footer-actions">
            {isGuideChild && guideAnchorId ? (
              <button
                type="button"
                className="guide-back-link nodrag"
                onClick={(event) => {
                  event.stopPropagation();
                  selectNode(guideAnchorId);
                  focusNode(guideAnchorId);
                }}
              >
                {t("guideBackToCatalog")}
              </button>
            ) : null}
            <span className={`status-dot ${data.taskStatus ?? "idle"}`} />
            {data.socraticSession ? (
              <button
                className="run-button"
                onClick={(event) => {
                  event.stopPropagation();
                  void resumeSocratic(id);
                }}
              >
                {t("socraticResume")}
              </button>
            ) : directionsCatalog && !isGuideChild ? (
              <span className="guide-anchor-hint">{t("guidePathReady")}</span>
            ) : data.taskStatus === "running" ? (
              <button
                className="run-button run-button--stop"
                onClick={(event) => {
                  event.stopPropagation();
                  cancelTask(id);
                }}
              >
                <Square size={9} fill="currentColor" />
                {t("stop")}
              </button>
            ) : (
              <button
                className="run-button"
                onClick={(event) => {
                  event.stopPropagation();
                  runTask(id);
                }}
              >
                {legacyError ? t("runTask") : (data.metaRight ?? t("runTask"))}
              </button>
            )}
          </div>
        </div>
      </div>
    </NodeShell>
  );
}
