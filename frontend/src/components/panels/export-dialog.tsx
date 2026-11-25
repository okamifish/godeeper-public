"use client";

import { useCallback, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useCanvasStore, toCanvasEdgeSeed, toCanvasNodeSeed } from "@/lib/canvas-store";
import { createCanvasExport } from "@/lib/canvas-export";
import {
  buildStructuredReport,
  type ReportAuthorLabel,
} from "@/lib/structured-report";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { useRevealNode } from "@/hooks/use-reveal-node";
import { api, type OrganizeReportResponse } from "@/lib/api";
import {
  collectScopeNodeIds,
  serializeReportGraph,
  type ReportScopeRequest,
} from "@/lib/report-graph";
import { estimateReportRequest } from "@/lib/report-estimate";
import { renderAiReportHtml, renderAiReportMarkdown } from "@/lib/ai-report";
import { isAuthenticated, getUser } from "@/lib/auth";
import { hasCapability } from "@/lib/capabilities";

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PREVIEW_TASK_LIMIT = 8;

function formatTokens(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export function ExportDialog() {
  const exportOpen = useCanvasStore((s) => s.exportOpen);
  const setExportOpen = useCanvasStore((s) => s.setExportOpen);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const timeline = useCanvasStore((s) => s.timeline);
  const groups = useCanvasStore((s) => s.groups);
  const concepts = useCanvasStore((s) => s.concepts);
  const canvasName = useCanvasStore((s) => s.canvasName);
  const guideMode = useCanvasStore((s) => s.guideMode);
  const language = useCanvasStore((s) => s.language);
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectedNodeIds = useCanvasStore((s) => s.selectedNodeIds);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const { getViewport } = useReactFlow();
  const revealNode = useRevealNode();
  const t = useT();
  const [scopeMode, setScopeMode] = useState<"all" | "branch" | "selected" | "lasso">("all");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [detail, setDetail] = useState<"full" | "summary">("full");
  const [aiPlan, setAiPlan] = useState<OrganizeReportResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const hasNodes = nodes.length > 0;
  const aiAvailable = isAuthenticated();
  const canAiOrganize = hasCapability(getUser(), "report.aiOrganize");

  const branchRootId = useMemo(
    () => (selectedNodeId && nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId : undefined),
    [nodes, selectedNodeId],
  );

  const lassoNodeIds = useMemo(
    () => selectedNodeIds.filter((id) => nodes.some((node) => node.id === id)),
    [nodes, selectedNodeIds],
  );

  const lassoTaskIds = useMemo(
    () => lassoNodeIds.filter((id) => {
      const node = nodes.find((item) => item.id === id);
      return node?.data.kind === "task" || node?.data.kind === "inspire";
    }),
    [lassoNodeIds, nodes],
  );

  const reportScope = useMemo<ReportScopeRequest>(() => {
    if (scopeMode === "branch") return { mode: "branch", rootNodeId: branchRootId };
    if (scopeMode === "selected") return { mode: "selection", nodeIds: Array.from(selectedTaskIds) };
    if (scopeMode === "lasso") return { mode: "selection", nodeIds: lassoNodeIds };
    return { mode: "canvas" };
  }, [scopeMode, branchRootId, selectedTaskIds, lassoNodeIds]);

  const scopeNodeCount = useMemo(
    () => collectScopeNodeIds(nodes, edges, reportScope).size,
    [nodes, edges, reportScope],
  );

  const reportGraph = useMemo(
    () => serializeReportGraph({
      nodes,
      edges,
      groups,
      concepts,
      scope: reportScope,
      canvasName,
      locale: language,
      guideMode,
    }),
    [nodes, edges, groups, concepts, reportScope, canvasName, language, guideMode],
  );

  const aiEstimate = useMemo(
    () => estimateReportRequest(reportGraph),
    [reportGraph],
  );

  // 旧报告渲染仍按任务树工作；这里先把新 AI 阶段映射成旧 sections，作为过渡。
  const legacySections = useMemo(() => {
    if (!aiPlan) return undefined;
    const taskIds = new Set(
      nodes.filter((node) => node.data.kind === "task" || node.data.kind === "inspire").map((node) => node.id),
    );
    return aiPlan.stages
      .map((stage) => ({
        title: stage.title,
        summary: stage.outcome || stage.question,
        keyFindings: aiPlan.brightSpots
          .filter((spot) => spot.nodeIds.some((id) => stage.nodeIds.includes(id)))
          .map((spot) => spot.insight),
        taskIds: stage.nodeIds.filter((id) => taskIds.has(id)),
      }))
      .filter((section) => section.taskIds.length > 0);
  }, [aiPlan, nodes]);

  const legacyNarrative = useMemo(
    () => (aiPlan
      ? {
          subtitle: aiPlan.subtitle,
          executiveSummary: aiPlan.summary,
          conclusion: aiPlan.conclusion,
        }
      : undefined),
    [aiPlan],
  );

  const report = useMemo(
    () =>
      buildStructuredReport(nodes, edges, {
        title: aiPlan?.title ? aiPlan.title : canvasName,
        locale: language,
        rootNodeId: scopeMode === "branch" ? branchRootId : undefined,
        rootTaskIds: scopeMode === "selected"
          ? Array.from(selectedTaskIds)
          : scopeMode === "lasso"
            ? lassoTaskIds
            : undefined,
        detail,
        sections: legacySections,
        narrative: legacyNarrative,
      }),
    [nodes, edges, canvasName, language, scopeMode, branchRootId, selectedTaskIds, lassoTaskIds, detail, legacySections, legacyNarrative, aiPlan],
  );

  const visibleTasks = showAllTasks ? report.tasks : report.tasks.slice(0, PREVIEW_TASK_LIMIT);

  const aiReport = useMemo(() => {
    if (!aiPlan) return null;
    const options = {
      plan: aiPlan,
      nodes,
      edges,
      title: aiPlan.title || canvasName,
      locale: language,
      scopeLabel: report.scopeLabel,
    };
    return {
      html: renderAiReportHtml(options),
      markdown: renderAiReportMarkdown(options),
    };
  }, [aiPlan, nodes, edges, canvasName, language, report.scopeLabel]);

  const evidenceCount = useMemo(
    () => report.tasks.reduce((sum, task) => sum + task.evidence.length, 0),
    [report],
  );
  const resultCount = useMemo(
    () => report.tasks.reduce((sum, task) => sum + task.results.length, 0),
    [report],
  );

  const authorText = (author: ReportAuthorLabel) => {
    if (author === "user") return t("authorUser");
    if (author === "aiEdited") return t("authorAiEdited");
    return t("authorAi");
  };

  const safeName = canvasName.trim().replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "canvas";

  const handleJumpToNode = useCallback((nodeId: string) => {
    selectNode(nodeId);
    setExportOpen(false);
    // 弹窗关闭后画布尺寸才恢复；等两帧再定位，避免视野按旧尺寸计算。
    requestAnimationFrame(() => {
      requestAnimationFrame(() => revealNode(nodeId));
    });
  }, [selectNode, setExportOpen, revealNode]);

  const toggleTaskSelection = useCallback((taskId: string) => {
    const next = new Set(selectedTaskIds);
    if (next.has(taskId)) next.delete(taskId);
    else next.add(taskId);
    setSelectedTaskIds(next);
    setScopeMode(next.size > 0 ? "selected" : "all");
  }, [selectedTaskIds]);

  const selectAllTasks = useCallback(() => {
    const allTaskIds = nodes
      .filter((node) => node.data.kind === "task" || node.data.kind === "inspire")
      .map((node) => node.id);
    setSelectedTaskIds(new Set(allTaskIds));
    setScopeMode("selected");
  }, [nodes]);

  const clearTaskSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
    setScopeMode("all");
  }, []);

  const handleAiOrganize = useCallback(async () => {
    if (!hasCapability(getUser(), "report.aiOrganize")) {
      setAiError(t("organizeProRequired"));
      return;
    }
    if (!aiEstimate.contextOk) {
      setAiError(t("aiContextExceeded"));
      return;
    }
    if (reportGraph.nodes.length === 0) {
      setAiError(t("nothingToExport"));
      return;
    }

    setAiLoading(true);
    setAiError(null);
    try {
      const result = await api.aiOrganizeReport(reportGraph);
      setAiPlan(result);
      // 一步式：生成成功即应用到报告，用户可用「恢复本地模板」撤销。
    } catch (err) {
      const apiError = err as { code?: string; issues?: Array<{ message?: string }> };
      const code = apiError.code || (err instanceof Error ? err.message : "AI_ORGANIZE_FAILED");
      const reasons = Array.isArray(apiError.issues)
        ? apiError.issues.map((issue) => issue.message).filter(Boolean).slice(0, 3).join("；")
        : "";
      setAiError(
        code === "INSUFFICIENT_CREDITS"
          ? t("aiNoCredits")
          : code === "AI_ORGANIZE_INVALID"
            ? `${t("aiOrganizeInvalid")}${reasons ? `：${reasons}` : ""}`
            : /capability|forbidden|403/i.test(code)
              ? t("organizeProRequired")
              : code,
      );
    } finally {
      setAiLoading(false);
    }
  }, [nodes, edges, groups, concepts, reportGraph, aiEstimate, canvasName, language, guideMode, t]);

  const handleDownloadJson = useCallback(() => {
    const content = JSON.stringify(createCanvasExport({
      canvasName,
      viewport: getViewport(),
      nodes: nodes.map(toCanvasNodeSeed),
      edges: edges.map(toCanvasEdgeSeed),
      timeline,
      groups,
      concepts,
      guideMode,
    }), null, 2);
    downloadFile(content, `godeeper-${safeName}-${Date.now()}.json`, "application/json");
  }, [canvasName, edges, getViewport, nodes, timeline, groups, concepts, guideMode, safeName]);

  return (
    <Dialog open={exportOpen} onOpenChange={setExportOpen}>
      <DialogContent className="export-dialog export-dialog-v2">
        <DialogHeader>
          <DialogTitle>{t("exportReport")}</DialogTitle>
          <DialogDescription>{t("exportDescription")}</DialogDescription>
        </DialogHeader>

        {!hasNodes ? (
          <div className="export-empty">
            <p className="trace-body">{t("nothingToExport")}</p>
          </div>
        ) : (
          <div className="export-workbench">
            <div className="export-summary">
              <div className="export-summary-main">
                <span className="export-summary-title">{report.title}</span>
                <span className="export-summary-sub">
                  {t("exportScope")}：{report.scopeLabel ?? t("exportScopeAll")}
                </span>
              </div>
              <div className="export-summary-chips">
                <span>{report.tasks.length} {t("reportTasks")}</span>
                <span>{evidenceCount} {t("reportEvidence")}</span>
                <span>{resultCount} {t("reportResults")}</span>
              </div>
            </div>

            <section className="export-section">
              <div className="export-section-head">
                <h3>{t("exportSectionScope")}</h3>
                <p>{report.scopeLabel ?? t("exportScopeAll")}</p>
              </div>
              <div className="export-scope-tabs" role="group" aria-label={t("exportScope")}>
                <button
                  type="button"
                  className={scopeMode === "all" ? "active" : ""}
                  aria-pressed={scopeMode === "all"}
                  onClick={() => setScopeMode("all")}
                >
                  {t("exportScopeAll")}
                </button>
                <button
                  type="button"
                  className={scopeMode === "branch" ? "active" : ""}
                  aria-pressed={scopeMode === "branch"}
                  disabled={!branchRootId}
                  onClick={() => setScopeMode("branch")}
                >
                  {t("exportScopeBranch")}
                </button>
                <button
                  type="button"
                  className={scopeMode === "lasso" ? "active" : ""}
                  aria-pressed={scopeMode === "lasso"}
                  disabled={lassoNodeIds.length === 0}
                  onClick={() => setScopeMode("lasso")}
                >
                  {t("exportScopeLasso")}
                  {lassoNodeIds.length > 0 ? ` (${lassoNodeIds.length})` : ""}
                </button>
                <button
                  type="button"
                  className={scopeMode === "selected" ? "active" : ""}
                  aria-pressed={scopeMode === "selected"}
                  onClick={() => setScopeMode("selected")}
                >
                  {t("exportScopeSelected")}
                  {selectedTaskIds.size > 0 ? ` (${selectedTaskIds.size})` : ""}
                </button>
              </div>
              {scopeMode === "selected" && (
                <div className="export-selection-actions">
                  <span>{t("exportSelectedCount")} {selectedTaskIds.size}</span>
                  <button type="button" className="gd-link" onClick={selectAllTasks}>{t("exportSelectAll")}</button>
                  <button type="button" className="gd-link" onClick={clearTaskSelection}>{t("exportClearSelection")}</button>
                </div>
              )}
              <div className="export-canvas-counts">
                {nodes.length} {t("nodes")} · {edges.length} {t("links")}
              </div>
              <div className="export-provenance">
                问题来源：{t("authorUser")} {report.provenance.userQuestions} · AI 建议 {report.provenance.aiQuestions} · AI 改写 {report.provenance.aiEditedQuestions} · AI 结果 {report.provenance.aiResults}
              </div>
            </section>

            <section className="export-section">
              <div className="export-section-head">
                <h3>{t("exportSectionContent")}</h3>
                <p>{t("reportDetail")}</p>
              </div>
              <div className="export-detail-toggle" role="group" aria-label={t("reportDetail")}>
                <button
                  type="button"
                  className={detail === "full" ? "active" : ""}
                  aria-pressed={detail === "full"}
                  onClick={() => setDetail("full")}
                >
                  {t("reportDetailFull")}
                </button>
                <button
                  type="button"
                  className={detail === "summary" ? "active" : ""}
                  aria-pressed={detail === "summary"}
                  onClick={() => setDetail("summary")}
                >
                  {t("reportDetailSummary")}
                </button>
              </div>
              {detail === "summary" && (
                <div className="export-meta">{t("reportSummaryHint")}</div>
              )}
              <div className="export-ai">
                <div className="export-ai-estimate">
                  <span>{aiEstimate.nodeCount} {t("nodes")} · {aiEstimate.edgeCount} {t("links")}</span>
                  <span>{t("aiEstimateInput")} {formatTokens(aiEstimate.inputTokens)} tokens</span>
                  <span>{t("aiEstimateOutput")} {formatTokens(aiEstimate.outputTokens.min)}–{formatTokens(aiEstimate.outputTokens.max)} tokens</span>
                  <span>{aiEstimate.byok ? t("aiEstimateByok") : t("aiEstimateCredits")}</span>
                </div>
                {!aiEstimate.contextOk && (
                  <div className="export-ai-error">{t("aiContextExceeded")}</div>
                )}
                {aiEstimate.contextOk && aiEstimate.contextWarning && (
                  <div className="export-ai-hint">{t("aiContextWarning")}</div>
                )}
                <div className="export-ai-head">
                  <button
                    type="button"
                    className="export-ai-button"
                    onClick={handleAiOrganize}
                    disabled={aiLoading || scopeNodeCount === 0 || !aiAvailable || !aiEstimate.contextOk}
                  >
                    {aiLoading ? t("aiOrganizing") : aiPlan ? t("aiOrganizeAgain") : t("aiOrganize")}
                    {!canAiOrganize && <span className="export-pro-tag">Pro</span>}
                  </button>
                  {!aiAvailable && <span className="export-ai-hint">{t("aiLoginRequired")}</span>}
                  {aiPlan && <span className="export-ai-hint">{t("aiAppliedHint")}</span>}
                  {aiPlan && (
                    <button
                      type="button"
                      className="gd-link"
                      onClick={() => {
                        setAiPlan(null);
                        setAiError(null);
                      }}
                    >
                      {t("aiUseLocal")}
                    </button>
                  )}
                </div>
                {aiError && <div className="export-ai-error">{aiError}</div>}
                {aiPlan && (
                  <div className="export-ai-preview active">
                    {aiPlan.title && <div className="export-ai-title">{aiPlan.title}</div>}
                    {aiPlan.subtitle && <div className="export-ai-subtitle">{aiPlan.subtitle}</div>}
                    {aiPlan.summary && (
                      <div className="export-ai-overview">
                        <span className="export-ai-label">{t("reportOverview")}</span>
                        <p>{aiPlan.summary}</p>
                      </div>
                    )}
                    {(aiPlan.mainThread?.thesis || aiPlan.mainThread?.narrative) && (
                      <div className="export-ai-overview">
                        <span className="export-ai-label">{t("reportMainThread")}</span>
                        {aiPlan.mainThread.thesis && <p><strong>{aiPlan.mainThread.thesis}</strong></p>}
                        {aiPlan.mainThread.narrative && <p>{aiPlan.mainThread.narrative}</p>}
                      </div>
                    )}
                    {(aiPlan.stages ?? []).map((stage, index) => (
                      <div className="export-ai-section" key={stage.id || index}>
                        <div className="export-ai-section-head">
                          <span>{stage.title}</span>
                          <span className="export-node-kind">{stage.nodeIds.length} {t("nodes")}</span>
                        </div>
                        {stage.question && (
                          <p className="export-ai-section-summary">
                            <span className="export-ai-label">{t("reportStageQuestion")}</span>
                            {stage.question}
                          </p>
                        )}
                        {stage.reasoning && (
                          <p className="export-ai-section-summary">{stage.reasoning}</p>
                        )}
                        {stage.outcome && (
                          <p className="export-ai-section-summary">
                            <span className="export-ai-label">{t("reportStageOutcome")}</span>
                            {stage.outcome}
                          </p>
                        )}
                      </div>
                    ))}
                    {(aiPlan.milestones ?? []).length > 0 && (
                      <div className="export-ai-overview">
                        <span className="export-ai-label">{t("reportMilestones")}</span>
                        <ul className="export-ai-findings">
                          {(aiPlan.milestones ?? []).map((milestone, index) => (
                            <li key={`${milestone.title}-${index}`}>
                              <strong>{milestone.title}</strong>：{milestone.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(aiPlan.brightSpots ?? []).length > 0 && (
                      <div className="export-ai-overview">
                        <span className="export-ai-label">{t("reportBrightSpots")}</span>
                        <ul className="export-ai-findings">
                          {(aiPlan.brightSpots ?? []).map((spot, index) => (
                            <li key={`${spot.title}-${index}`}>
                              <strong>{spot.title}</strong>：{spot.insight}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiPlan.conclusion && (
                      <div className="export-ai-overview">
                        <span className="export-ai-label">{t("reportConclusion")}</span>
                        <p>{aiPlan.conclusion}</p>
                      </div>
                    )}
                    {(aiPlan.openQuestions ?? []).length > 0 && (
                      <div className="export-ai-overview">
                        <span className="export-ai-label">{t("reportOpenQuestions")}</span>
                        <ul className="export-ai-findings">
                          {(aiPlan.openQuestions ?? []).map((question, index) => (
                            <li key={`${question.question}-${index}`}>{question.question}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="export-section export-section-tasks">
              <div className="export-section-head">
                <h3>{t("exportSectionTasks")}</h3>
                <p>{report.tasks.length} {t("reportTasks")}</p>
              </div>
              <div className="export-jump-hint">
                {scopeMode === "selected" ? t("exportSelectHint") : t("exportJumpHint")}
              </div>
              <ul className="export-node-list">
                {visibleTasks.map((task) => (
                  <li key={task.node.id} className="export-node-item">
                    {scopeMode === "selected" && (
                      <input
                        type="checkbox"
                        className="export-node-check"
                        checked={selectedTaskIds.has(task.node.id)}
                        onChange={() => toggleTaskSelection(task.node.id)}
                        aria-label={`${t("exportSelectTask")}：${task.question || task.node.data.title || ""}`}
                      />
                    )}
                    <button
                      type="button"
                      className="export-node-main"
                      title={t("jumpToNode")}
                      onClick={() => handleJumpToNode(task.node.id)}
                    >
                      <span className="export-node-kind">{task.path}</span>
                      <span className="export-node-title">{task.question || String(task.node.data.title ?? "Untitled")}</span>
                      <span className="export-node-kind">{authorText(task.authorLabel)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {report.tasks.length > PREVIEW_TASK_LIMIT && (
                <button
                  type="button"
                  className="export-show-all"
                  onClick={() => setShowAllTasks((value) => !value)}
                >
                  {showAllTasks
                    ? t("showFewerTasks")
                    : `${t("showAllTasks")} (${report.tasks.length})`}
                </button>
              )}
              {report.looseNotes.length > 0 && (
                <div className="export-meta">
                  {t("reportLooseNotes")} {report.looseNotes.length}
                </div>
              )}
            </section>

            <section className="export-section export-section-formats">
              <div className="export-section-head">
                <h3>{t("exportSectionFormats")}</h3>
                <p>{report.tasks.length} {t("reportTasks")} · {evidenceCount} {t("reportEvidence")} · {resultCount} {t("reportResults")}</p>
              </div>
              <div className="export-format-grid">
                <div className="export-format-card">
                  <div className="export-format-head">
                    <span className="export-format-name">{t("exportFormatJson")}</span>
                    <span className="export-format-ext">.json</span>
                  </div>
                  <p className="export-format-desc">{t("jsonRoundTripDesc")}</p>
                  <button
                    type="button"
                    className="export-format-action"
                    disabled={!hasNodes}
                    onClick={handleDownloadJson}
                  >
                    {t("downloadJson")}
                  </button>
                </div>
                <div className="export-format-card">
                  <div className="export-format-head">
                    <span className="export-format-name">{t("exportFormatMarkdown")}</span>
                    <span className="export-format-ext">.md</span>
                  </div>
                  <p className="export-format-desc">{t("markdownDesc")}</p>
                  <button
                    type="button"
                    className="export-format-action"
                    disabled={!hasNodes}
                    onClick={() => downloadFile(aiReport?.markdown ?? report.markdown, `godeeper-report-${safeName}-${Date.now()}.md`, "text/markdown")}
                  >
                    {t("downloadMarkdown")}
                  </button>
                </div>
                <div className="export-format-card">
                  <div className="export-format-head">
                    <span className="export-format-name">{t("exportFormatHtml")}</span>
                    <span className="export-format-ext">.html</span>
                  </div>
                  <p className="export-format-desc">{t("htmlDesc")}</p>
                  <button
                    type="button"
                    className="export-format-action"
                    disabled={!hasNodes}
                    onClick={() => downloadFile(aiReport?.html ?? report.html, `godeeper-report-${safeName}-${Date.now()}.html`, "text/html")}
                  >
                    {t("downloadHtml")}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setExportOpen(false)}>{t("cancel")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
