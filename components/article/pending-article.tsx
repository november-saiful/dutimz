"use client";

import * as React from "react";

import { AuthedMediaImage } from "@/components/article/authed-media-image";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { reportError } from "@/lib/errors";
import { inlineMediaIds } from "@/lib/richtext";
import { formatDateBn } from "@/lib/site";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase";

type PendingRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  status: string;
  hero_media_key: string | null;
  published_at: string | null;
  created_at: string;
  category_slug: string | null;
  category_title: string | null;
  media: { media_id: string; position: number }[] | null;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "খসড়া",
  pending: "অনুমোদনের অপেক্ষায়",
  rejected: "প্রত্যাখ্যাত",
  published: "প্রকাশিত",
};

/**
 * The gated view of a story that is not published yet. `get_my_article_by_slug` returns a row only
 * to the story's author or the desk, so this component decides on the database's answer alone: a
 * row means the reader may review it, no row means they may not.
 */
export function PendingArticle({ slug }: { slug: string }) {
  const [state, setState] = React.useState<"loading" | "denied" | "ready">(
    "loading",
  );
  const [article, setArticle] = React.useState<PendingRow | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured()) {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const { data, error } = await supabaseBrowser().rpc(
          "get_my_article_by_slug",
          { p_slug: slug },
        );
        if (error) {
          reportError("pending article", error);
          if (!cancelled) setState("denied");
          return;
        }
        const row = (Array.isArray(data) ? data[0] : data) as
          | PendingRow
          | undefined;
        if (cancelled) return;
        if (row?.id) {
          setArticle(row);
          setState("ready");
        } else {
          setState("denied");
        }
      } catch (err) {
        reportError("pending article", err);
        if (!cancelled) setState("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state === "loading") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  if (state === "denied" || !article) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>এই প্রতিবেদনটি এখনো প্রকাশিত হয়নি</CardTitle>
          <CardDescription>
            এটি পর্যালোচনার অপেক্ষায় আছে, অথবা আপনার এটি দেখার অনুমতি নেই। লেখক
            ও সম্পাদকীয় ডেস্ক প্রবেশ করে এখানে খসড়াটি দেখতে পারেন।
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // A picture placed in the text is drawn by the body itself; the strip below must not repeat it,
  // or the writer would be shown a page the reader will never see.
  const inlineMedia = inlineMediaIds(article.body, "article");
  const gallery = (article.media ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter(
      (item) =>
        item.media_id !== article.hero_media_key &&
        !inlineMedia.includes(item.media_id),
    );
  const statusLabel = STATUS_LABELS[article.status] ?? article.status;
  const dateValue = article.published_at ?? article.created_at;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={article.status === "rejected" ? "destructive" : "secondary"}
            >
              {statusLabel}
            </Badge>
            <span className="text-xs text-muted-foreground">
              শুধু আপনি ও সম্পাদকীয় ডেস্ক এই পাতাটি দেখতে পাচ্ছেন।
            </span>
          </div>
          <CardTitle className="text-2xl leading-snug sm:text-3xl sm:leading-tight">
            {article.title}
          </CardTitle>
          {article.excerpt && (
            <CardDescription className="text-base">
              {article.excerpt}
            </CardDescription>
          )}
          <p className="text-xs text-muted-foreground">
            {article.category_title ? `${article.category_title} · ` : ""}
            {formatDateBn(dateValue)}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {article.hero_media_key && (
            <AuthedMediaImage
              mediaId={article.hero_media_key}
              alt=""
              className="h-auto w-full rounded-lg border object-cover"
            />
          )}
          <div className="article-body text-[17px] leading-8">
            {/* Not published yet, so its pictures need the reader's own token. */}
            <RichTextContent markdown={article.body} Image={AuthedMediaImage} />
          </div>
        </CardContent>
      </Card>

      {gallery.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>ছবির গ্যালারি</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {gallery.map((item) => (
                <AuthedMediaImage
                  key={item.media_id}
                  mediaId={item.media_id}
                  alt=""
                  className="h-auto w-full rounded-lg border object-cover"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
