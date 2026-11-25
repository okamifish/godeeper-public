import type { NoteBlock, NoteOcrStatus, NotePage } from "@/lib/types";

export const MAX_NOTE_PAGES = 8;
/** 单页压缩后的目标上限；超过就继续降质量/降尺寸 */
export const MAX_NOTE_IMAGE_BYTES = 900 * 1024;
/** 节点数据硬上限，防止异常文件把画布快照撑爆 */
export const MAX_NOTE_IMAGE_HARD_BYTES = 1_200 * 1024;

export interface CreateNotePageInput {
  id?: string;
  imageDataUrl: string;
  fileName?: string;
  width: number;
  height: number;
  ocrMarkdown?: string;
  editedMarkdown?: string;
  blocks?: NoteBlock[];
  status?: NoteOcrStatus;
  error?: string;
}

export function createNotePage(input: CreateNotePageInput): NotePage {
  return {
    id: input.id ?? createNotePageId(),
    imageDataUrl: input.imageDataUrl,
    fileName: input.fileName?.slice(0, 120),
    width: numberOrZero(input.width),
    height: numberOrZero(input.height),
    ocrMarkdown: input.ocrMarkdown ?? "",
    editedMarkdown: input.editedMarkdown,
    blocks: normalizeNoteBlocks(input.blocks),
    status: isOcrStatus(input.status) ? input.status : "idle",
    error: input.error,
  };
}

export function createNotePageId(): string {
  return `note-page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clampNotePageIndex(index: number | undefined, count: number): number {
  if (count <= 0) return 0;
  const value = Number.isFinite(index) ? Math.floor(index as number) : 0;
  return Math.min(Math.max(value, 0), count - 1);
}

export function appendNotePage(pages: NotePage[], page: NotePage): NotePage[] {
  if (pages.length >= MAX_NOTE_PAGES) return pages;
  return [...pages, page];
}

export function updateNotePage(
  pages: NotePage[],
  pageId: string,
  patch: Partial<NotePage>,
): NotePage[] {
  return pages.map((page) => (page.id === pageId ? { ...page, ...patch } : page));
}

export function removeNotePage(
  pages: NotePage[],
  pageId: string,
  activeIndex: number,
): { pages: NotePage[]; activePage: number } {
  const next = pages.filter((page) => page.id !== pageId);
  return {
    pages: next,
    activePage: clampNotePageIndex(activeIndex, next.length),
  };
}

/** 用户修正优先；没有修正时回退原始识别结果 */
export function notePageMarkdown(page: NotePage | undefined): string {
  if (!page) return "";
  const edited = page.editedMarkdown?.trim();
  if (edited) return edited;
  return page.ocrMarkdown.trim();
}

export function notePageLabel(index: number, total: number): string {
  return `${index + 1} / ${Math.max(total, 1)}`;
}

/** 把多页 Markdown 汇总成节点 body，供画布搜索/导出摘要使用；不用于渲染 */
export function notePagesToBody(pages: NotePage[]): string {
  return pages
    .map((page) => notePageMarkdown(page).trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

export function dataUrlByteSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const payload = dataUrl.slice(comma + 1);
  if (!payload) return 0;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

export function normalizeNoteBlocks(value: unknown): NoteBlock[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const blocks = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const bbox = Array.isArray(item.bbox) ? item.bbox.map(Number) : [];
      return {
        idx: Number.isFinite(Number(item.idx)) ? Number(item.idx) : 0,
        type: typeof item.type === "string" ? item.type : "Text",
        bbox: [
          bbox[0] ?? 0,
          bbox[1] ?? 0,
          bbox[2] ?? 0,
          bbox[3] ?? 0,
        ] as [number, number, number, number],
        content: typeof item.content === "string" ? item.content : "",
        format: typeof item.format === "string" ? item.format : undefined,
      };
    })
    .filter((block) => block.content.length > 0);
  return blocks.length > 0 ? blocks : undefined;
}

/** 导入/旧数据归一化：只接受 data:image，最多 8 页，非法项静默跳过 */
export function normalizeNotePages(value: unknown): NotePage[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const pages: NotePage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const imageDataUrl = typeof raw.imageDataUrl === "string" ? raw.imageDataUrl : "";
    if (!/^data:image\/(png|jpeg|webp);base64,/i.test(imageDataUrl)) continue;
    pages.push(
      createNotePage({
        id: typeof raw.id === "string" && raw.id ? raw.id : undefined,
        imageDataUrl,
        fileName: typeof raw.fileName === "string" ? raw.fileName : undefined,
        width: Number(raw.width),
        height: Number(raw.height),
        ocrMarkdown: typeof raw.ocrMarkdown === "string" ? raw.ocrMarkdown : "",
        editedMarkdown: typeof raw.editedMarkdown === "string" ? raw.editedMarkdown : undefined,
        blocks: normalizeNoteBlocks(raw.blocks),
        status: isOcrStatus(raw.status) ? raw.status : "idle",
        error: typeof raw.error === "string" ? raw.error : undefined,
      }),
    );
    if (pages.length >= MAX_NOTE_PAGES) break;
  }
  return pages.length > 0 ? pages : undefined;
}

function isOcrStatus(value: unknown): value is NoteOcrStatus {
  return value === "idle" || value === "running" || value === "done" || value === "error";
}

function numberOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
