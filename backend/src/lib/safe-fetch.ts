import { lookup } from "node:dns/promises";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/i,
  /^169\.254\./,
  /metadata\.google\.internal/i,
  /^100\.100\.100\.200$/,
];

export class SafeFetchError extends Error {
  constructor(message: string, public readonly status: 400 | 413 = 400) {
    super(message);
    this.name = "SafeFetchError";
  }
}

function isBlockedHost(hostname: string) {
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

/** 解析点分十进制 IPv4；非法输入返回 null */
function parseIpv4(value: string): number[] | null {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

/** IPv4 内网 / 回环 / 链路本地 / 云元数据地址 */
function isPrivateIpv4(ip: string): boolean {
  const parts = parseIpv4(ip);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === 0) return true;                            // 0.0.0.0/8
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 127) return true;                          // 127.0.0.0/8 loopback
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16（含云元数据）
  return false;
}

/**
 * 内网 / 回环 / 云元数据地址一律拒绝。
 * 同时覆盖 IPv4-mapped IPv6（::ffff:a.b.c.d）、IPv4-compatible IPv6，
 * 以及 IPv6 的 unspecified / loopback / link-local / unique-local 段。
 */
export function isPrivateIp(ip: string): boolean {
  // URL 中的 IPv6 字面量带方括号，zone id 用 % 分隔，先规范化再判断
  const normalized = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];

  // ::ffff:169.254.169.254 与 ::127.0.0.1：取末 32 位交给 IPv4 判断
  const embeddedV4 = normalized.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embeddedV4) return isPrivateIpv4(embeddedV4[1]);

  if (normalized.includes(":")) {
    // IPv4-mapped IPv6 的十六进制写法，例如 ::ffff:7f00:1
    const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16);
      const lo = parseInt(mappedHex[2], 16);
      return isPrivateIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`);
    }
    if (normalized === "::") return true;                    // unspecified
    if (normalized === "::1") return true;                   // loopback
    if (/^fe[89ab][0-9a-f]{0,2}:/.test(normalized)) return true; // fe80::/10 link-local
    if (/^f[cd][0-9a-f]{0,2}:/.test(normalized)) return true;    // fc00::/7 unique-local
    return false;
  }

  return isPrivateIpv4(normalized);
}

function assertAllowedUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SafeFetchError("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SafeFetchError("Only http and https URLs are supported");
  }
  // 字面量 IP（含 ::ffff:169.254.169.254）直接拒绝，不必等到 DNS 解析
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHost(parsed.hostname) || isPrivateIp(host)) {
    throw new SafeFetchError("This host is not allowed");
  }
  return parsed;
}

async function assertNotPrivateHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateIp(host)) throw new SafeFetchError("This host is not allowed");
  try {
    const results = await lookup(host, { all: true });
    if (results.some((entry) => isPrivateIp(entry.address))) {
      throw new SafeFetchError("This host is not allowed");
    }
  } catch (err) {
    if (err instanceof SafeFetchError) throw err;
    // DNS 解析失败交给 fetch 报错，避免不同运行时行为不一致
  }
  // 残留风险：这里解析出的 IP 未固定到连接层，fetch 会再次解析 DNS，理论上仍有
  // DNS rebinding 窗口；彻底消除需要把 IP 绑定到 dispatcher/agent（需新增依赖）。
}

async function readBodyWithLimit(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
    throw new SafeFetchError("URL content is too large to import", 413);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BYTES) {
      await reader.cancel();
      throw new SafeFetchError("URL content is too large to import", 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

/**
 * 只允许公网 http/https 的抓取器：限制重定向次数、超时与响应体积，
 * 并在每一跳重新校验目标地址，避免被用作内网探测代理。
 */
export async function safeFetchText(rawUrl: string): Promise<{
  text: string;
  contentType: string;
  finalUrl: string;
}> {
  let current = assertAllowedUrl(rawUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    await assertNotPrivateHost(current);

    let response: Response;
    try {
      response = await fetch(current, {
        headers: {
          "User-Agent": "GoDeeper/0.1 (+https://godeeper.app)",
          Accept: "text/html, text/plain;q=0.9, application/xhtml+xml;q=0.8",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new SafeFetchError("Unable to reach this URL");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SafeFetchError("Invalid redirect");
      if (redirects === MAX_REDIRECTS) throw new SafeFetchError("Too many redirects");
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new SafeFetchError("Invalid redirect");
      }
      // 每一跳都重新做完整校验：字面量 IP、协议、主机、DNS 解析结果
      current = assertAllowedUrl(next.toString());
      continue;
    }

    if (!response.ok) {
      throw new SafeFetchError(`Failed to fetch URL: HTTP ${response.status}`);
    }

    return {
      text: await readBodyWithLimit(response),
      contentType: response.headers.get("content-type") ?? "",
      finalUrl: current.toString(),
    };
  }

  throw new SafeFetchError("Too many redirects");
}
