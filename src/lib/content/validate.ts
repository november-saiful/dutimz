import { stripHtml } from "@/lib/utils/format";
import { previewSlug } from "@/lib/utils/slugPreview";
import type { ContentFormat, ContentType } from "@/types";

/**
 * Phase 3 content validation (spec section 4.1: title ≥ 5 chars, body ≥ 100
 * chars for publish). Enforced client-side for UX and again server-side
 * before every transition.
 */

export interface ContentDraftInput {
  title_bn: string;
  body_bn: string | null;
  title_en?: string | null;
  body_en?: string | null;
  content_type: ContentType;
  content_format: ContentFormat;
  thumbnail_url?: string | null;
  video_url?: string | null;
}

export type ValidationIssue = {
  field: "title_bn" | "body_bn" | "thumbnail" | "video" | "title_en" | "body_en";
  message_bn: string;
  message_en: string;
};

const MIN_TITLE = 5;
const MIN_BODY_CHARS = 100;
const MIN_BODY_WORDS = 20;

/** Body length in characters, HTML stripped. */
export function bodyTextLength(body: string | null | undefined): number {
  return body ? stripHtml(body).length : 0;
}

export function bodyWordCount(body: string | null | undefined): number {
  if (!body) return 0;
  return stripHtml(body).trim().split(/\s+/).filter(Boolean).length;
}

/** Validate a draft for saving (lenient) — only blocking issues reported. */
export function validateDraft(
  input: ContentDraftInput,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (input.title_bn.trim().length < MIN_TITLE) {
    issues.push({
      field: "title_bn",
      message_bn: `বাংলা শিরোনাম কমপক্ষে ${MIN_TITLE} অক্ষরের হতে হবে।`,
      message_en: `Bangla title must be at least ${MIN_TITLE} characters.`,
    });
  }
  if (input.content_format === "video" && !input.video_url && !input.thumbnail_url) {
    issues.push({
      field: "video",
      message_bn: "ভিডিও নিউজে ভিডিও লিংক বা থাম্বনেইল দরকার।",
      message_en: "Video news needs a video link or a thumbnail.",
    });
  }
  return issues;
}

/** Validate for publishing (strict): spec minimums for title + body. */
export function validateForPublish(
  input: ContentDraftInput,
): ValidationIssue[] {
  const issues = validateDraft(input);

  if (bodyTextLength(input.body_bn) < MIN_BODY_CHARS) {
    issues.push({
      field: "body_bn",
      message_bn: `প্রকাশের জন্য মূল লেখা কমপক্ষে ${MIN_BODY_CHARS} অক্ষরের হতে হবে।`,
      message_en: `Body text must be at least ${MIN_BODY_CHARS} characters to publish.`,
    });
  } else if (bodyWordCount(input.body_bn) < MIN_BODY_WORDS) {
    issues.push({
      field: "body_bn",
      message_bn: `প্রকাশের জন্য মূল লেখায় কমপক্ষে ${MIN_BODY_WORDS} শব্দ দরকার।`,
      message_en: `Body text needs at least ${MIN_BODY_WORDS} words to publish.`,
    });
  }

  if (!input.thumbnail_url) {
    issues.push({
      field: "thumbnail",
      message_bn: "প্রকাশের আগে একটি থাম্বনেইল ছবি দিতে হবে।",
      message_en: "A thumbnail image is required before publishing.",
    });
  }

  return issues;
}

/** Has the story passed the strict bar (used to gate Publish/Approve UI)? */
export function isPublishable(input: ContentDraftInput): boolean {
  return validateForPublish(input).length === 0;
}

/**
 * SEO slug from the English title, falling back to a transliterated Bangla
 * title. Delegates to the shared previewSlug utility.
 */
export function buildSlug(
  titleEn: string | null | undefined,
  titleBn: string | null | undefined,
): string {
  return previewSlug(titleEn, titleBn);
}
