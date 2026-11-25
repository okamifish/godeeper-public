import type { Context } from "hono";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

export function invalidId(c: Context, name = "id") {
  return c.json({ error: `Invalid ${name} format` }, 400);
}

export function badRequest(c: Context, message: string) {
  return c.json({ error: message }, 400);
}

export type JsonReadResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };

/**
 * 读取 JSON 请求体并限制体积。
 * 用于没有走 zValidator 的快照接口：拒绝 null、数组、超大体与非法 JSON。
 */
export async function readJsonBody(c: Context, maxBytes = 5 * 1024 * 1024): Promise<JsonReadResult> {
  const declaredLength = Number(c.req.header("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, status: 413, error: "Request body is too large" };
  }

  let raw: string;
  try {
    raw = await c.req.text();
  } catch {
    return { ok: false, status: 400, error: "Unable to read request body" };
  }

  if (raw.length > maxBytes) {
    return { ok: false, status: 413, error: "Request body is too large" };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}
