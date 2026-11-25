"use client";

import { BaseEdge } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";

/** 横向曲线的控制点长度：太短线会显得僵硬，太长会甩出卡片范围 */
const MAX_HORIZONTAL_CONTROL = 180;
const MIN_HORIZONTAL_CONTROL = 24;
const MAX_DIRECT_CONTROL = 140;

/**
 * 计算连线路径。
 *
 * React Flow 默认的贝塞尔边固定「源卡片右出、目标卡片左入」：
 * 一旦目标在源的左侧（dx < 0），两个控制点方向相反，线会先冲出右侧再绕回来，
 * 看起来就是「绕着卡片转一圈」。
 *
 * 这里在 dx < 0 时改为让控制点沿「源 → 目标」的连线方向布置，
 * 曲线始终落在两个端点构成的包围盒内，因此不会再绕过卡片。
 */
export function buildEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  if (dx >= 0) {
    const control = Math.min(
      Math.max(dx * 0.4, MIN_HORIZONTAL_CONTROL),
      MAX_HORIZONTAL_CONTROL,
    );
    return `M ${sourceX},${sourceY} C ${sourceX + control},${sourceY} ${targetX - control},${targetY} ${targetX},${targetY}`;
  }

  const distance = Math.hypot(dx, dy) || 1;
  const control = Math.min(distance * 0.35, MAX_DIRECT_CONTROL);
  const ux = dx / distance;
  const uy = dy / distance;
  return `M ${sourceX},${sourceY} C ${sourceX + ux * control},${sourceY + uy * control} ${targetX - ux * control},${targetY - uy * control} ${targetX},${targetY}`;
}

export function FlowEdge({ id, sourceX, sourceY, targetX, targetY, style }: EdgeProps) {
  return (
    <BaseEdge
      id={id}
      path={buildEdgePath(sourceX, sourceY, targetX, targetY)}
      style={style}
      interactionWidth={18}
    />
  );
}
