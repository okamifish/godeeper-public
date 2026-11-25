import type { CanvasGroup } from "@/lib/types";

export interface GroupColor {
  id: string;
  stroke: string;
  fill: string;
  label: { zh: string; en: string };
}

export const GROUP_COLORS: GroupColor[] = [
  { id: "blue", stroke: "#5b7cfa", fill: "rgba(91, 124, 250, 0.10)", label: { zh: "蓝", en: "Blue" } },
  { id: "green", stroke: "#2f9e6f", fill: "rgba(47, 158, 111, 0.10)", label: { zh: "绿", en: "Green" } },
  { id: "amber", stroke: "#c08a2e", fill: "rgba(192, 138, 46, 0.12)", label: { zh: "琥珀", en: "Amber" } },
  { id: "rose", stroke: "#c85b7a", fill: "rgba(200, 91, 122, 0.10)", label: { zh: "玫红", en: "Rose" } },
  { id: "violet", stroke: "#8b6bd9", fill: "rgba(139, 107, 217, 0.10)", label: { zh: "紫", en: "Violet" } },
];

export const DEFAULT_GROUP_COLOR = GROUP_COLORS[0].id;

export function getGroupColor(id: string): GroupColor {
  return GROUP_COLORS.find((color) => color.id === id) ?? GROUP_COLORS[0];
}

/** 校验并清理导出/快照里的分组字段；旧数据缺省返回空数组 */
export function normalizeGroups(raw: unknown): CanvasGroup[] {
  if (!Array.isArray(raw)) return [];
  const groups: CanvasGroup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const nodeIds = Array.isArray(record.nodeIds)
      ? record.nodeIds.map((value) => String(value)).filter(Boolean)
      : [];
    if (!id || nodeIds.length === 0) continue;
    groups.push({
      id,
      title: typeof record.title === "string" && record.title.trim()
        ? record.title.trim().slice(0, 80)
        : "未命名分组",
      color: typeof record.color === "string" ? record.color : DEFAULT_GROUP_COLOR,
      nodeIds,
    });
  }
  return groups;
}

/** 节点删除后清理分组里的失效成员；空组直接移除 */
export function pruneGroups(groups: CanvasGroup[], existingNodeIds: Set<string>): CanvasGroup[] {
  return groups
    .map((group) => ({
      ...group,
      nodeIds: group.nodeIds.filter((id) => existingNodeIds.has(id)),
    }))
    .filter((group) => group.nodeIds.length > 0);
}
