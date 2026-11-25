import type { Context } from "hono";
import { stream } from "hono/streaming";

export function streamSSE(c: Context, onEvent: (send: (data: string) => void) => Promise<void>) {
  return stream(c, async (stream) => {
    stream.onAbort(() => {});
    await onEvent(async (data: string) => {
      await stream.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  });
}
