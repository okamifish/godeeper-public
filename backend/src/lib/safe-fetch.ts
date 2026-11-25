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

/** 内网 / 回环 / 云元数据地址一律拒绝 */
function isPrivateIp(ip: string) {
  const normalized = ip.trim().toLowerCase();
  if (normalized.startsWith("::1") || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
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
  if (isBlockedHost(parsed.hostname)) {
    throw new SafeFetchError("This host is not allowed");
  }
  return parsed;
}

async function assertNotPrivateHost(url: URL) {
  try {
    const results = await lookup(url.hostname, { all: true });
    if (results.some((entry) => isPrivateIp(entry.address))) {
      throw new SafeFetchError("This host is not allowed");
    }
  } catch (err) {
    if (err instanceof SafeFetchError) throw err;
    // DNS 解析失败交给 fetch 报错，避免不同运行时行为不一致
  }
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
      current = assertAllowedUrl(new URL(location, current).toString());
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
