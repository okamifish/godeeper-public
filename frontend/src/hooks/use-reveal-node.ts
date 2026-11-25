"use client";

import { useCallback } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { NODE_HEIGHT_BY_KIND } from "@/data/layout-constants";
import { BASE_NODE_WIDTH } from "@/data/node-defaults";
import { useCanvasStore } from "@/lib/canvas-store";
import type { GoDeeperFlowNode } from "@/lib/types";

/** 露出视野时四周保留的屏幕像素，避免紧贴画布边缘 */
const REVEAL_MARGIN = 56;
/** 最多缩到当前缩放的 75%，避免「建一个节点整块画布突然变小」 */
const MAX_ZOOM_OUT_RATIO = 0.75;
const VIEWPORT_ANIMATION_MS = 260;

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function nodeSize(node: GoDeeperFlowNode) {
  return {
    width: node.measured?.width ?? node.data.width ?? BASE_NODE_WIDTH,
    height: node.measured?.height ?? NODE_HEIGHT_BY_KIND[node.data.kind] ?? 200,
  };
}

function nodeBox(node: GoDeeperFlowNode): Box {
  const { width, height } = nodeSize(node);
  return {
    minX: node.position.x,
    minY: node.position.y,
    maxX: node.position.x + width,
    maxY: node.position.y + height,
  };
}

function unionBox(boxes: Box[]): Box {
  return boxes.reduce((acc, box) => ({
    minX: Math.min(acc.minX, box.minX),
    minY: Math.min(acc.minY, box.minY),
    maxX: Math.max(acc.maxX, box.maxX),
    maxY: Math.max(acc.maxY, box.maxY),
  }));
}

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** 在给定缩放下，把 box 完整平移进可视区域所需的最小位移 */
function panDelta(box: Box, viewport: Viewport, paneWidth: number, paneHeight: number) {
  const left = box.minX * viewport.zoom + viewport.x;
  const top = box.minY * viewport.zoom + viewport.y;
  const right = box.maxX * viewport.zoom + viewport.x;
  const bottom = box.maxY * viewport.zoom + viewport.y;

  let dx = 0;
  let dy = 0;
  if (right > paneWidth - REVEAL_MARGIN) dx = paneWidth - REVEAL_MARGIN - right;
  else if (left < REVEAL_MARGIN) dx = REVEAL_MARGIN - left;
  if (bottom > paneHeight - REVEAL_MARGIN) dy = paneHeight - REVEAL_MARGIN - bottom;
  else if (top < REVEAL_MARGIN) dy = REVEAL_MARGIN - top;
  return { dx, dy };
}

/**
 * 新建节点后调用：保证新节点可见；如果给了 anchorId（源卡片），尽量让源卡片一起留在视野里。
 * - 首选不改变缩放，只做最小平移
 * - 两张卡一屏放不下时才缩小，且最多缩到当前缩放的 75%
 * - 位置从业务 store 读取，不依赖 React Flow 内部 lookup（刚创建时可能还没刷新）
 */
export function useRevealNode() {
  const { getViewport, setViewport } = useReactFlow();
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);

  return useCallback(
    (nodeId: string, anchorId?: string) => {
      const nodes = useCanvasStore.getState().nodes;
      const node = nodes.find((n) => n.id === nodeId);
      const anchor = anchorId ? nodes.find((n) => n.id === anchorId) : undefined;
      if (!node || !paneWidth || !paneHeight) return;

      const viewport = getViewport();
      const selfBox = nodeBox(node);
      const focusBox = anchor ? unionBox([selfBox, nodeBox(anchor)]) : selfBox;

      const availWidth = paneWidth - REVEAL_MARGIN * 2;
      const availHeight = paneHeight - REVEAL_MARGIN * 2;
      const focusWidth = focusBox.maxX - focusBox.minX;
      const focusHeight = focusBox.maxY - focusBox.minY;
      const fitsAtCurrentZoom =
        focusWidth * viewport.zoom <= availWidth && focusHeight * viewport.zoom <= availHeight;

      // 情形一：当前缩放下放得下 → 只做最小平移，不动缩放
      if (fitsAtCurrentZoom) {
        const { dx, dy } = panDelta(focusBox, viewport, paneWidth, paneHeight);
        if (dx !== 0 || dy !== 0) {
          setViewport(
            { x: viewport.x + dx, y: viewport.y + dy, zoom: viewport.zoom },
            { duration: VIEWPORT_ANIMATION_MS },
          );
        }
        return;
      }

      // 情形二：源卡片和新卡片一屏放不下 → 缩小到刚好放下，但不超过 25%
      const neededZoom = Math.min(availWidth / focusWidth, availHeight / focusHeight);
      const minZoom = viewport.zoom * MAX_ZOOM_OUT_RATIO;
      const zoom = Math.max(minZoom, Math.min(viewport.zoom, neededZoom));
      const target = zoom === minZoom && neededZoom < minZoom ? selfBox : focusBox;
      const centerX = (target.minX + target.maxX) / 2;
      const centerY = (target.minY + target.maxY) / 2;

      setViewport(
        {
          x: paneWidth / 2 - centerX * zoom,
          y: paneHeight / 2 - centerY * zoom,
          zoom,
        },
        { duration: VIEWPORT_ANIMATION_MS },
      );
    },
    [getViewport, setViewport, paneWidth, paneHeight],
  );
}
