"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  execEditorCommand,
  getEditorHtml,
  insertLink,
  tagSelectionLanguage,
  type EditorCommand,
} from "@/lib/content/editor";
import { useLocaleStore } from "@/stores/locale";

/**
 * Phase 3 rich text editor with first-class Bangla support:
 *  - contentEditable + document.execCommand → zero deps, works with the
 *    Avro/Probhat IMEs and Bengali complex-script shaping untouched;
 *  - per-selection language tagging (`lang="bn" dir="auto"` /
 *    `lang="en" dir="ltr"`) for mixed-script copy;
 *  - Bangla numeral word/character counter in the status bar;
 *  - output normalized to the sanitize whitelist (no inline styles, safe
 *    links) so what you edit is exactly what the article page renders.
 */

interface Props {
  /** Initial HTML body (Bangla or English lane). */
  value: string;
  onChange: (html: string) => void;
  /** Field label shown above the toolbar. */
  label: string;
  /** Primary content language of this lane. */
  lang: "bn" | "en";
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
}

const TOOLBAR_GROUPS: { command: EditorCommand; labelBn: string; labelEn: string }[] = [
  { command: "formatBlock:p", labelBn: "সাধারণ", labelEn: "Body" },
  { command: "formatBlock:h2", labelBn: "শিরোনাম ১", labelEn: "Heading 1" },
  { command: "formatBlock:h3", labelBn: "শিরোনাম ২", labelEn: "Heading 2" },
  { command: "formatBlock:blockquote", labelBn: "উদ্ধৃতি", labelEn: "Quote" },
];

const INLINE: { command: EditorCommand; label: string; icon: string }[] = [
  { command: "bold", label: "Bold", icon: "B" },
  { command: "italic", label: "Italic", icon: "I" },
  { command: "underline", label: "Underline", icon: "U" },
  { command: "strikeThrough", label: "Strikethrough", icon: "S" },
];

const BANGLA_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
function bnCount(n: number): string {
  return String(n).replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)] ?? d);
}

export function RichTextEditor({
  value,
  onChange,
  label,
  lang,
  placeholder,
  minHeight = 280,
  disabled = false,
}: Props) {
  const uiLocale = useLocaleStore((s) => s.locale);
  const editableRef = useRef<HTMLDivElement>(null);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [linkPrompt, setLinkPrompt] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);

  // Initialize editable content once (uncontrolled editable + onChange sync).
  useEffect(() => {
    if (editableRef.current && editableRef.current.innerHTML === "") {
      editableRef.current.innerHTML = value ?? "";
      recount(editableRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Allow parent resets (e.g. revision restore) to push new HTML down.
  useEffect(() => {
    const el = editableRef.current;
    if (el && value !== getEditorHtml(el) && document.activeElement !== el) {
      el.innerHTML = value ?? "";
      recount(el);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyVersion]);

  const recount = useCallback((el: HTMLElement) => {
    const text = (el.innerText ?? "").trim();
    setCharCount(text.length);
    setWordCount(text ? text.split(/\s+/).filter(Boolean).length : 0);
  }, []);

  const emitChange = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    recount(el);
    onChange(getEditorHtml(el));
  }, [onChange, recount]);

  function run(command: EditorCommand) {
    const ok = execEditorCommand(editableRef.current, command);
    if (ok) emitChange();
  }

  function openLinkPrompt() {
    const selection = window.getSelection();
    setLinkUrl(selection && !selection.isCollapsed ? "" : "");
    setLinkPrompt("");
  }

  function applyLink() {
    const normalized = insertLink(editableRef.current, linkPrompt ?? linkUrl);
    if (normalized) emitChange();
    setLinkPrompt(null);
    setLinkUrl("");
  }

  function applyLanguage(target: "bn" | "en") {
    tagSelectionLanguage(editableRef.current, target);
    emitChange();
  }

  const toolbarBtn =
    "rounded-lg px-2.5 py-1.5 text-sm font-semibold leading-none transition hover:bg-black/10 disabled:opacity-40 dark:hover:bg-white/10";

  return (
    <div className="flex flex-col gap-1.5" data-testid="rich-text-editor" data-lang={lang}>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-bold opacity-70">{label}</label>
        <span className="text-xs opacity-50">
          {uiLocale === "bn"
            ? `${bnCount(wordCount)} শব্দ · ${bnCount(charCount)} অক্ষর`
            : `${wordCount} words · ${charCount} chars`}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white/70 dark:border-neutral-700 dark:bg-black/40">
        {/* Toolbar */}
        <div
          className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-black/[0.03] px-2 py-1.5 dark:border-neutral-700"
          role="toolbar"
          aria-label={label}
        >
          {TOOLBAR_GROUPS.map((group) => {
            const command = group.command;
            return (
              <button
                key={command}
                type="button"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(command)}
                className={toolbarBtn}
                title={uiLocale === "bn" ? group.labelBn : group.labelEn}
              >
                {uiLocale === "bn" ? group.labelBn : group.labelEn}
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/20" aria-hidden="true" />
          {INLINE.map((item) => (
            <button
              key={item.command}
              type="button"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(item.command)}
              className={`${toolbarBtn} ${item.command === "italic" ? "italic" : ""} ${
                item.command === "strikeThrough" ? "line-through" : ""
              }`}
              title={item.label}
              aria-label={item.label}
            >
              {item.icon}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/20" aria-hidden="true" />
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openLinkPrompt}
            className={toolbarBtn}
            title="Link"
            aria-label="Insert link"
          >
            🔗
          </button>
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run("unlink")}
            className={toolbarBtn}
            title="Unlink"
            aria-label="Remove link"
          >
            ⛓️‍💥
          </button>
          <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/20" aria-hidden="true" />
          {/* Bangla/English script tagging for mixed-language selections. */}
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyLanguage("bn")}
            className={toolbarBtn}
            title="বাংলা হিসেবে চিহ্নিত করুন (lang=bn, dir=auto)"
          >
            বাং
          </button>
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyLanguage("en")}
            className={toolbarBtn}
            title="Tag selection as English (lang=en, dir=ltr)"
          >
            EN
          </button>
          <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/20" aria-hidden="true" />
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              document.execCommand("undo");
              setHistoryVersion((v) => v + 1);
              emitChange();
            }}
            className={toolbarBtn}
            title="Undo"
            aria-label="Undo"
          >
            ↩
          </button>
          <button
            type="button"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              document.execCommand("redo");
              setHistoryVersion((v) => v + 1);
              emitChange();
            }}
            className={toolbarBtn}
            title="Redo"
            aria-label="Redo"
          >
            ↪
          </button>
        </div>

        {/* Link prompt */}
        {linkPrompt !== null && (
          <div className="flex items-center gap-2 border-b border-neutral-200 bg-black/[0.03] px-3 py-2 dark:border-neutral-700">
            <input
              type="url"
              autoFocus
              value={linkPrompt}
              onChange={(e) => setLinkPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === "Escape") setLinkPrompt(null);
              }}
              placeholder="https://example.com"
              dir="ltr"
              className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-900"
              aria-label="Link URL"
            />
            <button
              type="button"
              onClick={applyLink}
              className="rounded-full px-3 py-1 text-xs font-bold text-white"
              style={{ background: "var(--md-sys-color-primary)" }}
            >
              {uiLocale === "bn" ? "প্রয়োগ" : "Apply"}
            </button>
            <button
              type="button"
              onClick={() => setLinkPrompt(null)}
              className="rounded-full px-3 py-1 text-xs font-bold hover:bg-black/5 dark:hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        )}

        {/* Editable surface */}
        <div
          ref={editableRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          lang={lang}
          dir={lang === "bn" ? "auto" : "ltr"}
          spellCheck={lang === "en"}
          onInput={emitChange}
          onBlur={emitChange}
          onPaste={(e) => {
            // Paste as plain text to keep output inside the whitelist.
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
            emitChange();
          }}
          data-placeholder={placeholder}
          className="editor-surface prose-bn w-full overflow-auto px-4 py-3 text-[1.05rem] leading-[1.8] outline-none"
          style={{ minHeight }}
        />
      </div>

      <p className="text-xs opacity-40">
        {uiLocale === "bn"
          ? "টুলবার থেকে নির্বাচিত অংশে 'বাং' / 'EN' চেপে ভাষা ট্যাগ করুন; পেস্ট সবসময় প্লেইন টেক্সট হয়।"
          : "Select text and use the বাং / EN buttons to tag script; paste is always plain text."}
      </p>
    </div>
  );
}
