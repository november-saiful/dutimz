/**
 * Request schemas for the public (unauthenticated) endpoints: every write, plus
 * the search query string.
 *
 * These are the trust boundary: nothing reaches a table or an RPC until it has
 * passed through one of these objects. They reproduce the ad-hoc checks the
 * routes used to inline — and tighten the fields those checks missed (a
 * whitespace-only comment body, an unbounded `parentId`, an oversized
 * `authorName`) — while normalising as they go: ids and text are trimmed, and
 * the newsletter address is lower-cased so `Foo@Bar.com` and `foo@bar.com`
 * cannot become two rows.
 *
 * Kept in one module (rather than exported from each `route.ts`) because a
 * route file may only export handlers — and because the row of bounds is
 * easier to audit in one place.
 */
import { z } from "zod";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/constants/app";

/** Max characters of a comment body; enforced here and in the data layer. */
export const COMMENT_MAX_LENGTH = 4000;

/** Max characters of a display name (mock mode only — Supabase uses profiles). */
export const AUTHOR_NAME_MAX_LENGTH = 80;

/**
 * Ids are UUIDs in Supabase mode but opaque slugs in mock mode, so they are
 * bounded by length rather than shape.
 */
const idField = z
  .string({ error: "A non-empty id is required" })
  .trim()
  .min(1, "A non-empty id is required")
  .max(128);

// ── Comments ────────────────────────────────────────────────────────

export const createCommentSchema = z.object({
  contentId: idField,
  parentId: z.union([idField, z.null()]).optional(),
  authorName: z
    .string()
    .trim()
    .max(AUTHOR_NAME_MAX_LENGTH)
    .nullish(),
  body: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(COMMENT_MAX_LENGTH, `Comment must be ${COMMENT_MAX_LENGTH} characters or fewer`),
});

export const commentReactionSchema = z.object({
  commentId: idField,
  reaction: z.enum(["like", "dislike"]),
});

// ── Bookmarks ───────────────────────────────────────────────────────

export const bookmarkSchema = z.object({ contentId: idField });

// ── Newsletter ──────────────────────────────────────────────────────

export const newsletterSubscribeSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "A valid email is required" }).max(254)),
  locale: z.enum(LOCALES).optional(),
});

/** Locale to persist, defaulting to the site default. */
export function newsletterLocale(input: { locale?: "bn" | "en" }): string {
  return input.locale ?? DEFAULT_LOCALE;
}

// ── Polls ───────────────────────────────────────────────────────────

export const pollVoteSchema = z.object({
  pollId: idField,
  optionId: idField,
});

// ── Image upload (multipart) ────────────────────────────────────────

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

export const DEFAULT_UPLOAD_FOLDER = "thumbnails";

/** Storage-key prefix: no traversal, no spaces, no control characters. */
const FOLDER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/;

const WRONG_TYPE_MESSAGE =
  "Unsupported file type. Allowed: JPEG, PNG, WebP, AVIF, GIF";
const TOO_LARGE_MESSAGE = "File too large. Maximum size: 10MB";

/**
 * Duck-typed to spot a `File`, deliberately not `z.file()`: that checks
 * `instanceof File`, and the `File` constructor `request.formData()` hands back
 * is not always the global one (the edge runtime builds its own), so the check
 * rejects perfectly valid uploads with "No file provided". The only other
 * thing a form-data part can be is a string, and `name`/`type`/`size` tell the
 * two apart without relying on a shared realm.
 */
const fileField = z
  .custom<File>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as File).name === "string" &&
      typeof (value as Blob).type === "string" &&
      typeof (value as Blob).size === "number",
    { error: "No file provided" },
  )
  .superRefine((file, ctx) => {
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      ctx.addIssue({ code: "custom", message: WRONG_TYPE_MESSAGE });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      // `too_big` so the helper answers 413 rather than 400.
      ctx.addIssue({
        code: "too_big",
        origin: "file",
        maximum: MAX_UPLOAD_BYTES,
        inclusive: true,
        message: TOO_LARGE_MESSAGE,
      });
    }
  });

/**
 * The multipart form as parsed by `request.formData()`. `folder` is optional
 * (`formData.get` yields `null` when absent) and blank values fall back to the
 * default prefix rather than becoming a key at the bucket root.
 */
export const imageUploadSchema = z
  .object({
    file: fileField,
    folder: z
      .string()
      .trim()
      .max(64)
      .regex(FOLDER_PATTERN, "folder may only contain letters, numbers, /, _ and -")
      .nullish(),
  })
  .transform((form) => ({
    file: form.file,
    folder: form.folder || DEFAULT_UPLOAD_FOLDER,
  }));

// ── Search (query string) ───────────────────────────────────────────

export const MAX_SEARCH_LIMIT = 20;
export const DEFAULT_SEARCH_LIMIT = 8;

/**
 * `?q=&limit=&type=&category=` — the query params the search route accepts.
 *
 * `limit` is clamped rather than rejected (a bad limit should not fail a
 * search) and falls back to the default when it is not a number.
 */
export const searchQuerySchema = z.object({
  q: z
    .string({ error: "Query must be at least 2 characters" })
    .trim()
    .min(2, "Query must be at least 2 characters"),
  limit: z.coerce
    .number()
    .int()
    .catch(DEFAULT_SEARCH_LIMIT)
    .transform((value) => Math.min(Math.max(value, 1), MAX_SEARCH_LIMIT)),
  // `?type=` (present but empty) is treated as absent, as it always was.
  type: z.string().trim().max(64).nullish().transform((value) => value || null),
  category: z.string().trim().max(64).nullish().transform((value) => value || null),
});

