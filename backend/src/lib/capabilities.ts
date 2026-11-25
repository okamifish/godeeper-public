/**
 * 能力（entitlement）单一事实源。
 *
 * 业务代码判断「能不能用某个能力」，而不是判断「是不是 Pro」。
 * 这样以后把 Pro 实现搬到私有仓库时，只需要替换能力的提供方，
 * 不用再逐个修改路由里的会员字符串比较。
 */
export const CAPABILITY_IDS = [
  // 云
  "canvas.cloud",
  "canvas.cloud.multi",
  "canvas.restore",
  // 查找与引用
  "search.crossCanvas",
  "mention.crossCanvas",
  // AI 深化思考工具（P2 才会接线）
  "ai.concept",
  "ai.socratic",
  "ai.guided",
  "report.aiOrganize",
  // 导出与协作
  "export.pdf",
  "team.collab",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];
export type Membership = "free" | "pro" | "team";

/**
 * 免费 / Pro / Team 的能力矩阵。
 * 首版写在代码里，不改数据库 schema；后续需要后台可调时再迁移。
 */
export const PLAN_CAPABILITIES: Record<Membership, readonly CapabilityId[]> = {
  free: ["canvas.cloud"],
  pro: [
    "canvas.cloud",
    "canvas.cloud.multi",
    "canvas.restore",
    "search.crossCanvas",
    "mention.crossCanvas",
    "ai.concept",
    "ai.socratic",
    "ai.guided",
    "report.aiOrganize",
    "export.pdf",
  ],
  team: [
    "canvas.cloud",
    "canvas.cloud.multi",
    "canvas.restore",
    "search.crossCanvas",
    "mention.crossCanvas",
    "ai.concept",
    "ai.socratic",
    "ai.guided",
    "report.aiOrganize",
    "export.pdf",
    "team.collab",
  ],
};

/** 未知或缺失的会员值一律按 free 处理，避免多给权限。 */
export function normalizeMembership(membership: string | null | undefined): Membership {
  return membership === "pro" || membership === "team" ? membership : "free";
}

/** 返回副本，调用方修改数组不会污染矩阵。 */
export function capabilitiesFor(membership: string | null | undefined): CapabilityId[] {
  return [...PLAN_CAPABILITIES[normalizeMembership(membership)]];
}

export function hasCapability(
  membership: string | null | undefined,
  capability: CapabilityId,
): boolean {
  return PLAN_CAPABILITIES[normalizeMembership(membership)].includes(capability);
}
