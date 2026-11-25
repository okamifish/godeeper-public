export const BASE_NODE_WIDTH = 340;

/** 结果目录卡装多条答案，需要比普通结果卡宽得多 */
export const RESULT_CATALOG_WIDTH = 820;

export const WIDTH_BY_KIND: Partial<Record<string, number>> = {
  task: 380,
  free: 300,
  link: 480,
  inspire: 360,
  // 图片卡片按固定宽度展示，高度由图片比例与最大高度决定
  image: 320,
  // 笔记卡片需要左右分栏：左侧原图、右侧识别结果
  note: 760,
};

export const EDGE_COLORS = {
  active: {
    stroke: "rgba(53, 112, 212, 0.9)",
  },
  inactive: {
    // 低饱和蓝灰：比纯灰更贴合便签卡皮肤，虚线也更容易看清
    stroke: "rgba(116, 140, 176, 0.62)",
  },
} as const;

// 虚线需要更醒目：普通边 2.4、活跃/聚焦边 2.8
export const EDGE_WIDTHS = {
  active: 2.8,
  inactive: 2.4,
} as const;

export const DAGRE_CONFIG = {
  rankdir: "LR",
  nodesep: 140,
  ranksep: 240,
  marginx: 100,
  marginy: 100,
} as const;

/**
 * 节点高度估算（仅用于自动布局与防重叠，不参与真实渲染高度）
 * 数值来自便签卡皮肤接入后的画布实测（2026-10-27，seed 画布六节点）。
 */
export const NODE_HEIGHT_BY_KIND: Record<string, number> = {
  task: 360,
  link: 505,
  result: 300,
  text: 260,
  free: 240,
  // 启发类任务卡与任务卡同结构（标题 + 提示词 + 底部操作）
  inspire: 360,
  // 笔记卡片左右分栏，右侧 Markdown 区域固定滚动高度
  note: 540,
  // 图片卡片：固定宽度 + 图片最大高度 + 页脚
  image: 280,
} as const;
