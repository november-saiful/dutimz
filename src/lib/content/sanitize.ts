/**
 * Server-side sanitization of editor-produced HTML (spec section 4.3, and the
 * Phase 3 TODO in NewsDetailBody). Uses `sanitize-html`, which runs anywhere
 * the app does: Node server, Cloudflare Pages edge runtime, and Workers —
 * no jsdom/native DOM required (isomorphic-dompurify breaks when bundled
 * for the edge).
 */
import sanitizeHtml from "sanitize-html";

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "hr",
    "h2",
    "h3",
    "h4",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "blockquote",
    "ul",
    "ol",
    "li",
    "a",
    "figure",
    "figcaption",
    "img",
    "span", // language/direction tagging wrapper (lang/dir attributes)
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading"],
    // lang/dir survive on every element for Bangla/English script tagging.
    "*": ["lang", "dir"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  // Rendered article links open in a new tab, safely.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer",
    }),
  },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
};

/**
 * Sanitize editor HTML: strips scripts, event handlers, style attributes and
 * any tag outside the newsroom whitelist. Safe to render with
 * dangerouslySetInnerHTML on the public detail pages.
 */
export function sanitizeArticleHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, OPTIONS);
}

/** True when the sanitized output dropped content the editor had written. */
export function wasSanitized(html: string): boolean {
  return sanitizeArticleHtml(html) !== html;
}
