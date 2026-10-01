"use client";

import * as React from "react";

import { Trash2 } from "lucide-react";

import { SignInButton } from "@/components/auth/sign-in-button";
import {
  GalleryUploader,
  type GalleryItem,
} from "@/components/account/gallery-uploader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGrid,
  FieldSection,
  FormMessage,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, reportError } from "@/lib/errors";
import { spotlightMediaUrlFor, relativeTimeBn } from "@/lib/site";
import { isSupabaseConfigured, one, supabaseBrowser } from "@/lib/supabase";

type SpotlightMediaRow = { position: number; media_id: string };

type SpotlightAuthor = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type SpotlightPost = {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  author: SpotlightAuthor | SpotlightAuthor[] | null;
  spotlight_post_media: SpotlightMediaRow[] | null;
};

const POST_SELECT =
  "id,title,description,status,created_at,author:profiles!spotlight_posts_author_id_fkey(id,username,display_name,avatar_url),spotlight_post_media(position,media_id)";

/** One screenful at a time; "আরও দেখুন" appends the next page. */
const PAGE_SIZE = 15;

export function SpotlightForum() {
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [posts, setPosts] = React.useState<SpotlightPost[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [gallery, setGallery] = React.useState<GalleryItem[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState("");
  const [feedError, setFeedError] = React.useState("");
  const [confirming, setConfirming] = React.useState<SpotlightPost | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState("");

  // One page of the feed, newest first. The row-level security policy decides
  // which rows exist for this caller, so paging never has to filter status here.
  const fetchPage = React.useCallback(async (offset: number) => {
    const { data, error: loadError } = await supabaseBrowser()
      .from("spotlight_posts")
      .select(POST_SELECT)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (loadError) throw loadError;
    return (data as unknown as SpotlightPost[]) ?? [];
  }, []);

  const loadPosts = React.useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    try {
      const rows = await fetchPage(0);
      setFeedError("");
      setPosts(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      reportError("spotlight feed", err);
      setFeedError("স্পটলাইট পোস্ট লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  async function loadMore() {
    setLoadingMore(true);
    setFeedError("");
    try {
      const rows = await fetchPage(posts.length);
      // De-duplicate: a post added between pages shifts the window by one, so an
      // id already on screen must not be appended twice.
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...rows.filter((post) => !seen.has(post.id))];
      });
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      reportError("spotlight feed", err);
      setFeedError("স্পটলাইট পোস্ট লোড করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setLoadingMore(false);
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured()) {
        if (!cancelled) {
          setSignedIn(false);
          setLoading(false);
        }
        return;
      }
      try {
        const supabase = supabaseBrowser();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) reportError("spotlight session", authError);
        if (!cancelled) {
          setSignedIn(Boolean(user));
          setUserId(user?.id ?? null);
        }
      } catch (err) {
        reportError("spotlight session", err);
        if (!cancelled) setSignedIn(false);
      }
    })();
    void loadPosts();
    return () => {
      cancelled = true;
    };
  }, [loadPosts]);

  async function deletePost() {
    if (!confirming) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const { error: deleteFailure } = await supabaseBrowser().rpc(
        "delete_my_spotlight_post",
        { p_post_id: confirming.id },
      );
      if (deleteFailure) {
        setDeleteError(
          errorMessage(
            "spotlight delete",
            deleteFailure,
            "পোস্ট মুছে ফেলা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      setConfirming(null);
      await loadPosts();
    } catch (err) {
      setDeleteError(errorMessage("spotlight delete", err, "পোস্ট মুছে ফেলা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle || !trimmedDescription) {
      setError("শিরোনাম ও বিবরণ আবশ্যক।");
      return;
    }
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const mediaIds = gallery.map((item) => item.id);
      const { error: submitError } = await supabase.rpc("submit_spotlight_post", {
        p_title: trimmedTitle,
        p_description: trimmedDescription,
        p_media_ids: mediaIds.length ? mediaIds : null,
      });
      if (submitError) {
        setError(
          errorMessage(
            "spotlight submission",
            submitError,
            "পোস্ট পাঠানো যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      for (const item of gallery) URL.revokeObjectURL(item.objectUrl);
      setGallery([]);
      setTitle("");
      setDescription("");
      setDone("আপনার পোস্ট প্রকাশিত হয়েছে।");
      await loadPosts();
    } catch (err) {
      setError(errorMessage("spotlight submission", err, "পোস্ট পাঠানো যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {signedIn === false && (
        <Card>
          <CardHeader>
            <CardTitle>পোস্ট করতে প্রবেশ করুন</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">
              স্পটলাইটে যেকোনো ইস্যু নিয়ে পোস্ট করতে গুগল দিয়ে প্রবেশ করুন।
            </p>
            <SignInButton />
          </CardContent>
        </Card>
      )}

      {signedIn && (
        <form onSubmit={submit}>
          <Card>
            <CardHeader>
              <CardTitle>নতুন পোস্ট</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FieldSection title="পোস্ট" description="শিরোনাম, বিবরণ ও চাইলে ছবি।">
                <FieldGrid>
                  <Field label="শিরোনাম" htmlFor="spotlight-title" wide>
                    <Input
                      id="spotlight-title"
                      value={title}
                      maxLength={180}
                      required
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="ইস্যুটি সংক্ষেপে লিখুন"
                    />
                  </Field>
                  <Field label="বিবরণ" htmlFor="spotlight-description" wide>
                    <Textarea
                      id="spotlight-description"
                      value={description}
                      rows={6}
                      maxLength={5000}
                      required
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="বিস্তারিত লিখুন…"
                    />
                  </Field>
                </FieldGrid>
              </FieldSection>
              <GalleryUploader items={gallery} onChange={setGallery} scope="spotlight" />
              {error && <FormMessage>{error}</FormMessage>}
              {done && <FormMessage tone="success">{done}</FormMessage>}
              <Button type="submit" disabled={busy} className="self-start">
                {busy ? "পাঠানো হচ্ছে…" : "পোস্ট করুন →"}
              </Button>
            </CardContent>
          </Card>
        </form>
      )}

      <section aria-labelledby="spotlight-feed-heading" className="flex flex-col gap-4">
        <h2 id="spotlight-feed-heading" className="text-xl font-semibold">
          সাম্প্রতিক পোস্ট
        </h2>
        {loading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        )}
        {feedError && <FormMessage>{feedError}</FormMessage>}
        {!loading && !feedError && posts.length === 0 && (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            এখনো কোনো পোস্ট নেই। প্রথম পোস্টটি আপনিই করুন।
          </div>
        )}
        {posts.map((post) => {
          const author = one(post.author);
          const photos = (post.spotlight_post_media ?? [])
            .slice()
            .sort((a, b) => a.position - b.position);
          const name =
            author?.display_name?.trim() ||
            (author?.username ? `@${author.username}` : "সদস্য");
          return (
            <Card key={post.id}>
              <CardHeader className="gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      {author?.avatar_url && (
                        <AvatarImage src={author.avatar_url} alt="" />
                      )}
                      <AvatarFallback>ঢা</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      {author?.username ? (
                        <a
                          href={`/u/${encodeURIComponent(author.username)}/`}
                          className="text-sm font-medium hover:underline"
                        >
                          {name}
                        </a>
                      ) : (
                        <span className="text-sm font-medium">{name}</span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {relativeTimeBn(post.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {post.status !== "visible" && (
                      <Badge variant="secondary">লুকানো</Badge>
                    )}
                    {author?.id && author.id === userId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="পোস্ট মুছুন"
                        onClick={() => {
                          setDeleteError("");
                          setConfirming(post);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <CardTitle className="text-lg leading-snug">
                  {post.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="whitespace-pre-line text-sm leading-7">
                  {post.description}
                </p>
                {photos.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {photos.map((photo) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={photo.media_id}
                        src={spotlightMediaUrlFor(photo.media_id)}
                        alt=""
                        loading="lazy"
                        className="h-auto w-full rounded-lg border object-cover"
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!loading && hasMore && (
          <Button
            type="button"
            variant="outline"
            className="mx-auto"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "লোড হচ্ছে…" : "আরও দেখুন"}
          </Button>
        )}
      </section>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>পোস্ট মুছে ফেলবেন?</DialogTitle>
            <DialogDescription>
              {confirming ? `“${confirming.title}” স্থায়ীভাবে মুছে যাবে।` : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteError && <FormMessage>{deleteError}</FormMessage>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(null)}>
              বাতিল
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void deletePost()}
            >
              {deleteBusy ? "মুছে ফেলা হচ্ছে…" : "মুছে ফেলুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
