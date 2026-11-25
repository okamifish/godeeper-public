/**
 * 社区版 Pro 占位实现。
 *
 * 只保留 Pro 路由的形状，统一返回 403，避免社区版出现 404 或前端按钮失效。
 * 真正的 Pro 实现由私有仓库 godeeper-pro 以同名包替换。
 */
export const edition = "stub";

const deny = (c) => c.json({
  error: "Requires capability: canvas.restore",
  code: "CAPABILITY_REQUIRED",
  capability: "canvas.restore",
}, 403);

const guard = (deps) => (c, next) => deps.requireCapability("canvas.restore", c, next);

export function register(app, deps) {
  const router = deps.createRouter();
  router.use("/*", deps.authMiddleware);
  router.get("/trash", guard(deps), deny);
  router.post("/:id/restore", guard(deps), deny);
  app.route("/canvas", router);
}
