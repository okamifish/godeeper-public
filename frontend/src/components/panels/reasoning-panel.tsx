"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useCanvasStore } from "@/lib/canvas-store";
import { useRevealNode } from "@/hooks/use-reveal-node";
import { useT, type S } from "@/lib/i18n";
import type { GoDeeperFlowNode, NodeKind } from "@/lib/types";
import type { CritiqueFindingKind } from "@/lib/api";
import { NODE_KIND_COLORS } from "@/lib/node-colors";
import { computePanelWidth } from "@/lib/floating-drag";

const CRITIQUE_KIND_LABEL: Record<CritiqueFindingKind, S> = {
  counterexample: "critiqueKindCounterexample",
  flaw: "critiqueKindFlaw",
  missing_evidence: "critiqueKindMissingEvidence",
};

const KIND_COLOR: Record<NodeKind, string> = NODE_KIND_COLORS;

const PANEL_WIDTH_STORAGE_KEY = "godeeper-panel-width";
const DEFAULT_PANEL_WIDTH = 336;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 560;

export function ReasoningPanel() {
  const {
    nodes,
    edges,
    selectedNodeId,
    selectedNodeIds,
    summaryResult,
    summaryLoading,
    critiquePreview,
    critiqueLoading,
    critiqueError,
    acceptCritiqueFinding,
    dismissCritique,
    concepts,
    conceptPendingIds,
    conceptErrors,
    conceptSourceNodeId,
    createConceptFromSelection,
    retryConcept,
    deleteConcept,
    focusConceptSource,
    panelCollapsed,
    panelTab,
    setPanelTab,
    togglePanel,
    focusNode,
    addChildNode,
    returnToBranchPoint,
    createTaskFromSelection,
    generateSummary,
    canvasHistory,
  } = useCanvasStore();
  const revealNode = useRevealNode();
  const t = useT();
  const [conceptQuery, setConceptQuery] = useState("");
  const [expandedConceptIds, setExpandedConceptIds] = useState<Set<string>>(new Set());
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [panelResizing, setPanelResizing] = useState(false);
  const panelWidthRef = useRef(DEFAULT_PANEL_WIDTH);
  const panelResizeRef = useRef<{
    onMove?: (event: PointerEvent) => void;
    onUp?: (event: PointerEvent) => void;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        const next = Math.min(Math.max(MIN_PANEL_WIDTH, parsed), MAX_PANEL_WIDTH);
        panelWidthRef.current = next;
        setPanelWidth(next);
      }
    } catch {
      /* ignore malformed width */
    }
  }, []);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
    document.documentElement.style.setProperty("--panel-width", `${panelWidth}px`);
  }, [panelWidth]);

  useEffect(() => () => {
    const drag = panelResizeRef.current;
    if (drag?.onMove) window.removeEventListener("pointermove", drag.onMove);
    if (drag?.onUp) {
      window.removeEventListener("pointerup", drag.onUp);
      window.removeEventListener("pointercancel", drag.onUp);
    }
  }, []);

  const handlePanelResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidthRef.current;
    setPanelResizing(true);

    const onMove = (moveEvent: PointerEvent) => {
      setPanelWidth(computePanelWidth({
        startX,
        startWidth,
        clientX: moveEvent.clientX,
        minWidth: MIN_PANEL_WIDTH,
        maxWidth: MAX_PANEL_WIDTH,
      }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try {
        localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(Math.round(panelWidthRef.current)));
      } catch {
        /* storage may be unavailable */
      }
      panelResizeRef.current = null;
      setPanelResizing(false);
    };

    panelResizeRef.current = { onMove, onUp };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const kindLabel = (kind: NodeKind) => {
    switch (kind) {
      case "link":
        return t("linkNodeKind");
      case "task":
        return t("taskNode");
      case "result":
        return t("resultNode");
      case "free":
        return t("freeNode");
      case "inspire":
        return t("inspireNode");
      case "note":
        return t("noteNode");
      case "image":
        return t("imageNodeKind");
      default:
        return t("textNode");
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  const reasoningPath = useMemo(() => {
    const path: GoDeeperFlowNode[] = [];
    let currentId: string | undefined = selectedNodeId;
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const node = nodes.find((n) => n.id === currentId);
      if (!node) break;
      path.unshift(node);
      currentId = edges.find((e) => e.target === currentId)?.source;
    }
    return path;
  }, [nodes, edges, selectedNodeId]);

  const outgoing = useMemo(() => {
    if (!selectedNodeId) return [];
    return edges
      .filter((edge) => edge.source === selectedNodeId)
      .map((edge) => nodes.find((node) => node.id === edge.target))
      .filter((node): node is GoDeeperFlowNode => Boolean(node));
  }, [edges, nodes, selectedNodeId]);

  const outline = useMemo(() => {
    const rows: Array<{ node: GoDeeperFlowNode; depth: number }> = [];
    const incoming = new Set(edges.map((edge) => edge.target));
    const roots = nodes.filter((node) => !incoming.has(node.id));
    const visited = new Set<string>();

    const walk = (node: GoDeeperFlowNode, depth: number) => {
      if (visited.has(node.id) || depth > 12) return;
      visited.add(node.id);
      rows.push({ node, depth });
      edges
        .filter((edge) => edge.source === node.id)
        .forEach((edge) => {
          const child = nodes.find((item) => item.id === edge.target);
          if (child) walk(child, depth + 1);
        });
    };

    roots.forEach((root) => walk(root, 0));
    // 兜底：环状结构里没有根节点的部分也要显示出来
    nodes.forEach((node) => {
      if (!visited.has(node.id)) walk(node, 0);
    });
    return rows;
  }, [nodes, edges]);

  const latestResult = nodes.filter((node) => node.data.kind === "result").slice(-1)[0];

  const filteredConcepts = useMemo(() => {
    const query = conceptQuery.trim().toLowerCase();
    if (!query) return concepts;
    return concepts.filter((concept) =>
      concept.term.toLowerCase().includes(query) ||
      concept.explanation.toLowerCase().includes(query) ||
      concept.sourceNodeTitle.toLowerCase().includes(query)
    );
  }, [concepts, conceptQuery]);

  const toggleConcept = (conceptId: string) => {
    setExpandedConceptIds((current) => {
      const next = new Set(current);
      if (next.has(conceptId)) next.delete(conceptId);
      else next.add(conceptId);
      return next;
    });
  };

  const handleConceptDragOver = (event: React.DragEvent) => {
    const types = Array.from(event.dataTransfer.types ?? []);
    // 文件拖入交给画布的上传逻辑，右栏只接收文本
    if (types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleConceptDrop = (event: React.DragEvent) => {
    // 优先用拖拽数据；某些浏览器/输入框场景会为空，退回当前选区
    const transferred = event.dataTransfer.getData("text/plain").trim();
    const selected = window.getSelection()?.toString().trim() ?? "";
    const text = transferred || selected;
    if (!text) return;
    event.preventDefault();
    // store 会把面板切到「概念」并展开，这里不再 toggle，避免刚展开又被折回。
    void createConceptFromSelection(text, conceptSourceNodeId ?? selectedNodeId ?? undefined);
  };

  const suggestions = useMemo(() => {
    const list: Array<{ key: string; title: string; desc: string; run: () => void }> = [];
    if (selectedNode) {
      list.push({
        key: "child",
        title: `${t("expandNode")}「${selectedNode.data.title}」`,
        desc: t("scChild"),
        // 继续追问生成任务节点，而不是普通文本节点；新卡片要露出来才有反馈
        run: () => {
          const newId = addChildNode(selectedNode.id, "task");
          if (newId) revealNode(newId, selectedNode.id);
        },
      });
    }
    if (selectedNode && reasoningPath.length > 1) {
      const parent = reasoningPath[reasoningPath.length - 2];
      list.push({
        key: "parent",
        title: t("returnToParent"),
        desc: parent.data.title,
        run: returnToBranchPoint,
      });
    }
    if (selectedNodeIds.length >= 2) {
      list.push({
        key: "summary",
        title: t("genSummary"),
        desc: `${selectedNodeIds.length} ${t("nodes")}`,
        run: () => generateSummary(selectedNodeIds),
      });
    } else if (latestResult && latestResult.id !== selectedNodeId) {
      list.push({
        key: "result",
        title: latestResult.data.title,
        desc: t("resultNode"),
        run: () => focusNode(latestResult.id),
      });
    }
    if (canvasHistory.length > 0) {
      list.push({
        key: "history",
        title: t("goBack"),
        desc: t("canvases"),
        run: returnToBranchPoint,
      });
    }
    return list.slice(0, 3);
  }, [
    selectedNode,
    selectedNodeIds,
    reasoningPath,
    latestResult,
    canvasHistory.length,
    selectedNodeId,
    t,
    addChildNode,
    revealNode,
    generateSummary,
    focusNode,
    returnToBranchPoint,
  ]);

  const panelClass = `reasoning-panel${panelResizing ? " resizing" : ""}${panelCollapsed ? " panel-slide-hidden" : ""}`;

  return (
    <>
      {!panelCollapsed && <div className="panel-backdrop" onClick={togglePanel} />}
      <aside
        aria-label={t("reasoningTrace")}
        className={panelClass}
        onDragOver={handleConceptDragOver}
        onDrop={handleConceptDrop}
      >
        <div
          className="panel-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("panelResizeHint")}
          title={t("panelResizeHint")}
          onPointerDown={handlePanelResizePointerDown}
        />
        <div className="panel-head">
          <div>
            <h2>{t("reasoningTrace")}</h2>
            <div className="sub">{t("reasoningSub")}</div>
          </div>
          <div className="panel-head-actions">
            <button
              className="icon-btn"
              onClick={togglePanel}
              title={t("collapsePanel")}
              aria-label={t("collapsePanel")}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <div className="tabs">
          <button className={panelTab === "trace" ? "on" : ""} onClick={() => setPanelTab("trace")}>
            {t("traceTab")}
          </button>
          <button className={panelTab === "outline" ? "on" : ""} onClick={() => setPanelTab("outline")}>
            {t("outlineTab")}
          </button>
          <button className={panelTab === "concepts" ? "on" : ""} onClick={() => setPanelTab("concepts")}>
            {t("conceptTab")}
            {concepts.length > 0 && <span className="tab-count">{concepts.length}</span>}
          </button>
        </div>

        <div className="panel-body">
          {panelTab === "trace" && critiquePreview && (
            <div className="p-block critique-block">
              <div className="p-label">
                {t("critiquePanelTitle")}
                <button className="critique-dismiss" onClick={dismissCritique}>
                  {t("critiqueDismiss")}
                </button>
              </div>
              {critiqueLoading ? (
                <p className="trace-body">{t("critiqueLoading")}</p>
              ) : (
                critiquePreview.findings.map((finding, index) => (
                  <div className="critique-item" key={`${finding.kind}-${finding.title}-${index}`}>
                    <span className={`critique-kind critique-kind-${finding.kind}`}>
                      {t(CRITIQUE_KIND_LABEL[finding.kind])}
                    </span>
                    <div className="critique-title">{finding.title}</div>
                    <div className="critique-body">{finding.body}</div>
                    <button className="critique-accept" onClick={() => acceptCritiqueFinding(index)}>
                      {t("critiqueAccept")}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {panelTab === "trace" && !critiquePreview && critiqueError && (
            <div className="p-block critique-block">
              <div className="p-label">
                {t("critiquePanelTitle")}
                <button className="critique-dismiss" onClick={dismissCritique}>
                  {t("critiqueDismiss")}
                </button>
              </div>
              <p className="trace-body">{t("critiqueFailed")}</p>
            </div>
          )}

          {panelTab === "concepts" ? (
            <div className="concept-panel">
              <div className="concept-search-row">
                <input
                  className="concept-search"
                  value={conceptQuery}
                  onChange={(event) => setConceptQuery(event.target.value)}
                  placeholder={t("conceptSearchPlaceholder")}
                  aria-label={t("conceptSearchPlaceholder")}
                />
                <span className="concept-count">
                  {filteredConcepts.length} {t("conceptCount")}
                </span>
              </div>

              {concepts.length === 0 ? (
                <div className="concept-empty">
                  <h3>{t("conceptEmpty")}</h3>
                  <p>{t("conceptEmptyHint")}</p>
                </div>
              ) : filteredConcepts.length === 0 ? (
                <p className="trace-body">{t("noSearchResult")}</p>
              ) : (
                <div className="concept-list">
                  {filteredConcepts.map((concept) => {
                    const expanded = expandedConceptIds.has(concept.id);
                    const pending = conceptPendingIds.includes(concept.id);
                    const error = conceptErrors[concept.id];
                    return (
                      <div
                        key={concept.id}
                        className={`concept-card${expanded ? " expanded" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleConcept(concept.id)}
                        onDoubleClick={() => focusConceptSource(concept.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleConcept(concept.id);
                          }
                        }}
                      >
                        <div className="concept-card-head">
                          <span className="concept-term">{concept.term}</span>
                          {concept.points.length > 0 && (
                            <span className="concept-points-count">{concept.points.length}</span>
                          )}
                        </div>

                        {pending ? (
                          <p className="concept-explanation pending">{t("conceptLoadingText")}</p>
                        ) : error ? (
                          <div className="concept-error-row">
                            <span>{t("conceptGenerateFailed")}</span>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                void retryConcept(concept.id);
                              }}
                            >
                              {t("conceptRetry")}
                            </button>
                          </div>
                        ) : expanded ? (
                          <p className="concept-explanation">{concept.explanation}</p>
                        ) : (
                          <p className="concept-preview">{concept.explanation}</p>
                        )}

                        {expanded && concept.points.length > 0 && (
                          <ul className="concept-point-list">
                            {concept.points.map((point, index) => (
                              <li key={`${point}-${index}`}>{point}</li>
                            ))}
                          </ul>
                        )}

                        {expanded && (
                          <div className="concept-card-foot">
                            <span className="concept-source">
                              {t("conceptSource")}：{concept.sourceNodeTitle || t("unknownError")}
                            </span>
                            <div className="concept-actions">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  focusConceptSource(concept.id);
                                }}
                              >
                                {t("jumpToNode")}
                              </button>
                              <button
                                className="danger"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteConcept(concept.id);
                                }}
                              >
                                {t("conceptDelete")}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : panelTab === "outline" ? (
            nodes.length === 0 ? (
              <p className="trace-body">{t("outlineEmpty")}</p>
            ) : (
              <div className="outline-list">
                {outline.map(({ node, depth }) => (
                  <button
                    key={node.id}
                    className={`outline-row${node.id === selectedNodeId ? " active" : ""}`}
                    style={{ paddingLeft: 8 + depth * 14 }}
                    onClick={() => focusNode(node.id)}
                  >
                    <span className="dot" style={{ background: KIND_COLOR[node.data.kind] }} />
                    <span className="outline-title">{node.data.title}</span>
                    <span className="n">{kindLabel(node.data.kind)}</span>
                  </button>
                ))}
              </div>
            )
          ) : !selectedNode ? (
            <div className="p-block">
              <div className="p-label">{t("currentNode")}</div>
              <div className="current empty">
                <h3>{t("noNodeSelected")}</h3>
                <p>{t("clickTrace")}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="p-block">
                <div className="p-label">
                  {t("currentNode")}
                  <span
                    className="chip"
                    style={{
                      background: "#eef2ff",
                      color: KIND_COLOR[selectedNode.data.kind],
                    }}
                  >
                    <i
                      className="chip-dot"
                      style={{ background: KIND_COLOR[selectedNode.data.kind] }}
                    />
                    {kindLabel(selectedNode.data.kind)}
                  </span>
                </div>
                <div className="current">
                  <div className="path">
                    <b>{reasoningPath.length > 1 ? reasoningPath[0].data.title : t("currentNode")}</b>
                    <span>·</span>
                    <span>第 {reasoningPath.length} 层</span>
                  </div>
                  <h3>{selectedNode.data.title}</h3>
                  {selectedNode.data.body ? <p>{selectedNode.data.body}</p> : null}
                </div>
              </div>

              {outgoing.length > 0 && (
                <div className="p-block">
                  <div className="p-label">
                    {t("activeContext")}
                    <span className="chip muted">
                      {outgoing.length} {t("branchCount")}
                    </span>
                  </div>
                  <div className="ctx">
                    {outgoing.slice(0, 5).map((node) => (
                      <button
                        key={node.id}
                        className="ctx-row"
                        onClick={() => focusNode(node.id)}
                      >
                        <span
                          className="dot"
                          style={{ background: KIND_COLOR[node.data.kind] }}
                        />
                        <span className="ctx-title">{node.data.title}</span>
                        <span className="n">{kindLabel(node.data.kind)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {summaryResult && (
                <div className="p-block">
                  <div className="p-label">{t("currentSummary")}</div>
                  <div className="current summary">
                    <p style={{ whiteSpace: "pre-wrap" }}>{summaryResult}</p>
                  </div>
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="p-block">
                  <div className="p-label">{t("nextSteps")}</div>
                  {suggestions.map((suggestion, index) => (
                    <button
                      type="button"
                      className="next-row"
                      key={suggestion.key}
                      onClick={suggestion.run}
                      aria-label={suggestion.title}
                    >
                      <span className="idx">{index + 1}</span>
                      <div className="txt">
                        <div className="t">{suggestion.title}</div>
                        <div className="d">{suggestion.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {panelTab !== "concepts" && (
          <div className="panel-foot">
            <button
              className="btn"
              disabled={selectedNodeIds.length === 0}
              onClick={createTaskFromSelection}
            >
              {t("taskFromSelection")}
            </button>
            <button
              className="btn primary"
              disabled={selectedNodeIds.length < 2 || summaryLoading}
              onClick={() => { if (selectedNodeIds.length >= 2) generateSummary(selectedNodeIds); }}
            >
              <Sparkles size={13} />
              {summaryLoading ? t("generating") : t("genSummary")}
            </button>
          </div>
        )}
      </aside>

      {panelCollapsed && (
        <>
          <div
            className="concept-drop-edge"
            title={t("conceptDropEdge")}
            onDragOver={handleConceptDragOver}
            onDrop={handleConceptDrop}
          >
            <span>{t("conceptDropEdge")}</span>
          </div>
          <button className="panel-tab-fab" onClick={togglePanel} title={t("expandPanel")}>
            <ChevronLeft size={18} />
          </button>
        </>
      )}
    </>
  );
}
