import type { TraceItem } from "@/lib/types";

export function importStarted(importId: string, lang: "zh" | "en" = "zh"): TraceItem {
  return {
    id: importId,
    title: lang === "zh" ? "来源导入开始" : "Source Import Started",
    body: lang === "zh" ? "新的来源节点已进入画布，系统开始自动拆解为多个一级观点。" : "A new source node has been added. The system is decomposing it into key viewpoints.",
  };
}

export function sourceDecomposed(fragmentId: string, index: number, lang: "zh" | "en" = "zh"): TraceItem {
  return {
    id: `${fragmentId}-timeline`,
    title: lang === "zh" ? "来源已拆解" : "Source Decomposed",
    body: lang === "zh" ? `系统已生成第 ${index + 1} 个一级观点节点，用户可以继续拖拽、重排或发起任务。` : `Viewpoint #${index + 1} has been generated. Drag, rearrange, or create a task to dig deeper.`,
  };
}

export function taskFromImport(taskId: string, lang: "zh" | "en" = "zh"): TraceItem {
  return {
    id: `${taskId}-timeline`,
    title: lang === "zh" ? "基于导入内容创建任务" : "Task Created From Import",
    body: lang === "zh" ? "系统已经基于拆解结果创建任务节点，接下来会流式生成首轮推理分支。" : "A task node has been created from the decomposition. Streaming reasoning branches next.",
  };
}

export function streamingResult(resultId: string, lang: "zh" | "en" = "zh"): TraceItem {
  return {
    id: `${resultId}-timeline`,
    title: lang === "zh" ? "流式结果已添加" : "Streaming Result Added",
    body: lang === "zh" ? "结果节点已按顺序流式加入画布，并自动挂接到当前任务分支。" : "A result node has been streamed in and attached to the current task branch.",
  };
}

export function taskRerun(nodeId: string, lang: "zh" | "en" = "zh"): TraceItem {
  return {
    id: `${nodeId}-timeline`,
    title: lang === "zh" ? "任务重新运行完成" : "Task Re-run Completed",
    body: lang === "zh" ? "旧结果未被覆盖，系统继续在右侧追加一组新的平行推理分支。" : "Previous results preserved. A new parallel reasoning branch has been appended.",
  };
}

export function taskFromSelection(taskId: string, count: number, lang: "zh" | "en" = "zh"): TraceItem {
  return {
    id: `${taskId}-timeline`,
    title: lang === "zh" ? "基于选中创建任务" : "Task Created From Selection",
    body: lang === "zh" ? `用户选中了 ${count} 个节点作为上下文，系统已创建任务节点并开始推理。` : `${count} nodes selected as context. Task created and reasoning started.`,
  };
}

export function crossContextResult(resultId: string, lang: "zh" | "en" = "zh"): TraceItem {
  return {
    id: `${resultId}-timeline`,
    title: lang === "zh" ? "跨上下文结果已生成" : "Cross-context Result Generated",
    body: lang === "zh" ? "任务节点已完成首轮推理，结果节点已追加到右侧。" : "First round of reasoning complete. Result node appended.",
  };
}

export function nodesDeleted(deleteId: string, count: number, lang: "zh" | "en" = "zh"): TraceItem {
  return {
    id: deleteId,
    title: lang === "zh" ? "节点已删除" : "Nodes Deleted",
    body: lang === "zh" ? `已删除 ${count} 个节点及其相关连线。` : `${count} nodes and their connections have been deleted.`,
  };
}

export function nodeDuplicated(copyId: string, title: string, lang: "zh" | "en" = "zh"): TraceItem {
  return {
    id: `${copyId}-timeline`,
    title: lang === "zh" ? "节点已复制" : "Node Duplicated",
    body: lang === "zh" ? `已复制节点「${title}」，新节点已添加到画布。` : `"${title}" has been duplicated and added to the canvas.`,
  };
}
