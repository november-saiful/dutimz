import { slugify } from "@/lib/utils/format";

/**
 * Generate a preview slug from English and/or Bangla titles.
 * Shared between the content editor (client) and buildSlug (server).
 *
 * Priority: English title > Bangla transliteration > date fallback.
 * Returns a non-empty string even for empty input.
 */
export function previewSlug(
  titleEn: string | null | undefined,
  titleBn: string | null | undefined,
): string {
  const fromEnglish = titleEn?.trim() ? slugify(titleEn) : "";
  if (fromEnglish.length >= 3) return fromEnglish;

  // slugify drops non-latin scripts; keep Bangla letters, vowel
  // signs and other combining marks (\p{M}) so slugs stay readable.
  const fromBangla = (titleBn ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{M}\p{N}-]+/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  if (fromBangla.length >= 3) return fromBangla;

  return `story-${Date.now().toString(36)}`;
}
