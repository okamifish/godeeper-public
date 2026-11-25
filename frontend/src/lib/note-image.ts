import { MAX_NOTE_IMAGE_BYTES, MAX_NOTE_IMAGE_HARD_BYTES, dataUrlByteSize } from "@/lib/note-pages";

export const NOTE_IMAGE_MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = 1400;

export interface CompressedNoteImage {
  dataUrl: string;
  width: number;
  height: number;
  fileName: string;
}

export class NoteImageError extends Error {
  constructor(message: "NOTE_IMAGE_UNSUPPORTED" | "NOTE_IMAGE_TOO_LARGE" | "NOTE_IMAGE_DECODE_FAILED" | "NOTE_IMAGE_COMPRESS_FAILED") {
    super(message);
    this.name = "NoteImageError";
  }
}

export function isNoteImageFile(file: File): boolean {
  return file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp";
}

export async function compressNoteImage(file: File): Promise<CompressedNoteImage> {
  if (!isNoteImageFile(file)) throw new NoteImageError("NOTE_IMAGE_UNSUPPORTED");
  if (file.size <= 0 || file.size > NOTE_IMAGE_MAX_INPUT_BYTES) throw new NoteImageError("NOTE_IMAGE_TOO_LARGE");

  const bitmap = await decode(file);
  try {
    const first = fit(bitmap.width, bitmap.height, MAX_EDGE);
    const attempts = [
      { quality: 0.72, edge: 1400 },
      { quality: 0.66, edge: 1200 },
      { quality: 0.6, edge: 1000 },
      { quality: 0.52, edge: 900 },
      { quality: 0.5, edge: 800 },
    ];

    for (const attempt of attempts) {
      const target = attempt.edge === MAX_EDGE ? first : fit(bitmap.width, bitmap.height, attempt.edge);
      const blob = await toBlob(target.width, target.height, bitmap, attempt.quality);
      const dataUrl = await blobToDataUrl(blob);
      const bytes = dataUrlByteSize(dataUrl);
      if (bytes <= MAX_NOTE_IMAGE_BYTES) {
        return { dataUrl, width: target.width, height: target.height, fileName: file.name };
      }
    }

    // 极端情况：再降一次到 700px，仍超过硬上限就拒绝，避免把画布快照撑爆
    const last = fit(bitmap.width, bitmap.height, 700);
    const blob = await toBlob(last.width, last.height, bitmap, 0.48);
    const dataUrl = await blobToDataUrl(blob);
    if (dataUrlByteSize(dataUrl) > MAX_NOTE_IMAGE_HARD_BYTES) {
      throw new NoteImageError("NOTE_IMAGE_TOO_LARGE");
    }
    return { dataUrl, width: last.width, height: last.height, fileName: file.name };
  } finally {
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const mime = header.match(/^data:([^;]+);base64/i)?.[1] ?? "image/jpeg";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // 某些浏览器不支持 options，退回普通图片解码
    }
  }
  try {
    const dataUrl = await blobToDataUrl(file);
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new NoteImageError("NOTE_IMAGE_DECODE_FAILED"));
      image.src = dataUrl;
    });
    return image;
  } catch (error) {
    if (error instanceof NoteImageError) throw error;
    throw new NoteImageError("NOTE_IMAGE_DECODE_FAILED");
  }
}

function fit(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function toBlob(
  width: number,
  height: number,
  source: ImageBitmap | HTMLImageElement,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new NoteImageError("NOTE_IMAGE_COMPRESS_FAILED");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new NoteImageError("NOTE_IMAGE_COMPRESS_FAILED");
  return blob;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new NoteImageError("NOTE_IMAGE_COMPRESS_FAILED"));
    reader.readAsDataURL(blob);
  });
}
