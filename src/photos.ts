import type { PhotoKind, PhotoMeta, StoredPhoto } from "./types";

const MAX_EDGE = 1600;

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch { /* imgへフォールバック */ }
  }
  const url = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("画像を読み込めませんでした"));
    element.src = url;
  });
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function preparePhoto(file: File, date: string, kind: PhotoKind, mealId?: string): Promise<StoredPhoto> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("画像ファイルを選んでください");
  const source = await decode(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を変換できませんでした");
    context.drawImage(source.source, 0, 0, width, height);
    const webp = await canvasBlob(canvas, "image/webp", 0.8);
    const blob = webp?.type === "image/webp" ? webp : await canvasBlob(canvas, "image/jpeg", 0.82);
    if (!blob) throw new Error("画像を変換できませんでした");
    const createdAt = new Date().toISOString();
    const id = `${date}-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    return { id, date, kind, mealId, blob, width, height, byteSize: blob.size, mimeType: blob.type, createdAt };
  } finally {
    source.release();
  }
}

export function toMeta(photo: StoredPhoto): PhotoMeta {
  const { blob: _blob, date: _date, ...meta } = photo;
  return meta;
}
