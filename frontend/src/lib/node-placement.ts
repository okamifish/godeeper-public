/**
 * 节点落位：纯函数，便于单测。
 *
 * 目标不是“永不重叠”的全局最优，而是：
 * 1. 优先放在锚点旁边，保持连线短；
 * 2. 冲突时按固定顺序寻找最近空位，结果可复现；
 * 3. 不依赖页面状态，方便在 store 里复用。
 */

export interface PlacementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PlacementSide = "right" | "below" | "left" | "above";

export interface PlacementOptions {
  preferred?: PlacementSide;
  /** 新节点与锚点/其它节点之间保留的间距 */
  gap?: number;
  /** 冲突时最多向外搜索多少轮 */
  maxRings?: number;
}

const SIDE_ORDER: PlacementSide[] = ["right", "below", "left", "above"];

function overlaps(a: PlacementRect, b: PlacementRect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y
  );
}

function clampNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function candidate(anchor: PlacementRect, width: number, height: number, side: PlacementSide, gap: number, ring: number): PlacementRect {
  const stepY = height + gap;
  const stepX = width + gap;
  switch (side) {
    case "right":
      return {
        x: anchor.x + anchor.width + gap,
        y: anchor.y + anchor.height / 2 - height / 2 + ring * stepY,
        width,
        height,
      };
    case "below":
      return {
        x: anchor.x + anchor.width / 2 - width / 2 + ring * stepX,
        y: anchor.y + anchor.height + gap,
        width,
        height,
      };
    case "left":
      return {
        x: anchor.x - width - gap,
        y: anchor.y + anchor.height / 2 - height / 2 + ring * stepY,
        width,
        height,
      };
    case "above":
    default:
      return {
        x: anchor.x + anchor.width / 2 - width / 2 + ring * stepX,
        y: anchor.y - height - gap,
        width,
        height,
      };
  }
}

/**
 * 返回第一个不与 obstacles 冲突的位置。
 * 搜索顺序：preferred → 其余三边；每轮先正向偏移，再反向偏移。
 */
export function findFreeSlot(
  anchor: PlacementRect,
  width: number,
  height: number,
  obstacles: PlacementRect[],
  options: PlacementOptions = {},
): { x: number; y: number } {
  const gap = Math.max(0, clampNumber(options.gap ?? 40, 40));
  const maxRings = Math.max(0, Math.floor(clampNumber(options.maxRings ?? 24, 24)));
  const preferred = options.preferred ?? "right";
  const sides = [preferred, ...SIDE_ORDER.filter((side) => side !== preferred)];
  const safeWidth = Math.max(40, clampNumber(width, 340));
  const safeHeight = Math.max(40, clampNumber(height, 200));

  for (const side of sides) {
    const base = candidate(anchor, safeWidth, safeHeight, side, gap, 0);
    if (!obstacles.some((obstacle) => overlaps(base, obstacle, gap))) {
      return { x: base.x, y: base.y };
    }
    for (let ring = 1; ring <= maxRings; ring += 1) {
      const forward = candidate(anchor, safeWidth, safeHeight, side, gap, ring);
      if (!obstacles.some((obstacle) => overlaps(forward, obstacle, gap))) {
        return { x: forward.x, y: forward.y };
      }
      const backward = candidate(anchor, safeWidth, safeHeight, side, gap, -ring);
      if (!obstacles.some((obstacle) => overlaps(backward, obstacle, gap))) {
        return { x: backward.x, y: backward.y };
      }
    }
  }

  // 极端情况下退回右侧并向下排，至少保证不会落在原点。
  const fallback = candidate(anchor, safeWidth, safeHeight, "right", gap, maxRings + 1);
  return { x: fallback.x, y: fallback.y };
}

/** 一组节点的整体包围盒，用于“选中建任务”这类多选场景。 */
export function boundingBox(rects: PlacementRect[]): PlacementRect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
