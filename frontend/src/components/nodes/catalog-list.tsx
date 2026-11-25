"use client";

import { useState } from "react";
import type { GoDeeperFlowNode } from "@/lib/types";
import { useCanvasStore } from "@/lib/canvas-store";
import { useT } from "@/lib/i18n";
import { MAX_NODE_BODY_CHARS, buildCatalogBody, clampNodeBody, type CatalogItem, type NodeCatalog } from "@/lib/node-body";
import { NodeMarkdown } from "./node-markdown";

interface CatalogListProps {
  nodeId: string;
  catalog: NodeCatalog;
  label: string;
}

/**
 * 统一的目录卡列表：结果卡与引导卡共用。
 * - answers：行是已生成的答案；
 * - directions：行是待探索方向，额外显示 why 与短答。
 * 两种模式都支持折叠、逐条编辑、逐条物化任务节点。
 */
export function CatalogList({ nodeId, catalog, label }: CatalogListProps) {
  const t = useT();
  const items = catalog.items;
  const collapsed = catalog.collapsed;
  const isDirections = catalog.mode === "directions";

  const nodes = useCanvasStore((s) => s.nodes);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const materializeCatalogItem = useCanvasStore((s) => s.materializeCatalogItem);
  const toggleCatalogChild = useCanvasStore((s) => s.toggleCatalogChild);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const focusNode = useCanvasStore((s) => s.focusNode);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [addingDirection, setAddingDirection] = useState(false);
  const [draftDirection, setDraftDirection] = useState("");

  // 行状态由「是否已有子任务」派生，删除子节点后自动回到未物化。
  const childByItem = new Map<string, GoDeeperFlowNode>();
  for (const node of nodes) {
    if (node.data.kind !== "task" || node.data.sourceCatalogId !== nodeId) continue;
    const itemId = node.data.sourceCatalogItemId ?? node.data.sourceResultItemId;
    if (itemId) childByItem.set(itemId, node);
  }

  const focusChild = (child: GoDeeperFlowNode | undefined) => {
    if (!child) return;
    selectNode(child.id);
    focusNode(child.id);
  };

  const commitCatalog = (next: NodeCatalog) => {
    pushHistory();
    updateNodeData(nodeId, {
      catalog: next,
      // 引导卡的用户原问题必须保留，不能被方向列表覆盖
      ...(isDirections ? {} : { body: buildCatalogBody(next.items) }),
    });
  };

  const itemStateLabel = (child: GoDeeperFlowNode | undefined) => {
    if (!child) return t("guideItemIdle");
    if (child.data.catalogHidden) return t("resultItemCollapsed");
    if (child.data.taskStatus === "running") return t("guideItemRunning");
    if (child.data.taskStatus === "complete") return t("guideItemDone");
    return t("resultItemExtended");
  };

  const roleLabel = (role: CatalogItem["role"]) => {
    switch (role) {
      case "foundation":
        return t("guideRoleFoundation");
      case "compare":
        return t("guideRoleCompare");
      case "mechanism":
        return t("guideRoleMechanism");
      case "judgement":
        return t("guideRoleJudgement");
      default:
        return "";
    }
  };

  const indexById = new Map(items.map((item, index) => [item.id, index + 1]));

  const addDirection = () => {
    const title = draftDirection.trim();
    if (!title) {
      setAddingDirection(false);
      return;
    }
    const item: CatalogItem = {
      id: `user-direction-${Date.now()}`,
      title: title.slice(0, 40),
      body: title,
      source: "user",
    };
    commitCatalog({ ...catalog, items: [...items, item] });
    setDraftDirection("");
    setAddingDirection(false);
  };

  const toggleCollapsed = () => {
    commitCatalog({ ...catalog, collapsed: !collapsed });
  };

  const beginEdit = (index: number) => {
    const item = items[index];
    if (!item) return;
    setEditingIndex(index);
    setDraftTitle(item.title);
    setDraftBody(item.body);
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    const nextItems = items.map((item, i) =>
      i === editingIndex
        ? { ...item, title: draftTitle.trim(), body: clampNodeBody(draftBody) }
        : item,
    );
    commitCatalog({ ...catalog, items: nextItems });
    setEditingIndex(null);
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setEditingIndex(null);
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveEdit();
    }
  };

  const copyItem = (item: CatalogItem) => {
    const text = [item.title, item.body].filter(Boolean).join("\n");
    try {
      void navigator.clipboard?.writeText(text);
    } catch {
      // 剪贴板不可用时忽略
    }
  };

  return (
    <div className={isDirections ? "catalog-list catalog-list--directions" : "result-catalog"}>
      <div className="result-catalog-head">
        <span className="node-chip">{label}</span>
        <span className="result-catalog-count">
          {items.length} {isDirections ? t("guideDirections") : t("resultCatalogAnswers")}
        </span>
        <button
          type="button"
          className="result-catalog-toggle nodrag"
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapsed();
          }}
        >
          {collapsed ? t("resultCatalogExpand") : t("resultCatalogCollapse")}
        </button>
      </div>

      {isDirections && catalog.summary ? (
        <div className="catalog-summary">
          <NodeMarkdown content={catalog.summary} />
        </div>
      ) : null}

      {collapsed ? (
        <ol className="result-catalog-titles">
          {items.map((item, index) => {
            const child = childByItem.get(item.id);
            return (
              <li
                key={item.id}
                className={child || isDirections ? "has-child" : undefined}
                onClick={() => {
                  if (child) {
                    if (child.data.catalogHidden) toggleCatalogChild(nodeId, item.id);
                    else focusChild(child);
                    return;
                  }
                  if (isDirections) materializeCatalogItem(nodeId, item.id);
                }}
              >
                <span className="result-catalog-index">{index + 1}</span>
                <span>{item.title || item.body.slice(0, 40)}</span>
                {isDirections ? (
                  <span className={`result-catalog-state${child ? "" : " idle"}`}>
                    {itemStateLabel(child)}
                  </span>
                ) : child ? (
                  <span className="result-catalog-state">{itemStateLabel(child)}</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="result-catalog-scroll nodrag nowheel">
          {items.map((item, index) => {
            const child = childByItem.get(item.id);
            return (
              <section
                key={item.id}
                className="result-catalog-item"
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  beginEdit(index);
                }}
                onClick={(event) => {
                  if (editingIndex !== null) return;
                  const target = event.target as HTMLElement;
                  if (target.closest("button, textarea, input, a")) return;
                  if (window.getSelection()?.toString()) return;
                  event.stopPropagation();
                  if (child) {
                    if (child.data.catalogHidden) toggleCatalogChild(nodeId, item.id);
                    else focusChild(child);
                    return;
                  }
                  if (isDirections) materializeCatalogItem(nodeId, item.id);
                }}
              >
                {editingIndex === index ? (
                  <div
                    className="result-catalog-editor"
                    onBlur={(event) => {
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                      saveEdit();
                    }}
                  >
                    <textarea
                      className="result-catalog-edit-title nodrag nowheel"
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onKeyDown={handleEditorKeyDown}
                      rows={1}
                    />
                    <textarea
                      className="result-catalog-edit-body nodrag nowheel"
                      value={draftBody}
                      onChange={(event) => setDraftBody(clampNodeBody(event.target.value))}
                      onKeyDown={handleEditorKeyDown}
                      rows={4}
                    />
                    <div className="result-catalog-edit-hint">
                      <span>{draftBody.length} / {MAX_NODE_BODY_CHARS}</span>
                      <button type="button" className="nodrag" onClick={saveEdit}>
                        {t("save")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="result-catalog-item-head">
                      <span className="result-catalog-index">{index + 1}</span>
                      <h4>{item.title}</h4>
                      {isDirections && item.role ? (
                        <span className="guide-role-tag">{roleLabel(item.role)}</span>
                      ) : null}
                      {isDirections && item.recommended ? (
                        <span className="guide-rec-tag">{t("guideRecommended")}</span>
                      ) : null}
                      {isDirections ? (
                        <span className={`result-catalog-state${child ? "" : " idle"}`}>
                          {itemStateLabel(child)}
                        </span>
                      ) : child ? (
                        <span className="result-catalog-state">{t("resultItemExtended")}</span>
                      ) : null}
                      <button
                        type="button"
                        className="result-catalog-copy nodrag"
                        title={t("copy")}
                        onClick={(event) => {
                          event.stopPropagation();
                          copyItem(item);
                        }}
                      >
                        ⧉
                      </button>
                      <button
                        type="button"
                        className="result-catalog-extend nodrag"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (child) {
                            toggleCatalogChild(nodeId, item.id);
                            return;
                          }
                          materializeCatalogItem(nodeId, item.id);
                        }}
                      >
                        {child
                          ? child.data.catalogHidden
                            ? t("resultCatalogExpand")
                            : t("resultCatalogCollapse")
                          : isDirections
                            ? t("guideItemStart")
                            : t("resultItemExtend")}
                      </button>
                    </div>
                    {isDirections && item.why ? (
                      <div className="result-catalog-why">{item.why}</div>
                    ) : null}
                    {isDirections && item.dependsOn?.length ? (
                      <div className="guide-prereq">
                        {t("guidePrerequisite")}
                        {item.dependsOn
                          .map((depId) => indexById.get(depId))
                          .filter((value): value is number => typeof value === "number")
                          .map((value) => String(value).padStart(2, "0"))
                          .join(" · ")}
                      </div>
                    ) : null}
                    <div className="result-catalog-body">
                      <NodeMarkdown content={item.body} />
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {isDirections ? (
        <div className="catalog-add">
          {addingDirection ? (
            <div className="catalog-add-form">
              <input
                autoFocus
                className="catalog-add-input nodrag nowheel"
                value={draftDirection}
                maxLength={40}
                onChange={(event) => setDraftDirection(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addDirection();
                  }
                  if (event.key === "Escape") {
                    setAddingDirection(false);
                    setDraftDirection("");
                  }
                }}
                placeholder={t("guideAddDirectionPlaceholder")}
              />
              <button type="button" className="catalog-add-save nodrag" onClick={addDirection}>
                {t("guideAddDirectionSave")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="catalog-add-trigger nodrag"
              onClick={() => setAddingDirection(true)}
            >
              + {t("guideAddDirection")}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
