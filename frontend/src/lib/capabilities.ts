/**
 * 前端能力判断。
 *
 * 服务端是权威来源：登录 / 刷新用户信息时会把 capabilities 写进本地用户缓存。
 * 这里的矩阵只是旧缓存（没有 capabilities 字段）的回退，保证升级前登录的 Pro 用户
 * 不会突然看不到回收站。P2 拆出私有包后，应改为只读服务端返回，删除本地矩阵。
 */
export const CAPABILITY_IDS = [
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
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];
export type Membership = "free" | "pro" | "team";

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

export interface CapabilityUser {
  membership?: string | null;
  capabilities?: string[] | null;
}

export function normalizeMembership(membership: string | null | undefined): Membership {
  return membership === "pro" || membership === "team" ? membership : "free";
}

export function capabilitiesFor(membership: string | null | undefined): CapabilityId[] {
  return [...PLAN_CAPABILITIES[normalizeMembership(membership)]];
}

export function hasCapability(
  user: CapabilityUser | null | undefined,
  capability: CapabilityId,
): boolean {
  if (!user) return false;
  if (Array.isArray(user.capabilities)) {
    return user.capabilities.includes(capability);
  }
  return PLAN_CAPABILITIES[normalizeMembership(user.membership)].includes(capability);
}
