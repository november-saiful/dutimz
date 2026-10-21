"use client";

import * as React from "react";
import {
  ArrowDownToLine,
  ArrowRightToLine,
  Bold,
  Code2,
  Eye,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  PencilLine,
  Quote,
  Redo2,
  Table2,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react";
import type { Editor, ChainedCommands } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { Image as BaseImage } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";

import { AuthedMediaImage } from "@/components/article/authed-media-image";
import { Button } from "@/components/ui/button";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { reportError } from "@/lib/errors";
import { mediaIdAt, type MediaScope } from "@/lib/richtext";
import { cn } from "@/lib/utils";

/*
  The composer's text control.

  Editing is visual now: a ProseMirror document (TipTap) the writer shapes with the toolbar and the
  keyboard, block by block, exactly as the published page will show it. What is *stored* is not
  changed by any of this — the Markdown extension serializes the document back into the same
  Markdown column the database regexp-scans for inline pictures, and the preview still draws it
  with the very renderer the published page uses. Markdown remains the file format; the editor is
  only a better window onto it.

  The interesting part is still paste. A browser hands over `text/html` when the clipboard came
  from a web page, Word or a spreadsheet, and TipTap parses that flavour through the schema, so a
  copied document arrives with its structure intact. The one rule the schema itself cannot make is
  which pictures are worth keeping: only references to media this account uploaded are real, so
  the paste HTML is stripped of script/style/iframe — and of every `<img>` that does not point
  into one of this site's own media paths — before the parser ever sees it.
*/

export type RichTextEditorHandle = {
  /** Insert Markdown at the caret — how a picture ends up between two paragraphs. */
  insertAtCaret: (text: string) => void;
  focus: () => void;
};

/* The src an inline picture must carry for a paste to keep it. */
const OWN_MEDIA_SRC = /^\/(media|spotlight\/media)\//i;

/** The minimum canvas height, from the `rows` the call sites already pass. */
function rowsToMinHeight(rows: number): string {
  return `${Math.max(rows, 3) * 1.62}rem`;
}

/** An inline picture drawn the way the reader will see it — through the token-carrying fetcher. */
function MediaNodeView({ node, scope }: ReactNodeViewProps & { scope: MediaScope }) {
  const id = mediaIdAt(node.attrs.src, scope);
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  if (!id) return null;
  return (
    <NodeViewWrapper as="figure" className="my-5">
      <AuthedMediaImage
        mediaId={id}
        alt={alt}
        scope={scope}
        className="h-auto w-full rounded-xl border object-cover"
      />
    </NodeViewWrapper>
  );
}

/*
  Paste sanitation. `text/html` is the flavour a web page, a Word document and a spreadsheet all
  put on the clipboard, and it is the reason a copied document keeps its structure. But a picture
  only travels through that markup legitimately when the source is this site itself — a writer who
  copies one paragraph of their own draft into another. Everything else is a reference the reader
  could never see, so it goes the way script, style and iframe markup go: removed before parsing.
*/
function sanitizeClipboardHtml(html: string): string {
  if (!/<[a-z]/i.test(html)) return html;
  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    for (const element of parsed.body.querySelectorAll(
      "script, style, iframe, object, embed, noscript",
    )) {
      element.remove();
    }
    for (const img of parsed.body.querySelectorAll("img")) {
      const src = img.getAttribute("src") ?? "";
      if (!OWN_MEDIA_SRC.test(src)) img.remove();
    }
    return parsed.body.innerHTML;
  } catch (err) {
    // Sanitization never holds a paste captive: hand the flavours back and let the schema's own
    // URL transform refuse whatever survives.
    reportError("paste sanitize", err);
    return html;
  }
}

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
    disabled,
    placeholder,
    className,
    scope = "article",
    onRequestImage,
  },
  ref,
) {
  const [preview, setPreview] = React.useState(false);

  /*
    The Markdown this editor last produced or accepted. Two-way binding turns on it: an echo of
    the writer's own `onChange` must never be bounced back into the document, while a value the
    parent genuinely sets — a seeded correction, a cleared form — replaces it outright.
  */
  const lastEmitted = React.useRef(value);
  // The editor's callbacks are captured once, when the instance is built; route `onChange` through
  // a ref so the closure never answers with a stale setter.
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = React.useMemo(
    () => [
      StarterKit,
      // The picture node round-trips as `![caption](/media/<uuid>)` — the same relative Markdown
      // the reader's renderer resolves and the database extracts on write.
      BaseImage.extend({
        addNodeView() {
          return ReactNodeViewRenderer((props) => (
            <MediaNodeView {...props} scope={scope} />
          ));
        },
      }),
      TableKit.configure({ table: { resizable: false } }),
      Markdown.configure({ markedOptions: { gfm: true } }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    [scope, placeholder],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      contentType: "markdown", // What arrives, and what leaves, is Markdown.
      extensions,
      content: value,
      editable: !disabled,
      editorProps: {
        attributes: {
          ...(id ? { id } : {}),
          class: "article-body outline-none",
        },
        transformPastedHTML: sanitizeClipboardHtml,
      },
      onUpdate: ({ editor: next }) => {
        lastEmitted.current = next.getMarkdown();
        onChangeRef.current(lastEmitted.current);
      },
    },
    [extensions],
  );

  React.useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value || "", {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, value]);

  React.useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  React.useImperativeHandle(
    ref,
    () => ({
      insertAtCaret: (text: string) => {
        if (!editor) return;
        editor
          .chain()
          .insertContentAt(
            {
              from: editor.state.selection.from,
              to: editor.state.selection.to,
            },
            text,
            { contentType: "markdown" },
          )
          .focus()
          .run();
      },
      focus: () => editor?.commands.focus(),
    }),
    [editor],
  );

  /*
    Toolbar state read off the real selection, so the buttons show which formats surround the
    caret — and undo/redo grey out instead of faking progress.
  */
  const state = useEditorState({
    editor,
    selector: ({ editor: active }) => {
      if (!active) return null;
      return {
        bold: active.isActive("bold"),
        italic: active.isActive("italic"),
        code: active.isActive("code"),
        quote: active.isActive("blockquote"),
        heading2: active.isActive("heading", { level: 2 }),
        heading3: active.isActive("heading", { level: 3 }),
        bulletList: active.isActive("bulletList"),
        orderedList: active.isActive("orderedList"),
        link: active.isActive("link"),
        inTable: active.can().addRowAfter(),
        canUndo: active.can().undo(),
        canRedo: active.can().redo(),
      };
    },
  });

  function run(fn: (chain: ChainedCommands) => boolean) {
    if (!editor) return;
    fn(editor.chain().focus());
  }

  /** The one format the toolbar cannot express by itself: a link address. */
  function toggleLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("সংযোগের ঠিকানা (https://…):", "https://");
    if (!url || !/^https?:\/\//i.test(url)) return;
    editor.chain().focus().setLink({ href: url }).run();
  }

  type Tool = {
    label: string;
    icon: LucideIcon;
    active?: boolean;
    run: () => void;
  };

  const tools: Tool[] = [
    {
      label: "শিরোনাম",
      icon: Heading2,
      active: state?.heading2,
      run: () => run((chain) => chain.toggleHeading({ level: 2 }).run()),
    },
    {
      label: "উপশিরোনাম",
      icon: Heading3,
      active: state?.heading3,
      run: () => run((chain) => chain.toggleHeading({ level: 3 }).run()),
    },
    {
      label: "গাঢ়",
      icon: Bold,
      active: state?.bold,
      run: () => run((chain) => chain.toggleBold().run()),
    },
    {
      label: "বাঁকা",
      icon: Italic,
      active: state?.italic,
      run: () => run((chain) => chain.toggleItalic().run()),
    },
    {
      label: "বুলেট তালিকা",
      icon: List,
      active: state?.bulletList,
      run: () => run((chain) => chain.toggleBulletList().run()),
    },
    {
      label: "ক্রমিক তালিকা",
      icon: ListOrdered,
      active: state?.orderedList,
      run: () => run((chain) => chain.toggleOrderedList().run()),
    },
    {
      label: "উদ্ধৃতি",
      icon: Quote,
      active: state?.quote,
      run: () => run((chain) => chain.toggleBlockquote().run()),
    },
    {
      label: state?.link ? "সংযোগ সরান" : "সংযোগ",
      icon: Link2,
      active: state?.link,
      run: toggleLink,
    },
    {
      label: "কোড",
      icon: Code2,
      active: state?.code,
      run: () => run((chain) => chain.toggleCode().run()),
    },
  ];

  /* Reached only from inside a table, where the caret can name the row and column. */
  const tableTools: Tool[] = [
    {
      label: "পাশে কলাম যোগ",
      icon: ArrowRightToLine,
      run: () => run((chain) => chain.addColumnAfter().run()),
    },
    {
      label: "নিচে সারি যোগ",
      icon: ArrowDownToLine,
      run: () => run((chain) => chain.addRowAfter().run()),
    },
    {
      label: "কলাম মুছুন",
      icon: Minus,
      run: () => run((chain) => chain.deleteColumn().run()),
    },
    {
      label: "সারি মুছুন",
      icon: Trash2,
      run: () => run((chain) => chain.deleteRow().run()),
    },
    {
      label: "সারণি মুছুন",
      icon: Table2,
      run: () => run((chain) => chain.deleteTable().run()),
    },
  ];

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div
        role="toolbar"
        aria-label="লেখার বিন্যাস"
        className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          title="পূর্বের অবস্থা"
          aria-label="পূর্বের অবস্থা"
          disabled={disabled || preview || !state?.canUndo}
          onClick={() => run((chain) => chain.undo().run())}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          title="পরের অবস্থা"
          aria-label="পরের অবস্থা"
          disabled={disabled || preview || !state?.canRedo}
          onClick={() => run((chain) => chain.redo().run())}
        >
          <Redo2 className="size-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {tools.map((tool) => (
          <Button
            key={tool.label}
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-8", tool.active && "text-primary")}
            title={tool.label}
            aria-label={tool.label}
            aria-pressed={tool.active}
            disabled={disabled || preview}
            onClick={tool.run}
          >
            <tool.icon className="size-4" />
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          title="সারণি যোগ করুন"
          aria-label="সারণি যোগ করুন"
          disabled={disabled || preview}
          onClick={() =>
            run((chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())
          }
        >
          <Table2 className="size-4" />
        </Button>
        {onRequestImage && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            title="ছবি যোগ করুন"
            aria-label="ছবি যোগ করুন"
            disabled={disabled || preview}
            onClick={onRequestImage}
          >
            <ImagePlus className="size-4" />
          </Button>
        )}
        {state?.inTable && (
          <span className="flex flex-wrap items-center gap-1 border-l pl-1.5">
            {tableTools.map((tool) => (
              <Button
                key={tool.label}
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                title={tool.label}
                aria-label={tool.label}
                disabled={disabled || preview}
                onClick={tool.run}
              >
                <tool.icon className="size-3.5" />
              </Button>
            ))}
          </span>
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

      {/* The editor stays mounted while the writer checks the preview — switching views costs the
          document nothing but a display toggle, and the caret survives the trip back. */}
      <div
        className={cn(
          "min-w-0 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          preview && "hidden",
        )}
        style={{ minHeight: rowsToMinHeight(rows) }}
      >
        <EditorContent editor={editor} />
      </div>

      {preview && (
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
      )}

      {/* The submit path reads the field by name; the visual editor still supplies the value. */}
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <p className="text-xs text-muted-foreground">
        লেখা Markdown হিসেবে সংরক্ষিত হয়। Enter নতুন অনুচ্ছেদ, Shift+Enter লাইন ব্রেক।
        ওয়েবপাতা, Word বা স্প্রেডশিট থেকে সরাসরি পেস্ট করলে শিরোনাম, বোল্ড, তালিকা,
        সংযোগ ও সারণি তাদের বিন্যাস নিয়ে আসবে। ছবি paste করে নয় — নিচ থেকে আপলোড করে
        “লেখার মধ্যে বসান” চাপুন।
      </p>
    </div>
  );
});
