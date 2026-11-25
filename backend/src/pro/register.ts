import * as proBackend from "@godeeper/pro-backend";
import type {
  ProBackendDeps,
  ProBackendModule,
  ProRouteHost,
  ProServices,
} from "@godeeper/pro-contract";
import { setProServices } from "./runtime";

export interface ProRuntime {
  edition: "stub" | "pro";
  services: ProServices | null;
}

/**
 * 加载当前安装的 Pro 实现：
 * - 社区版：`@godeeper/pro-backend` 指向 packages/pro-stub（公开）。
 * - 商业版：同一包名指向私有仓库的 pro-backend。
 *
 * 用包名替换而不是环境变量分支，避免“装了 Pro 却忘记设环境变量”的半开状态。
 */
export function registerProBackend(
  app: ProRouteHost,
  deps: ProBackendDeps,
): ProRuntime {
  const mod = proBackend as unknown as ProBackendModule;
  mod.register(app, deps);
  const services = mod.createServices ? mod.createServices(deps) : null;
  setProServices(services);
  return {
    edition: mod.edition,
    services,
  };
}
