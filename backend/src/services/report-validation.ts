import type {
  ProOrganizedReport,
  ProReportGraphInput,
  ProReportGraphNode,
} from "@godeeper/pro-contract";

export type ReportValidationRule =
  | "scope"
  | "coverage"
  | "anchor"
  | "relation"
  | "stage"
  | "edge"
  | "text";

export interface ReportValidationIssue {
  rule: ReportValidationRule;
  message: string;
  ids?: string[];
}

export type ReportValidationResult =
  | { ok: true }
  | { ok: false; issues: ReportValidationIssue[] };

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function nodeLabel(node: ProReportGraphNode | undefined): string {
  if (!node) return "未知节点";
  return node.title ? `${node.id}（${node.title}）` : node.id;
}

function pushMissingText(
  issues: ReportValidationIssue[],
  value: unknown,
  label: string,
) {
  if (!text(value)) {
    issues.push({ rule: "text", message: `${label}不能为空` });
  }
}

/**
 * 校验 AI 整理结果是否满足硬约束。
 *
 * 这里只做结构与关系校验，不判断叙述质量；质量由提示词与真实使用迭代负责。
 * 任何一项失败都应该让 route 抛错，从而触发 completeAiUsage 的失败退款。
 */
export function validateOrganizedReport(
  input: ProReportGraphInput,
  output: ProOrganizedReport,
): ReportValidationResult {
  const issues: ReportValidationIssue[] = [];

  const scopeIds = asArray<string>(input.scope?.nodeIds);
  const scopeSet = new Set(scopeIds);
  const inputNodes = asArray<ProReportGraphNode>(input.nodes);
  const inputEdges = asArray<ProReportGraphInput["edges"][number]>(input.edges);
  const nodeById = new Map(inputNodes.map((node) => [node.id, node]));
  const edgeById = new Map(inputEdges.map((edge) => [edge.id, edge]));

  // 目录卡条目的 id 也是模型可以引用的真实来源；校验时映射回所属结果卡节点。
  const catalogAnchorToNode = new Map<string, string>();
  for (const node of inputNodes) {
    for (const item of node.catalog?.items ?? []) {
      if (item.id) catalogAnchorToNode.set(item.id, node.id);
    }
  }
  const resolveAnchor = (id: string): string => catalogAnchorToNode.get(id) ?? id;

  if (scopeSet.size !== scopeIds.length) {
    issues.push({ rule: "scope", message: "scope.nodeIds 存在重复 id" });
  }
  if (nodeById.size !== scopeSet.size) {
    issues.push({
      rule: "scope",
      message: "scope.nodeIds 与 nodes 不一致",
      ids: Array.from(scopeSet).filter((id) => !nodeById.has(id)),
    });
  }
  if (Array.from(nodeById.keys()).some((id) => !scopeSet.has(id))) {
    issues.push({
      rule: "scope",
      message: "nodes 中存在 scope 之外的节点",
      ids: Array.from(nodeById.keys()).filter((id) => !scopeSet.has(id)),
    });
  }

  const stages = asArray<ProOrganizedReport["stages"][number]>(output?.stages);
  if (stages.length === 0) {
    issues.push({ rule: "stage", message: "stages 不能为空" });
  }

  const stageIds = new Set<string>();
  const nodeStage = new Map<string, string>();
  for (const stage of stages) {
    const stageId = text(stage?.id);
    if (!stageId) {
      issues.push({ rule: "stage", message: "stage.id 不能为空" });
      continue;
    }
    if (stageIds.has(stageId)) {
      issues.push({ rule: "stage", message: `stage.id 重复：${stageId}`, ids: [stageId] });
      continue;
    }
    stageIds.add(stageId);

    pushMissingText(issues, stage.title, `阶段 ${stageId} 的 title`);
    pushMissingText(issues, stage.question, `阶段 ${stageId} 的 question`);
    pushMissingText(issues, stage.reasoning, `阶段 ${stageId} 的 reasoning`);
    pushMissingText(issues, stage.outcome, `阶段 ${stageId} 的 outcome`);

    const stageNodeIds = asArray<string>(stage.nodeIds);
    if (stageNodeIds.length === 0) {
      issues.push({ rule: "coverage", message: `阶段 ${stageId} 没有节点`, ids: [stageId] });
    }
    for (const nodeId of stageNodeIds) {
      if (!scopeSet.has(nodeId)) {
        issues.push({
          rule: "coverage",
          message: `阶段 ${stageId} 引用了选区外节点：${nodeId}`,
          ids: [nodeId],
        });
        continue;
      }
      const existing = nodeStage.get(nodeId);
      if (existing) {
        issues.push({
          rule: "coverage",
          message: `节点 ${nodeId} 同时出现在阶段 ${existing} 和 ${stageId}`,
          ids: [nodeId],
        });
        continue;
      }
      nodeStage.set(nodeId, stageId);
    }
  }

  const missing = scopeIds.filter((id) => !nodeStage.has(id));
  if (missing.length > 0) {
    issues.push({
      rule: "coverage",
      message: `有 ${missing.length} 个选中节点没有归属阶段`,
      ids: missing.slice(0, 30),
    });
  }

  const mainThread = output?.mainThread;
  if (!mainThread) {
    issues.push({ rule: "stage", message: "mainThread 不能为空" });
  } else {
    pushMissingText(issues, mainThread.thesis, "mainThread.thesis");
    pushMissingText(issues, mainThread.narrative, "mainThread.narrative");
    const mainStageIds = asArray<string>(mainThread.stageIds);
    let lastIndex = -1;
    for (const stageId of mainStageIds) {
      if (!stageIds.has(stageId)) {
        issues.push({
          rule: "stage",
          message: `mainThread.stageIds 引用了不存在的阶段：${stageId}`,
          ids: [stageId],
        });
        continue;
      }
      const index = stages.findIndex((stage) => stage.id === stageId);
      if (index < lastIndex) {
        issues.push({
          rule: "stage",
          message: "mainThread.stageIds 顺序与 stages 不一致",
          ids: mainStageIds,
        });
        break;
      }
      lastIndex = index;
    }
  }

  for (const milestone of asArray<ProOrganizedReport["milestones"][number]>(output?.milestones)) {
    const stageId = text(milestone?.stageId);
    if (!stageIds.has(stageId)) {
      issues.push({
        rule: "anchor",
        message: `里程碑引用了不存在的阶段：${stageId || "(空)"}`,
        ids: stageId ? [stageId] : undefined,
      });
      continue;
    }
    const stageNodeIds = new Set(
      asArray<string>(stages.find((stage) => stage.id === stageId)?.nodeIds),
    );
    const ids = asArray<string>(milestone.nodeIds);
    if (ids.length === 0) {
      issues.push({ rule: "anchor", message: `里程碑「${text(milestone.title)}」没有节点锚点` });
    }
    for (const nodeId of ids) {
      const resolved = resolveAnchor(nodeId);
      if (!scopeSet.has(resolved) || !stageNodeIds.has(resolved)) {
        issues.push({
          rule: "anchor",
          message: `里程碑「${text(milestone.title)}」的锚点不属于该阶段：${nodeId}`,
          ids: [nodeId],
        });
      }
    }
  }

  for (const spot of asArray<ProOrganizedReport["brightSpots"][number]>(output?.brightSpots)) {
    const ids = asArray<string>(spot.nodeIds);
    if (ids.length === 0) {
      issues.push({ rule: "anchor", message: `闪光点「${text(spot.title)}」没有节点锚点` });
    }
    for (const nodeId of ids) {
      if (!scopeSet.has(resolveAnchor(nodeId))) {
        issues.push({
          rule: "anchor",
          message: `闪光点「${text(spot.title)}」引用了选区外节点：${nodeId}`,
          ids: [nodeId],
        });
      }
    }
  }

  for (const question of asArray<ProOrganizedReport["openQuestions"][number]>(output?.openQuestions)) {
    const ids = asArray<string>(question.nodeIds);
    if (ids.length === 0) {
      issues.push({ rule: "anchor", message: `未决问题「${text(question.question)}」没有节点锚点` });
    }
    for (const nodeId of ids) {
      if (!scopeSet.has(resolveAnchor(nodeId))) {
        issues.push({
          rule: "anchor",
          message: `未决问题引用了选区外节点：${nodeId}`,
          ids: [nodeId],
        });
      }
    }
  }

  const relationEdgeIds = new Set<string>();
  for (const relation of asArray<ProOrganizedReport["relations"][number]>(output?.relations)) {
    const edgeId = text(relation?.edgeId);
    if (!edgeId || !edgeById.has(edgeId)) {
      issues.push({
        rule: "edge",
        message: `relations 引用了不存在的边：${edgeId || "(空)"}`,
        ids: edgeId ? [edgeId] : undefined,
      });
      continue;
    }
    if (relationEdgeIds.has(edgeId)) {
      issues.push({ rule: "edge", message: `relations 重复登记边：${edgeId}`, ids: [edgeId] });
      continue;
    }
    relationEdgeIds.add(edgeId);
  }

  const stageNodeIndex = new Map<string, Map<string, number>>();
  for (const stage of stages) {
    const index = new Map<string, number>();
    asArray<string>(stage.nodeIds).forEach((nodeId, position) => {
      index.set(nodeId, position);
    });
    stageNodeIndex.set(stage.id, index);
  }

  for (const edge of inputEdges) {
    if (!scopeSet.has(edge.source) || !scopeSet.has(edge.target)) {
      issues.push({
        rule: "edge",
        message: `边 ${edge.id} 的端点不在选区内`,
        ids: [edge.source, edge.target],
      });
      continue;
    }

    const sourceStage = nodeStage.get(edge.source);
    const targetStage = nodeStage.get(edge.target);
    const registered = relationEdgeIds.has(edge.id);
    const sameStage = Boolean(sourceStage && targetStage && sourceStage === targetStage);

    if (edge.relation === "result") {
      if (sameStage) {
        const sourceIndex = stageNodeIndex.get(sourceStage as string)?.get(edge.source) ?? -1;
        const targetIndex = stageNodeIndex.get(targetStage as string)?.get(edge.target) ?? -1;
        if (sourceIndex < 0 || targetIndex < 0 || targetIndex < sourceIndex) {
          issues.push({
            rule: "relation",
            message: `结果卡 ${nodeLabel(nodeById.get(edge.target))} 必须排在任务之后`,
            ids: [edge.id, edge.source, edge.target],
          });
        }
      } else {
        // 允许“任务在较早阶段、结果在收敛阶段”的结构，但结果阶段必须更靠后，并显式登记关系。
        const sourceStageIndex = stages.findIndex((stage) => stage.id === sourceStage);
        const targetStageIndex = stages.findIndex((stage) => stage.id === targetStage);
        if (
          sourceStageIndex < 0
          || targetStageIndex < 0
          || targetStageIndex <= sourceStageIndex
          || !registered
        ) {
          issues.push({
            rule: "relation",
            message: `结果卡 ${nodeLabel(nodeById.get(edge.target))} 必须和任务同阶段，或放在更靠后的阶段并在 relations 中登记`,
            ids: [edge.id, edge.source, edge.target],
          });
        }
      }
      continue;
    }

    if (edge.relation === "branch") {
      if (!sameStage) {
        issues.push({
          rule: "relation",
          message: `父子任务 ${nodeLabel(nodeById.get(edge.source))} → ${nodeLabel(nodeById.get(edge.target))} 被拆到了不同阶段`,
          ids: [edge.id, edge.source, edge.target],
        });
        continue;
      }
      const sourceIndex = stageNodeIndex.get(sourceStage as string)?.get(edge.source) ?? -1;
      const targetIndex = stageNodeIndex.get(targetStage as string)?.get(edge.target) ?? -1;
      if (sourceIndex < 0 || targetIndex < 0 || targetIndex < sourceIndex) {
        issues.push({
          rule: "relation",
          message: `父子任务 ${nodeLabel(nodeById.get(edge.source))} 必须排在子任务 ${nodeLabel(nodeById.get(edge.target))} 之前`,
          ids: [edge.id, edge.source, edge.target],
        });
      }
      continue;
    }

    // 结构性的 text/free/note 连线允许跨阶段；真正需要登记的是证据关系。
    if (edge.relation === "evidence" && !sameStage && !registered) {
      issues.push({
        rule: "relation",
        message: `跨阶段证据边 ${edge.id} 没有在 relations 中登记`,
        ids: [edge.id, edge.source, edge.target],
      });
    }
  }

  return issues.length > 0 ? { ok: false, issues: issues.slice(0, 50) } : { ok: true };
}

export interface ReportRepairResult {
  report: ProOrganizedReport;
  repairs: string[];
}

/**
 * 只修复“记账类”结构问题，不改写任何叙述内容：
 * - 目录条目 id 映射回所属结果卡；
 * - 同一节点重复归属时保留第一次出现；
 * - 删除被删空的阶段，并同步主线/里程碑；
 * - 里程碑阶段按多数锚点重定位；
 * - 丢弃无有效锚点的闪光点/未决问题/未知关系。
 *
 * 修完仍不满足硬约束时，再交给 validateOrganizedReport 报错。
 */
export function repairOrganizedReport(
  input: ProReportGraphInput,
  output: ProOrganizedReport,
): ReportRepairResult {
  const report = structuredClone(output);
  const repairs: string[] = [];
  const scopeSet = new Set(input.scope.nodeIds);
  const catalogAnchorToNode = new Map<string, string>();
  for (const node of asArray<ProReportGraphNode>(input.nodes)) {
    for (const item of node.catalog?.items ?? []) {
      if (item.id) catalogAnchorToNode.set(item.id, node.id);
    }
  }
  const resolve = (id: string): string => catalogAnchorToNode.get(id) ?? id;

  const seen = new Set<string>();
  const stages: ProOrganizedReport["stages"] = [];
  let stageIndex = 0;
  for (const stage of asArray<ProOrganizedReport["stages"][number]>(report.stages)) {
    stageIndex += 1;
    const stageId = text(stage.id) || `s${stageIndex}`;
    if (stageId !== stage.id) {
      repairs.push(`renamed empty stage id to ${stageId}`);
    }
    const nodeIds: string[] = [];
    for (const rawId of asArray<string>(stage.nodeIds)) {
      const nodeId = resolve(String(rawId));
      if (!scopeSet.has(nodeId) || seen.has(nodeId)) continue;
      seen.add(nodeId);
      nodeIds.push(nodeId);
    }
    if (nodeIds.length === 0) {
      repairs.push(`dropped empty stage ${stageId}`);
      continue;
    }
    stages.push({ ...stage, id: stageId, nodeIds });
  }
  report.stages = stages;

  const stageIds = new Set(stages.map((stage) => stage.id));
  const nodeStage = new Map<string, string>();
  for (const stage of stages) {
    for (const nodeId of stage.nodeIds) nodeStage.set(nodeId, stage.id);
  }

  if (!report.mainThread) {
    report.mainThread = { thesis: "", narrative: "", stageIds: [] };
  }
  const mainStageIds: string[] = [];
  for (const stageId of asArray<string>(report.mainThread.stageIds)) {
    if (stageIds.has(stageId) && !mainStageIds.includes(stageId)) mainStageIds.push(stageId);
  }
  report.mainThread.stageIds = mainStageIds.length > 0
    ? mainStageIds
    : stages.map((stage) => stage.id);

  const milestones: ProOrganizedReport["milestones"] = [];
  for (const milestone of asArray<ProOrganizedReport["milestones"][number]>(report.milestones)) {
    const anchors = asArray<string>(milestone.nodeIds)
      .map(resolve)
      .filter((id) => scopeSet.has(id));
    const counts = new Map<string, number>();
    for (const nodeId of anchors) {
      const stageId = nodeStage.get(nodeId);
      if (!stageId) continue;
      counts.set(stageId, (counts.get(stageId) ?? 0) + 1);
    }
    let bestStage = "";
    let bestCount = 0;
    for (const [stageId, count] of counts) {
      if (count > bestCount) {
        bestStage = stageId;
        bestCount = count;
      }
    }
    if (!bestStage) {
      repairs.push(`dropped milestone without anchors: ${text(milestone.title)}`);
      continue;
    }
    const stageAnchors = anchors.filter((nodeId) => nodeStage.get(nodeId) === bestStage);
    if (milestone.stageId !== bestStage || stageAnchors.length !== anchors.length) {
      repairs.push(`moved milestone to its anchor stage: ${text(milestone.title)}`);
    }
    milestones.push({ ...milestone, stageId: bestStage, nodeIds: stageAnchors });
  }
  report.milestones = milestones;

  const brightSpots: ProOrganizedReport["brightSpots"] = [];
  for (const spot of asArray<ProOrganizedReport["brightSpots"][number]>(report.brightSpots)) {
    const anchors = asArray<string>(spot.nodeIds)
      .map(resolve)
      .filter((id) => scopeSet.has(id));
    if (anchors.length === 0) {
      repairs.push(`dropped bright spot without anchors: ${text(spot.title)}`);
      continue;
    }
    brightSpots.push({ ...spot, nodeIds: anchors });
  }
  report.brightSpots = brightSpots;

  const openQuestions: ProOrganizedReport["openQuestions"] = [];
  for (const question of asArray<ProOrganizedReport["openQuestions"][number]>(report.openQuestions)) {
    const anchors = asArray<string>(question.nodeIds)
      .map(resolve)
      .filter((id) => scopeSet.has(id));
    if (anchors.length === 0) {
      repairs.push(`dropped open question without anchors: ${text(question.question)}`);
      continue;
    }
    openQuestions.push({ ...question, nodeIds: anchors });
  }
  report.openQuestions = openQuestions;

  const edgeIds = new Set(asArray<ProReportGraphInput["edges"][number]>(input.edges).map((edge) => edge.id));
  report.relations = asArray<ProOrganizedReport["relations"][number]>(report.relations).filter((relation) => {
    if (edgeIds.has(relation.edgeId)) return true;
    repairs.push(`dropped unknown relation edge: ${relation.edgeId}`);
    return false;
  });

  return { report, repairs };
}
