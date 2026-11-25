import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import type { Variables } from "../types";
import {
  OcrInvalidResponseError,
  OcrNotConfiguredError,
  OcrRequestError,
  OcrTimeoutError,
  parseImageWithOxr,
} from "../services/ocr.service";

const ocrRoute = new Hono<{ Variables: Variables }>();

ocrRoute.use("/*", authMiddleware);

ocrRoute.post("/parse", async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "No image received", code: "OCR_BAD_REQUEST" }, 400);
  }

  const rawFile = form.get("file");
  if (!rawFile || typeof rawFile === "string" || typeof (rawFile as Blob).arrayBuffer !== "function") {
    return c.json({ error: "No image received", code: "OCR_BAD_REQUEST" }, 400);
  }

  const file = rawFile as File;
  if (!isAllowedImage(file)) {
    return c.json({ error: "Only PNG, JPEG and WEBP images are supported", code: "OCR_UNSUPPORTED_FILE" }, 400);
  }

  try {
    const page = await parseImageWithOxr(file);
    return c.json({ page });
  } catch (error) {
    if (error instanceof OcrNotConfiguredError) {
      return c.json({
        error: "OCR 服务未配置。请让部署者设置 OXR_BASE_URL 后再试。",
        code: "OCR_NOT_CONFIGURED",
      }, 503);
    }
    if (error instanceof OcrTimeoutError) {
      return c.json({
        error: "识别超时。图片可能太大或服务繁忙，请重试。",
        code: "OCR_TIMEOUT",
      }, 504);
    }
    if (error instanceof OcrInvalidResponseError) {
      return c.json({
        error: "OCR 服务返回了无法解析的结果。",
        code: "OCR_INVALID_RESPONSE",
      }, 502);
    }
    const code = error instanceof OcrRequestError ? error.message : "OCR_FAILED";
    if (code === "OCR_UNSUPPORTED_FILE") {
      return c.json({ error: "Only PNG, JPEG and WEBP images are supported", code }, 400);
    }
    if (code === "OCR_FILE_TOO_LARGE") {
      return c.json({ error: "Image is too large. Please use a file under 12MB.", code }, 413);
    }
    if (code === "OCR_EMPTY_FILE") {
      return c.json({ error: "Image is empty", code }, 400);
    }
    return c.json({
      error: error instanceof Error ? error.message : "识别失败，请稍后重试。",
      code: "OCR_FAILED",
    }, 502);
  }
});

function isAllowedImage(file: File): boolean {
  const type = (file.type ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();
  const typeAllowed = type === "image/png" || type === "image/jpeg" || type === "image/webp";
  const nameAllowed = /\.(png|jpe?g|webp)$/i.test(name);
  if (!typeAllowed && !nameAllowed) return false;
  if ((file.size ?? 0) <= 0 || (file.size ?? 0) > 12 * 1024 * 1024) return false;
  return true;
}

export default ocrRoute;
