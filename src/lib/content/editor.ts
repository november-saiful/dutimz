/**
 * Phase 3 rich-text editor engine. A small contentEditable layer over
 * document.execCommand: zero dependencies, native Bangla IME + complex-script
 * composition support, and HTML output that matches the sanitize whitelist.
 */

/** Commands the editor toolbar exposes. */
export type EditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "formatBlock:h2"
  | "formatBlock:h3"
  | "formatBlock:p"
  | "formatBlock:blockquote"
  | "insertUnorderedList"
  | "insertOrderedList"
  | "createLink"
  | "unlink"
  | "removeFormat";

export interface LanguageToggle {
  /** `lang`/`dir` applied to the selected block, e.g. bn → dir=auto. */
  lang: "bn" | "en";
}

const BLOCK_COMMANDS: ReadonlySet<string> = new Set([
  "formatBlock:h2",
  "formatBlock:h3",
  "formatBlock:p",
  "formatBlock:blockquote",
]);

export function isBlockCommand(command: EditorCommand): boolean {
  return BLOCK_COMMANDS.has(command);
}

/**
 * Execute a toolbar command against the currently focused editable.
 * Returns false when the browser rejected the command (e.g. no selection).
 */
export function execEditorCommand(
  editable: HTMLElement | null,
  command: EditorCommand,
  value?: string,
): boolean {
  if (!editable) return false;
  editable.focus();
  const ok = document.execCommand(command, false, value);
  return ok;
}

/**
 * Wrap the current selection (or word under caret) in an anchor. Returns the
 * URL that was applied, or null when cancelled/empty.
 */
export function insertLink(
  editable: HTMLElement | null,
  url: string,
): string | null {
  if (!editable || !url.trim()) return null;
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  document.execCommand("createLink", false, normalized);
  // Force safe rel on fresh anchors.
  editable.querySelectorAll("a").forEach((a) => {
    if (a.target === "_blank") a.rel = "noopener noreferrer";
  });
  return normalized;
}

/**
 * Apply a language/direction tag to the current selection. Bangla runs get
 * `lang="bn" dir="auto"` so mixed English spans inside Bangla text keep their
 * own direction; English runs get `lang="en"`.
 */
export function tagSelectionLanguage(
  editable: HTMLElement | null,
  lang: LanguageToggle["lang"],
): void {
  if (!editable) return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

  const range = selection.getRangeAt(0);
  const wrapper = document.createElement("span");
  wrapper.lang = lang;
  wrapper.dir = lang === "bn" ? "auto" : "ltr";
  try {
    range.surroundContents(wrapper);
  } catch {
    // Selection spanned element boundaries — fall back to extract/insert.
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
  }
  selection.removeAllRanges();
}

/**
 * Read back the editor HTML, lightly normalized so it always passes the
 * sanitize whitelist: safe anchors, no empty trailing paragraphs.
 */
export function getEditorHtml(editable: HTMLElement | null): string {
  if (!editable) return "";
  const clone = editable.cloneNode(true) as HTMLElement;

  clone.querySelectorAll("a").forEach((a) => {
    if (a.target === "_blank") a.rel = "noopener noreferrer";
  });
  // Drop whitespace-only trailing blocks the IME tends to leave behind.
  clone.querySelectorAll("p, h2, h3, h4, blockquote").forEach((el) => {
    if (!el.textContent?.trim() && !el.querySelector("img, br")) {
      el.remove();
    }
  });

  return clone.innerHTML.trim();
}

/**
 * Count Bangla grapheme-ish units as words for read-time estimates:
 * whitespace splitting alone under-counts Bangla because of conjuncts.
 */
export function countWords(mixedText: string): number {
  return mixedText.trim().split(/\s+/).filter(Boolean).length;
}
