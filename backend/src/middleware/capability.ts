import type { Context, Next } from "hono";
import { hasCapability, type CapabilityId } from "../lib/capabilities";

/**
 * 整段拒绝型能力门禁。
 * 需要「免费可用但降级」的场景（例如搜索只返回标题预览）用 hasCapability 分支，
 * 不要用这个中间件直接 403。
 */
export async function requireCapability(capability: CapabilityId, c: Context, next: Next) {
  const user = c.get("user");
  if (!hasCapability(user.membership, capability)) {
    return c.json({
      error: `Requires capability: ${capability}`,
      code: "CAPABILITY_REQUIRED",
      capability,
    }, 403);
  }
  await next();
}
