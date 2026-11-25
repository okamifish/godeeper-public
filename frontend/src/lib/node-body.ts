/** 单个节点正文的技术护栏：不是产品限制，只防止误粘贴超大文本拖垮渲染与保存。 */
export const MAX_NODE_BODY_CHARS = 20_000;

/** 引导模式：方向在探索路径中的认知角色，独立于 taskType。 */
export type GuideRole = "foundation" | "compare" | "mechanism" | "judgement";

const GUIDE_ROLES: readonly GuideRole[] = ["foundation", "compare", "mechanism", "judgement"];

function normalizeGuideRole(value: unknown): GuideRole | undefined {
  return typeof value === "string" && (GUIDE_ROLES as readonly string[]).includes(value)
    ? (value as GuideRole)
    : undefined;
}

/** 目录卡里的一行：结果模式下是答案，引导模式下是待探索方向。 */
export interface CatalogItem {
  id: string;
  title: string;
  body: string;
  /** 引导模式：为什么探索这个方向；结果模式为空 */
  why?: string;
  /** 引导模式：依赖的其他条目 id */
  dependsOn?: string[];
  /** 引导模式：认知角色 */
  role?: GuideRole;
  /** 引导模式：最多一个方向为 true */
  recommended?: boolean;
  /** 引导模式：AI 生成或用户自行添加 */
  source?: "ai" | "user";
}

/** 目录卡统一数据结构：结果卡与引导卡共用。 */
export interface NodeCatalog {
  mode: "answers" | "directions";
  items: CatalogItem[];
  collapsed: boolean;
  /** 引导模式的短答 */
  summary?: string;
}

/** 旧代码使用的名字，保留为同一类型的别名。 */
export type ResultCatalogItem = CatalogItem;

export function clampNodeBody(value: string): string {
  return value.length > MAX_NODE_BODY_CHARS ? value.slice(0, MAX_NODE_BODY_CHARS) : value;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function normalizeCatalogItems(value: unknown): CatalogItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item, index) => {
      const role = normalizeGuideRole(item.role);
      const source: CatalogItem["source"] =
        item.source === "ai" || item.source === "user" ? item.source : undefined;
      return {
        id: toText(item.id) || `catalog-item-${index}`,
        title: toText(item.title),
        body: toText(item.body),
        ...(toText(item.why) ? { why: toText(item.why) } : {}),
        ...(Array.isArray(item.dependsOn)
          ? { dependsOn: item.dependsOn.map(toText).filter(Boolean) }
          : {}),
        ...(role ? { role } : {}),
        ...(typeof item.recommended === "boolean" ? { recommended: item.recommended } : {}),
        ...(source ? { source } : {}),
      };
    })
    .filter((item) => item.title || item.body)
    .slice(0, 50);
}

/**
 * 读取统一的目录数据：
 * - 新数据读 `catalog`；
 * - 旧画布把 `resultItems` / `catalogCollapsed` 归一化成 answers 模式。
 */
export function normalizeNodeCatalog(input: {
  catalog?: unknown;
  resultItems?: unknown;
  catalogCollapsed?: unknown;
}): NodeCatalog | undefined {
  const raw = input.catalog;
  if (raw && typeof raw === "object" && Array.isArray((raw as NodeCatalog).items)) {
    const record = raw as NodeCatalog;
    const items = normalizeCatalogItems(record.items);
    if (items.length === 0) return undefined;
    return {
      mode: record.mode === "directions" ? "directions" : "answers",
      items,
      collapsed: record.collapsed === true,
      ...(toText(record.summary).trim() ? { summary: toText(record.summary) } : {}),
    };
  }

  const legacyItems = normalizeCatalogItems(input.resultItems);
  if (legacyItems.length === 0) return undefined;
  return {
    mode: "answers",
    items: legacyItems,
    collapsed: input.catalogCollapsed === true,
  };
}

/**
 * 目录卡的可见正文：同时写入 node.body，
 * 让搜索、导出、上下文、反链继续按正文工作。
 */
export function buildCatalogBody(items: CatalogItem[]): string {
  return items
    .map((item) => [item.title.trim(), item.body.trim()].filter(Boolean).join("\n"))
    .join("\n\n")
    .trim();
}

/** 兼容旧调用名 */
export const buildResultCatalogBody = buildCatalogBody;

/** 未渲染前的高度估算，仅用于防重叠；渲染后优先使用实测尺寸。 */
export function estimateCatalogHeight(items: CatalogItem[]): number {
  const HEADER = 96;
  const MAX = 720;
  let height = HEADER;
  for (const item of items) {
    const bodyLines = Math.max(1, Math.ceil(item.body.length / 42));
    height += 28 + Math.min(bodyLines, 30) * 22 + 24;
  }
  return Math.min(height, MAX);
}
