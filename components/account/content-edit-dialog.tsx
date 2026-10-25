"use client";

import * as React from "react";

import {
  GalleryUploader,
  type GalleryItem,
} from "@/components/account/gallery-uploader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/ui/rich-text-editor";
import { errorMessage, reportError } from "@/lib/errors";
import { mediaMarkdownFor } from "@/lib/richtext";
import { supabaseBrowser } from "@/lib/supabase";

/*
  Requesting an edit to something already published.

  This dialog never writes to the story or the post. It files a request, and the copy on it says so
  in as many words — an author who believes a correction has gone live when it is still waiting for
  a reviewer is the one failure this feature must not produce. A moderator or an admin approves it
  from the moderation desk, and only then does the reader see anything change.

  One component serves both a story and a Spotlight post because the flow is the same one: the
  current text, corrected. What differs is the table it lands in and which RPC is called.

  The editor and the uploader are the composer's own, so a correction is written with exactly the
  formatting tools the original was.
*/

export type EditTarget = {
  id: string;
  title: string;
  body: string;
  excerpt?: string | null;
  slug?: string | null;
};

export function ContentEditDialog({
  kind,
  open,
  onOpenChange,
  target,
  onSubmitted,
}: {
  kind: "article" | "spotlight";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current row, loaded whole: the editor has to start from the real text, not a summary. */
  target: EditTarget | null;
  onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [excerpt, setExcerpt] = React.useState("");
  const [body, setBody] = React.useState("");
  const [gallery, setGallery] = React.useState<GalleryItem[]>([]);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const editorRef = React.useRef<RichTextEditorHandle>(null);

  // Seeded from the stored row every time the dialog opens, and cleared when it closes, so a
  // previous correction can never be submitted against a different story.
  React.useEffect(() => {
    if (!open || !target) return;
    setTitle(target.title);
    setSlug(target.slug ?? "");
    setExcerpt(target.excerpt ?? "");
    setBody(target.body);
    setError("");
    setBusy(false);
    setGallery((current) => {
      for (const item of current) URL.revokeObjectURL(item.objectUrl);
      return [];
    });
  }, [open, target]);

  const galleryInputId = "write-gallery";

  /**
   * The toolbar's picture button: the uploader is the only source of images, because the site
   * serves only pictures this account uploaded. Scrolling it into view is friendlier than an
   * error, and the file input already carries the id the composer uses.
   */
  function revealUploader() {
    const input = document.getElementById(galleryInputId);
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus();
  }

  /** Placed where the caret is, so a picture lands between the paragraphs it illustrates. */
  function insertPicture(item: GalleryItem) {
    editorRef.current?.insertAtCaret(mediaMarkdownFor(item.id, item.name, kind));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    setError("");
    const nextTitle = title.trim();
    const nextBody = body.trim();
    if (!nextTitle) {
      setError("শিরোনাম আবশ্যক।");
      return;
    }
    if (kind === "article" && nextBody.length < 100) {
      setError("পূর্ণ প্রতিবেদন কমপক্ষে ১০০ অক্ষরের হতে হবে।");
      return;
    }
    if (kind === "spotlight" && nextBody.length < 10) {
      setError("বিবরণ কমপক্ষে ১০ অক্ষরের হতে হবে।");
      return;
    }
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const result =
        kind === "article"
          ? await supabase.rpc("submit_article_edit", {
              p_article_id: target.id,
              p_title: nextTitle,
              p_excerpt: excerpt.trim() || null,
              p_body: nextBody,
              p_slug: slug.trim().toLowerCase() || null,
            })
          : await supabase.rpc("submit_spotlight_edit", {
              p_post_id: target.id,
              p_title: nextTitle,
              p_description: nextBody,
            });
      if (result.error) {
        setError(
          errorMessage(
            "content edit request",
            result.error,
            "সম্পাদনার অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      toast({
        tone: "success",
        title: "সম্পাদনার অনুরোধ পাঠানো হয়েছে।",
        description:
          "মডারেটর অনুমোদন করলে সংশোধনটি প্রকাশিত পাতায় দেখা যাবে।",
      });
      onOpenChange(false);
      onSubmitted();
    } catch (err) {
      reportError("content edit request", err);
      setError(
        errorMessage(
          "content edit request",
          err,
          "সম্পাদনার অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {kind === "article" ? "প্রতিবেদন সংশোধনের অনুরোধ" : "পোস্ট সংশোধনের অনুরোধ"}
            </DialogTitle>
            <DialogDescription>
              সংশোধন এখনই প্রকাশিত হবে না। মডারেটর বা প্রশাসক অনুমোদন করলে নতুন
              সংস্করণটি পাঠকের কাছে যাবে।
            </DialogDescription>
          </DialogHeader>

          <Field label="শিরোনাম" htmlFor="edit-request-title">
            <Input
              id="edit-request-title"
              value={title}
              maxLength={180}
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          {kind === "article" && (
            <Field
              label="ঠিকানা (slug)"
              htmlFor="edit-request-slug"
              hint="প্রকাশিত ঠিকানা। বদলাতে চাইলে নতুনটি লিখুন; খালি রাখলে অপরিবর্তিত থাকবে।"
            >
              <Input
                id="edit-request-slug"
                value={slug}
                maxLength={96}
                onChange={(event) => setSlug(event.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
          )}

          {kind === "article" && (
            <Field
              label="সংক্ষিপ্ত পরিচিতি"
              htmlFor="edit-request-excerpt"
              hint="খালি রাখলে লেখা থেকে স্বয়ংক্রিয়ভাবে তৈরি হবে।"
            >
              <Textarea
                id="edit-request-excerpt"
                value={excerpt}
                rows={2}
                maxLength={280}
                onChange={(event) => setExcerpt(event.target.value)}
              />
            </Field>
          )}

          <Field
            label={kind === "article" ? "প্রতিবেদনের মূল লেখা" : "বিবরণ"}
            htmlFor="edit-request-body"
            hint="বিন্যাসসহ সংশোধিত লেখাটি এখানে দিন।"
          >
            <RichTextEditor
              id="edit-request-body"
              ref={editorRef}
              value={body}
              onChange={setBody}
              rows={12}
              scope={kind}
              onRequestImage={revealUploader}
            />
          </Field>

          <GalleryUploader
            items={gallery}
            onChange={setGallery}
            scope={kind}
            onInsert={insertPicture}
          />

          {error && <FormMessage>{error}</FormMessage>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              বাতিল
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? "পাঠানো হচ্ছে…" : "অনুমোদনের জন্য পাঠান →"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
