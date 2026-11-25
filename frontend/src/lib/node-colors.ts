import type { NodeKind } from "@/lib/types";

/** 画布与小地图共用的节点类型主色，避免两处色值漂移 */
export const NODE_KIND_COLORS: Record<NodeKind, string> = {
  text: "#3b352b",
  task: "#6c4cf1",
  link: "#3d5afe",
  result: "#107c58",
  free: "#a96400",
  inspire: "#cf4f86",
  note: "#2f6f8f",
  image: "#0f7b6c",
};

/** 把 #rrggbb 转成带透明度的 rgba */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((value) => Number.isNaN(value))) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function nodeKindColor(kind: string | undefined): string {
  if (kind && kind in NODE_KIND_COLORS) {
    return NODE_KIND_COLORS[kind as NodeKind];
  }
  return NODE_KIND_COLORS.text;
}

export function miniMapNodeColor(kind: string | undefined, alpha = 0.42): string {
  return withAlpha(nodeKindColor(kind), alpha);
}
