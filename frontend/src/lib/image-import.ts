const IMAGE_MIME = /^image\/(png|jpeg|jpg|webp|gif|avif)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;

export const IMAGE_MAX_EDGE = 1280;

export function isImageFile(file: File): boolean {
  return IMAGE_MIME.test(file.type) || IMAGE_EXT.test(file.name);
}

/** 等比缩放到最长边不超过 maxEdge；小图不放大 */
export function fitImageSize(width: number, height: number, maxEdge = IMAGE_MAX_EDGE) {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image decode failed"));
    image.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("image read failed"));
    reader.readAsDataURL(file);
  });
}

export interface ImportedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** 读取图片并压缩到最长边 1280px，避免画布快照被原图撑爆 */
export async function readImageFile(file: File, maxEdge = IMAGE_MAX_EDGE): Promise<ImportedImage> {
  // GIF 动图不走 canvas，避免丢失动画
  if (file.type === "image/gif") {
    return { dataUrl: await readAsDataUrl(file), width: 0, height: 0 };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const fitted = fitImageSize(naturalWidth, naturalHeight, maxEdge);

    if (!fitted.width || !fitted.height) {
      return { dataUrl: await readAsDataUrl(file), width: naturalWidth, height: naturalHeight };
    }

    const canvas = document.createElement("canvas");
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return { dataUrl: await readAsDataUrl(file), width: naturalWidth, height: naturalHeight };
    }

    context.drawImage(image, 0, 0, fitted.width, fitted.height);
    const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    return {
      dataUrl: canvas.toDataURL(mime, 0.86),
      width: fitted.width,
      height: fitted.height,
    };
  } catch {
    return { dataUrl: await readAsDataUrl(file), width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
