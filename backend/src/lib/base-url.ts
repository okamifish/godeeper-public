import { lookup } from "node:dns/promises";
import { isPrivateIp } from "./safe-fetch";

/** BYOK baseUrl 校验失败时抛出；保存接口与真正发请求前使用同一套规则。 */
export class UnsafeBaseUrlError extends Error {
  constructor(message = "Invalid baseUrl") {
    super(message);
    this.name = "UnsafeBaseUrlError";
  }
}

/** 本地回环主机：仅允许在非生产环境使用，且只允许 http。 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/** 任何环境下都必须拒绝的主机名（云元数据 / unspecified / IPv6 回环）。 */
const ALWAYS_BLOCKED_HOSTNAMES = [
  /^0\.0\.0\.0$/,
  /^::1$/,
  /metadata\.google\.internal/i,
  /^100\.100\.100\.200$/,
];

const isProduction = () => process.env.NODE_ENV === "production";

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
}

function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host) || /^127\./.test(host);
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

/**
 * 同步基础校验：仅允许 https，或非生产环境下的 http://127.0.0.1 / localhost。
 * 拒绝 URL 中的用户名/密码、私网 / 回环 / 云元数据字面量 IP 与已知主机名。
 * 该函数用于保存接口的 zod refine；真正发请求前还必须调用异步的
 * assertSafeBaseUrl 做 DNS 解析，防止域名指向内网。
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

  const host = normalizeHost(url.hostname);
  if (ALWAYS_BLOCKED_HOSTNAMES.some((pattern) => pattern.test(host))) return false;
  // 回环地址仅在非生产环境放行，且只允许 http（生产环境必须走公网 https）
  if (isLocalHost(host)) return !isProduction() && url.protocol === "http:";
  // 字面量 IP（含 IPv4-mapped IPv6）直接拒绝，避免把 API Key 发到内网
  if (isPrivateIp(host)) return false;

  if (url.protocol === "http:") return false;
  return url.protocol === "https:";
}

/**
 * 请求发出前的完整校验：先做同步检查，再把域名解析成 IP 并逐一检查。
 * AI SDK 使用全局 fetch，不经过 safeFetchText，所以必须在这里解析一次。
 * 解析失败按拒绝处理（fail closed），避免把 Key 发往未知目标。
 *
 * 残留风险：解析出的 IP 未固定到连接层，fetch 仍会再次 DNS 解析，理论上
 * 存在 rebinding 窗口；彻底消除需要将 IP 绑定到 dispatcher（需新增依赖）。
 */
export async function assertSafeBaseUrl(value: string | null | undefined): Promise<void> {
  if (!isSafeBaseUrl(value)) throw new UnsafeBaseUrlError();
  if (value === undefined || value === null) return;

  const host = normalizeHost(new URL(value).hostname);
  // 已通过同步检查的回环地址与公网字面量 IP 不需要再解析
  if (isLocalHost(host) || isIpLiteral(host)) return;

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UnsafeBaseUrlError("Unable to resolve baseUrl host");
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new UnsafeBaseUrlError("baseUrl resolves to a private address");
  }
}
