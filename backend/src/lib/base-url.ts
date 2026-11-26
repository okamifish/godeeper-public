import { isPrivateIp } from "./safe-fetch";

/** BYOK baseUrl 校验失败时抛出；保存接口与真正发请求前使用同一套规则。 */
export class UnsafeBaseUrlError extends Error {
  constructor(message = "Invalid baseUrl") {
    super(message);
    this.name = "UnsafeBaseUrlError";
  }
}

/** 本地开发放行的 http 主机；其余 http 一律拒绝。 */
const LOCAL_HTTP_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * 仅允许 https，或本地开发的 http://127.0.0.1 / http://localhost。
 * 拒绝 URL 中携带用户名/密码，也拒绝指向私网 / 回环 / 云元数据 IP 的地址，
 * 避免把 API Key 发到内网。null / undefined 表示未设置（使用内置 provider 地址）。
 */
export function isSafeBaseUrl(value: string | null | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (value.trim() === "") return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.username || url.password) return false;

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (url.protocol === "http:") return LOCAL_HTTP_HOSTS.has(host);
  if (url.protocol !== "https:") return false;

  return !isPrivateIp(host);
}

export function assertSafeBaseUrl(value: string | null | undefined): void {
  if (!isSafeBaseUrl(value)) throw new UnsafeBaseUrlError();
}
