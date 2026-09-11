/**
 * Thumbnail upload pipeline (spec section 4.4 + Appendix B):
 *   1. client-side validation (mime + size),
 *   2. canvas downscale to 1600px max edge, WebP re-encode @ 0.82,
 *   3. Supabase Storage upload to `thumbnails/{contentId}/{ts}.webp`,
 *   4. public URL returned for `contents.thumbnail_url`.
 *
 * When Supabase is unconfigured (mock mode) the compressed data URL is
 * returned instead so the whole editor flow stays testable locally.
 */

export const THUMBNAIL_RULES = {
  bucket: "thumbnails",
  maxInputBytes: 8 * 1024 * 1024, // 8 MB hard input limit
  maxEdge: 1600,
  quality: 0.82,
  outputMime: "image/webp",
  accept: ["image/jpeg", "image/png", "image/webp", "image/gif"],
} as const;

export class ThumbnailUploadError extends Error {
  constructor(
    public readonly code:
      | "invalid_type"
      | "too_large"
      | "compress_failed"
      | "upload_failed",
    message: string,
  ) {
    super(message);
    this.name = "ThumbnailUploadError";
  }
}

export function validateImageFile(file: File): void {
  if (!(THUMBNAIL_RULES.accept as readonly string[]).includes(file.type)) {
    throw new ThumbnailUploadError(
      "invalid_type",
      `Unsupported file type: ${file.type || "unknown"}. Use JPEG, PNG, WebP or GIF.`,
    );
  }
  if (file.size > THUMBNAIL_RULES.maxInputBytes) {
    throw new ThumbnailUploadError(
      "too_large",
      `Image exceeds ${Math.round(THUMBNAIL_RULES.maxInputBytes / 1024 / 1024)} MB limit.`,
    );
  }
}

/** Read a File into an HTMLImageElement (with object URL cleanup). */
export async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = objectUrl;
    });
    return img;
  } finally {
    // Keep URL until decode completes; revoke async after load handlers ran.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}

/**
 * Downscale + re-encode to WebP on a canvas. GIFs keep animation only if the
 * browser preserves it (they do not through canvas — acceptable for thumbs).
 */
export async function compressImage(
  file: File,
  options: Partial<Pick<typeof THUMBNAIL_RULES, "maxEdge" | "quality">> = {},
): Promise<Blob> {
  const { maxEdge, quality } = { ...THUMBNAIL_RULES, ...options };
  const img = await loadImage(file);

  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ThumbnailUploadError("compress_failed", "Canvas 2D unavailable.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, THUMBNAIL_RULES.outputMime, quality),
  );
  if (!blob) throw new ThumbnailUploadError("compress_failed", "WebP encoding failed.");
  return blob;
}

export function buildThumbnailPath(contentId: string): string {
  const stamp = Date.now().toString(36);
  return `${contentId}/${stamp}.webp`;
}

export interface UploadResult {
  url: string;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Full pipeline: validate → compress → upload. Falls back to a data URL in
 * mock mode (no Supabase env) so the editor works without credentials.
 */
export async function uploadThumbnail(
  file: File,
  contentId: string,
): Promise<UploadResult> {
  validateImageFile(file);

  const hasSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let blob: Blob;
  try {
    blob = await compressImage(file);
  } catch (err) {
    if (err instanceof ThumbnailUploadError) throw err;
    throw new ThumbnailUploadError("compress_failed", "Could not process image.");
  }

  const url = hasSupabase
    ? await uploadToSupabase(blob, contentId)
    : await blobToDataUrl(blob);

  const img = await blobToImage(blob);
  return {
    url,
    bytes: blob.size,
    width: img.naturalWidth,
    height: img.naturalHeight,
  };
}

async function uploadToSupabase(blob: Blob, contentId: string): Promise<string> {
  const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
  const supabase = createSupabaseBrowserClient();
  const path = buildThumbnailPath(contentId);

  const { error } = await supabase.storage
    .from(THUMBNAIL_RULES.bucket)
    .upload(path, blob, {
      contentType: THUMBNAIL_RULES.outputMime,
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) {
    throw new ThumbnailUploadError("upload_failed", error.message);
  }

  const { data } = supabase.storage
    .from(THUMBNAIL_RULES.bucket)
    .getPublicUrl(path);
  return data.publicUrl;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = objectUrl;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}
