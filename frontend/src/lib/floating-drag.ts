/**
 * 浮动元素拖动几何：把“起点 + 位移”映射到视口内合法的 left/top。
 * 纯函数，方便单测，避免页面里散落的坐标计算再次算错。
 */
export interface DragPositionInput {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  clientX: number;
  clientY: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  minLeft?: number;
  minTop?: number;
  /** 小于该位移视为点击，不移动元素 */
  threshold?: number;
}

export interface DragPosition {
  x: number;
  y: number;
  moved: boolean;
}

function clamp(value: number, min: number, max: number) {
  if (max <= min) return min;
  return Math.min(Math.max(value, min), max);
}

export function computeDragPosition(input: DragPositionInput): DragPosition {
  const {
    startX,
    startY,
    originX,
    originY,
    clientX,
    clientY,
    width,
    height,
    viewportWidth,
    viewportHeight,
    minLeft = 8,
    minTop = 56,
    threshold = 4,
  } = input;

  const dx = clientX - startX;
  const dy = clientY - startY;
  if (Math.hypot(dx, dy) < threshold) {
    return { x: originX, y: originY, moved: false };
  }

  const maxLeft = viewportWidth - width;
  const maxTop = viewportHeight - height;
  return {
    x: clamp(originX + dx, minLeft, maxLeft),
    y: clamp(originY + dy, minTop, maxTop),
    moved: true,
  };
}

export interface PanelWidthInput {
  startX: number;
  startWidth: number;
  clientX: number;
  minWidth: number;
  maxWidth: number;
}

/** 右栏位于右侧：向左拖变大，向右拖变小 */
export function computePanelWidth(input: PanelWidthInput): number {
  const { startX, startWidth, clientX, minWidth, maxWidth } = input;
  return Math.round(clamp(startWidth + (startX - clientX), minWidth, maxWidth));
}
