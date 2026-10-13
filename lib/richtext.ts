/*
  Inline media references — the one place that decides what they look like.

  An inline picture is ordinary Markdown, `![caption](/media/<uuid>)` in a story and
  `![caption](/spotlight/media/<uuid>)` in a Spotlight post, so it travels through the same body
  column, the same revision history and the same reader as everything else. Nothing needed a second
  content format.

  The path is relative on purpose. `react-markdown` runs every URL through its default
  `urlTransform`, which keeps relative URLs but drops unknown protocols — so a custom `media:`
  scheme would silently render as an empty `src`. A path is also readable by the database: the
  submit and edit functions extract these ids with one regexp, and that extraction is what turns a
  written reference into a real, permission-checked image the media host will serve.

  Only pictures this account uploaded can be referenced. The renderer resolves a media path for its
  own scope and drops every other image source, so a pasted third-party picture cannot pull a
  tracking pixel onto an article page.
*/

export type MediaScope = "article" | "spotlight";

export const ARTICLE_MEDIA_BASE = "/media";
export const SPOTLIGHT_MEDIA_BASE = "/spotlight/media";

/** Lowercase so the renderer, the editor and the SQL extraction agree on the accepted shape. */
const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID = new RegExp(`^${UUID_PATTERN}$`);

/** `![alt](src)` with an optional title. */
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

export function mediaBaseFor(scope: MediaScope): string {
  return scope === "spotlight" ? SPOTLIGHT_MEDIA_BASE : ARTICLE_MEDIA_BASE;
}

/** The path an editor writes into the body for a picture this account uploaded. */
export function mediaIdAt(
  src: unknown,
  scope: MediaScope = "article",
): string | null {
  if (typeof src !== "string") return null;
  const prefix = `${mediaBaseFor(scope)}/`;
  if (!src.startsWith(prefix)) return null;
  const id = src.slice(prefix.length).toLowerCase();
  return UUID.test(id) ? id : null;
}

/** The Markdown an editor inserts for a picture this account already uploaded. */
export function mediaMarkdownFor(
  id: string,
  alt: string,
  scope: MediaScope = "article",
): string {
  // Brackets would end the alt text early; a blank label still needs something to say.
  const label = alt.replace(/[[\]]/g, " ").trim() || "ছবি";
  return `![${label}](${mediaBaseFor(scope)}/${id})`;
}

/**
 * The media a stored body refers to, in reading order and without repeats.
 *
 * This is the client-side twin of the extraction the database performs on write. The surfaces that
 * have to know which pictures are already placed in the text — today the gallery strip, which must
 * not show them a second time — take their answer from here.
 */
export function inlineMediaIds(
  markdown: string | null | undefined,
  scope: MediaScope = "article",
): string[] {
  if (!markdown) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const match of markdown.matchAll(MARKDOWN_IMAGE)) {
    const id = mediaIdAt(match[1], scope);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
