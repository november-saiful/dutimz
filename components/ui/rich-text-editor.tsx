"use client";

import * as React from "react";
import {
  Bold,
  Code2,
  Eye,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  PencilLine,
  Quote,
  Table2,
  type LucideIcon,
} from "lucide-react";

import { AuthedMediaImage } from "@/components/article/authed-media-image";
import { Button } from "@/components/ui/button";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { reportError } from "@/lib/errors";
import type { MediaScope } from "@/lib/richtext";
import { cn } from "@/lib/utils";

/*
  The composer's text control.

  Its content is Markdown rather than a rich document, which is what lets a body keep its headings,
  bold, lists, links, quotes and tables through the same column, the same revision history and the
  same reader as plain text always used. The toolbar writes Markdown; typing works normally; the
  preview draws the result with the very renderer the published page uses, so what the writer
  checks is what the reader gets.

  The interesting part is paste. A browser hands over both `text/plain` and `text/html` when the
  clipboard came from a web page, Word or a spreadsheet. The HTML is converted to Markdown with
  Turndown, so a copied document arrives here with its structure intact instead of as one flat
  paragraph — the reason the whole feature exists.

  Both Turndown modules are imported the moment the first formatted paste happens, never at module
  scope: this component is also pre-rendered on the server, where Turndown's browser build has no
  DOM to parse with. Keeping it lazy also keeps it out of the initial bundle for everyone who only
  reads.
*/

export type RichTextEditorHandle = {
  /** Insert Markdown where the caret is — how a picture ends up between two paragraphs. */
  insertAtCaret: (text: string) => void;
  focus: () => void;
};

const TEXTAREA_CLASS =
  "flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const RichTextEditor = React.forwardRef<
  RichTextEditorHandle,
  {
    id?: string;
    name?: string;
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    minLength?: number;
    maxLength?: number;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    scope?: MediaScope;
    /** The toolbar's picture button: the parent scrolls its uploader into view. */
    onRequestImage?: () => void;
  }
>(function RichTextEditor(
  {
    id,
    name,
    value,
    onChange,
    rows = 12,
    minLength,
    maxLength,
    required,
    disabled,
    placeholder,
    className,
    scope = "article",
    onRequestImage,
  },
  ref,
) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = React.useState(false);

  /**
   * Replace a range and put the caret where the writer expects it.
   *
   * `setSelectionRange` has to wait a frame: this is a controlled textarea, so the DOM value is
   * React's to restore after the change, and setting a selection against the old value is what
   * makes a toolbar button feel like it swallowed the cursor.
   */
  const replaceRange = React.useCallback(
    (start: number, end: number, text: string, caret: number) => {
      onChange(value.slice(0, start) + text + value.slice(end));
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [onChange, value],
  );

  const insertAtCaret = React.useCallback(
    (text: string) => {
      const el = textareaRef.current;
      const start = el?.selectionStart ?? value.length;
      const end = el?.selectionEnd ?? value.length;
      const before = value.slice(0, start);
      const after = value.slice(end);
      // A block belongs on its own paragraph; give it one without stacking blank lines.
      const lead =
        before === "" || before.endsWith("\n\n")
          ? ""
          : before.endsWith("\n")
            ? "\n"
            : "\n\n";
      const tail =
        after === "" || after.startsWith("\n\n")
          ? "\n\n"
          : after.startsWith("\n")
            ? "\n"
            : "\n\n";
      replaceRange(start, end, `${lead}${text}${tail}`, start + lead.length + text.length);
    },
    [replaceRange, value],
  );

  React.useImperativeHandle(ref, () => ({
    insertAtCaret,
    focus: () => textareaRef.current?.focus(),
  }));

  /** Wrap the selection, or drop an empty pair at the caret. */
  function wrap(before: string, after = before) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = value.slice(start, end);
    replaceRange(
      start,
      end,
      `${before}${selected}${after}`,
      start + before.length + selected.length,
    );
  }

  /** Prefix every line the selection touches. */
  function prefixLines(prefix: string) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const blockStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = value.indexOf("\n", end);
    const blockEnd = nextBreak === -1 ? value.length : nextBreak;
    const lines = value.slice(blockStart, blockEnd).split("\n");
    const text = lines.map((line) => `${prefix}${line}`).join("\n");
    replaceRange(blockStart, blockEnd, text, blockStart + text.length);
  }

  /*
    Paste. `text/html` is the whole point: it is what a web page, a Word document and a spreadsheet
    put on the clipboard, and it carries the structure that would otherwise be lost. Plain-text
    pastes are left entirely to the browser.
  */
  async function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = event.clipboardData?.getData("text/html");
    if (!html) return;
    event.preventDefault();

    // Captured before the await: the selection must not be read after the event has been released.
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const plain = event.clipboardData?.getData("text/plain") ?? "";

    try {
      const [{ default: TurndownService }, { gfm }] = await Promise.all([
        import("turndown"),
        import("turndown-plugin-gfm"),
      ]);
      const service = new TurndownService({
        headingStyle: "atx",
        hr: "---",
        bulletListMarker: "-",
        codeBlockStyle: "fenced",
        emDelimiter: "*",
        strongDelimiter: "**",
      });
      service.use(gfm);
      // Pasted pictures are dropped rather than written into the text. The site serves only images
      // this account uploaded, so a foreign <img> would be a reference the reader can never see —
      // and the writer is told to upload it instead.
      service.remove([
        "script",
        "style",
        "img",
        "noscript",
        "iframe",
        "object",
        "embed",
      ]);

      const markdown = service
        .turndown(html)
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (!markdown) return;
      replaceRange(start, end, markdown, start + markdown.length);
    } catch (err) {
      reportError("rich text paste", err);
      // Falling back to the plain-text flavour is better than losing the paste entirely.
      if (plain) replaceRange(start, end, plain, start + plain.length);
    }
  }

  const tools: { label: string; icon: LucideIcon; run: () => void }[] = [
    { label: "শিরোনাম", icon: Heading2, run: () => prefixLines("## ") },
    { label: "গাঢ়", icon: Bold, run: () => wrap("**") },
    { label: "বাঁকা", icon: Italic, run: () => wrap("*") },
    { label: "বুলেট তালিকা", icon: List, run: () => prefixLines("- ") },
    { label: "ক্রমিক তালিকা", icon: ListOrdered, run: () => prefixLines("1. ") },
    { label: "উদ্ধৃতি", icon: Quote, run: () => prefixLines("> ") },
    { label: "সংযোগ", icon: Link2, run: () => wrap("[", "](https://)") },
    { label: "কোড", icon: Code2, run: () => wrap("`") },
    {
      label: "সারণি",
      icon: Table2,
      run: () =>
        insertAtCaret("| শিরোনাম | শিরোনাম |\n| --- | --- |\n|  |  |"),
    },
  ];

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div
        role="toolbar"
        aria-label="লেখার বিন্যাস"
        className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1"
      >
        {tools.map((tool) => (
          <Button
            key={tool.label}
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            title={tool.label}
            aria-label={tool.label}
            disabled={disabled || preview}
            onClick={tool.run}
          >
            <tool.icon className="size-4" />
          </Button>
        ))}
        {onRequestImage && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            title="ছবি যুক্ত করুন"
            aria-label="ছবি যুক্ত করুন"
            disabled={disabled || preview}
            onClick={onRequestImage}
          >
            <ImagePlus className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-8 gap-1.5"
          aria-pressed={preview}
          onClick={() => setPreview((current) => !current)}
        >
          {preview ? (
            <PencilLine className="size-3.5" aria-hidden />
          ) : (
            <Eye className="size-3.5" aria-hidden />
          )}
          {preview ? "লেখা" : "প্রিভিউ"}
        </Button>
      </div>

      {preview ? (
        /*
          The preview shows text that is not public yet, so its pictures are fetched with the
          writer's own token — the media host refuses an unpublished story's image to anyone else,
          and a plain `<img>` cannot send a token. Nothing written here is a reader's to see until
          it is approved.
        */
        <RichTextContent
          markdown={value}
          scope={scope}
          Image={AuthedMediaImage}
          className="article-body min-h-20 rounded-md border bg-background px-3 py-2 text-sm"
        />
      ) : (
        <textarea
          ref={textareaRef}
          id={id}
          name={name}
          value={value}
          rows={rows}
          minLength={minLength}
          maxLength={maxLength}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          onPaste={(event) => void onPaste(event)}
          onChange={(event) => onChange(event.target.value)}
          className={TEXTAREA_CLASS}
        />
      )}

      <p className="text-xs text-muted-foreground">
        লেখা Markdown হিসেবে সংরক্ষিত হয়। ওয়েবপাতা, Word বা স্প্রেডশিট থেকে সরাসরি
        পেস্ট করলে শিরোনাম, বোল্ড, তালিকা, সংযোগ ও সারণি তাদের বিন্যাস নিয়ে আসবে।
        ছবি paste করে নয় — নিচ থেকে আপলোড করে “লেখার মধ্যে বসান” চাপুন।
      </p>
    </div>
  );
});
