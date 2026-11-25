import type { Context } from "hono";
import { randomUUID } from "crypto";

/**
 * 统一错误出口：对外只给一句人话 + 请求编号；完整堆栈只写服务端日志。
 * 避免把 SQL / 连接串 / 内部路径泄露给调用方。
 */
export function errorHandler(err: Error, c: Context) {
  const requestId = randomUUID();
  console.error(`[${requestId}] Unhandled error:`, err);

  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "Internal server error";

  return c.json({ error: message, requestId }, 500);
}
