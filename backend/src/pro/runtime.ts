import type { ProServices } from "@godeeper/pro-contract";

/**
 * 当前安装的 Pro 服务。
 * 社区版为 null；核心接口在能力允许且服务存在时才组合跨画布结果。
 */
let proServices: ProServices | null = null;

export function setProServices(services: ProServices | null | undefined) {
  proServices = services ?? null;
}

export function getProServices(): ProServices | null {
  return proServices;
}
