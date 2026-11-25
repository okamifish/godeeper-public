export interface OcrBlock {
  idx: number;
  type: string;
  bbox: [number, number, number, number];
  content: string;
  format?: string;
}

export interface OcrPageResult {
  pageIndex: number;
  markdown: string;
  blocks: OcrBlock[];
  width: number;
  height: number;
}

export class OcrNotConfiguredError extends Error {
  constructor() {
    super("OCR_NOT_CONFIGURED");
    this.name = "OcrNotConfiguredError";
  }
}

export class OcrTimeoutError extends Error {
  constructor() {
    super("OCR_TIMEOUT");
    this.name = "OcrTimeoutError";
  }
}

export class OcrInvalidResponseError extends Error {
  constructor(message = "OCR_INVALID_RESPONSE") {
    super(message);
    this.name = "OcrInvalidResponseError";
  }
}

export class OcrRequestError extends Error {
  constructor(message = "OCR_FAILED") {
    super(message);
    this.name = "OcrRequestError";
  }
}

interface OcrFileLike {
  name?: string;
  type?: string;
  size?: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** OXR 的表格默认输出 HTML；前端用 GFM 渲染，因此请求 Markdown 表格并关闭远程图片外链。 */
const ELEMENT_FORMATS = JSON.stringify({
  image: "none",
  formula: "latex",
  table: "markdown",
  cs: "smiles",
});

export function normalizeOxrPayload(payload: unknown, pageIndex = 0): OcrPageResult {
  if (!payload || typeof payload !== "object") {
    throw new OcrInvalidResponseError("OCR response is not an object");
  }
  const root = payload as Record<string, unknown>;
  if (root.code !== undefined && root.code !== 0) {
    throw new OcrRequestError(typeof root.message === "string" ? root.message : "OCR task failed");
  }

  const data = asRecord(root.data);
  const result = asRecord(data?.result);
  const outputs = asRecord(result?.outputs);
  if (!outputs) {
    throw new OcrInvalidResponseError("OCR response is missing outputs");
  }

  const json = asRecord(outputs.json);
  const rawPages = Array.isArray(json?.pages) ? json.pages : [];
  const page = asRecord(rawPages[pageIndex]) ?? asRecord(rawPages[0]);
  const blocks = normalizeBlocks(page?.blocks);
  const pageSize = asRecord(page?.page_size);

  const markdown = typeof outputs.markdown === "string" ? outputs.markdown : "";
  const fallbackMarkdown = blocks.map((block) => block.content).filter(Boolean).join("\n\n");
  if (!markdown && !fallbackMarkdown) {
    throw new OcrInvalidResponseError("OCR response contains no readable text");
  }

  return {
    pageIndex,
    markdown: markdown || fallbackMarkdown,
    blocks,
    width: numberOrZero(pageSize?.w),
    height: numberOrZero(pageSize?.h),
  };
}

export async function parseImageWithOxr(
  file: OcrFileLike,
  options: { baseUrl?: string; apiKey?: string; timeoutMs?: number } = {},
): Promise<OcrPageResult> {
  const baseUrl = (options.baseUrl ?? process.env.OXR_BASE_URL ?? "").trim();
  if (!baseUrl) throw new OcrNotConfiguredError();

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectImageMime(bytes) ?? (file.type ?? "").toLowerCase();
  if (!ALLOWED_TYPES.has(mime)) {
    throw new OcrRequestError("OCR_UNSUPPORTED_FILE");
  }
  if (bytes.byteLength <= 0) throw new OcrRequestError("OCR_EMPTY_FILE");
  if (bytes.byteLength > MAX_FILE_BYTES) throw new OcrRequestError("OCR_FILE_TOO_LARGE");

  const endpoint = `${baseUrl.replace(/\/+$/, "")}/parse/sync`;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? Number(process.env.OXR_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), file.name ?? "note-image");
    form.append("api_key", (options.apiKey ?? process.env.OXR_API_KEY ?? "dummy").trim() || "dummy");
    form.append("output_formats", "markdown");
    form.append("output_formats", "json");
    form.append("element_formats", ELEMENT_FORMATS);

    const response = await fetch(endpoint, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OcrRequestError(`OCR service returned HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    return normalizeOxrPayload(payload);
  } catch (error) {
    if (error instanceof OcrNotConfiguredError || error instanceof OcrInvalidResponseError || error instanceof OcrRequestError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OcrTimeoutError();
    }
    throw new OcrRequestError(error instanceof Error ? error.message : "OCR_REQUEST_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

function detectImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function normalizeBlocks(value: unknown): OcrBlock[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const bbox = Array.isArray(item.bbox) ? item.bbox.map(Number) : [];
      return {
        idx: numberOrZero(item.idx),
        type: typeof item.type === "string" ? item.type : "Text",
        bbox: [bbox[0] ?? 0, bbox[1] ?? 0, bbox[2] ?? 0, bbox[3] ?? 0] as [number, number, number, number],
        content: typeof item.content === "string" ? item.content : "",
        format: typeof item.format === "string" ? item.format : undefined,
      };
    })
    .filter((block) => block.content.length > 0);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
