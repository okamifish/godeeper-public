/** 方案额度的展示格式化：null / 负数表示不限额 */
export function formatPlanLimit(
  value: number | null | undefined,
  unlimitedLabel = "不限",
): string {
  if (value === null || value === undefined || value < 0) return unlimitedLabel;
  if (!Number.isFinite(value)) return unlimitedLabel;
  return String(value);
}

/** 用量 / 额度，例如 "1 / 1" 或 "5 / 不限" */
export function formatPlanUsage(
  used: number,
  limit: number | null | undefined,
  unlimitedLabel = "不限",
): string {
  return `${used} / ${formatPlanLimit(limit, unlimitedLabel)}`;
}

/** 把 credits 三个字段拼成一行 */
export function formatCredits(credits: {
  taskRun: number;
  inspire: number;
  summary: number;
}): string {
  return `${credits.taskRun} / ${credits.inspire} / ${credits.summary}`;
}
