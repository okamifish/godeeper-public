export interface PlanLimitRow {
  canvasesLimit: number;
  nodesPerCanvas: number;
  aiTasksPerDay: number;
  isUnlimited: boolean;
}

export interface PlanLimits {
  canvases: number;
  nodesPerCanvas: number;
  aiTasksPerDay: number;
}

/**
 * 把后台 plans 行转换为实际额度：
 * - isUnlimited=true → 三项都不限；
 * - 画布数 / 节点数 = -1 → 不限（兼容后台既有“∞”写法）；
 * - 每日 AI 次数 = 0 → 不限（后台表单既有说明）；
 * - 其余按设置值执行。
 */
export function normalizePlanLimits(row: PlanLimitRow): PlanLimits {
  if (row.isUnlimited) {
    return { canvases: Infinity, nodesPerCanvas: Infinity, aiTasksPerDay: Infinity };
  }
  return {
    canvases: row.canvasesLimit < 0 ? Infinity : row.canvasesLimit,
    nodesPerCanvas: row.nodesPerCanvas < 0 ? Infinity : row.nodesPerCanvas,
    aiTasksPerDay: row.aiTasksPerDay === 0 ? Infinity : row.aiTasksPerDay,
  };
}
