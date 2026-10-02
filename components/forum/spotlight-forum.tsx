"use client";

import * as React from "react";

import { BadgeCheck, Trash2 } from "lucide-react";

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
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
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
  issue_status: string;
  solver_kind: string | null;
  solver_name: string | null;
  solve_duration: string | null;
  issue_note: string | null;
  marked_at: string | null;
  created_at: string;
  author: SpotlightAuthor | SpotlightAuthor[] | null;
  spotlight_post_media: SpotlightMediaRow[] | null;
  spotlight_resolution_media: SpotlightMediaRow[] | null;
};

const POST_SELECT =
  "id,title,description,status,issue_status,solver_kind,solver_name,solve_duration,issue_note,marked_at,created_at,author:profiles!spotlight_posts_author_id_fkey(id,username,display_name,avatar_url),spotlight_post_media(position,media_id),spotlight_resolution_media(position,media_id)";

/** One screenful at a time; "আরও দেখুন" appends the next page. */
const PAGE_SIZE = 15;

const ISSUE_STATUS_LABELS: Record<string, string> = {
  open: "খোলা",
  in_progress: "কাজ চলছে",
  solved: "সমাধান হয়েছে",
  invalid: "ভিত্তিহীন / অপ্রাসঙ্গিক",
};

const ISSUE_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "secondary",
  in_progress: "default",
  solved: "outline",
  invalid: "destructive",
};

const SOLVER_KINDS = [
  { value: "authority", label: "প্রশাসন" },
  { value: "student_wing", label: "শিক্ষার্থী উইং" },
  { value: "volunteers", label: "স্বেচ্ছাসেবক" },
  { value: "dean_office", label: "ডিন অফিস" },
  { value: "hall_authority", label: "হল প্রশাসন" },
  { value: "faculty_department", label: "শিক্ষক / বিভাগ" },
  { value: "other", label: "অন্যান্য" },
];

const SOLVE_DURATIONS = [
  { value: "under_1h", label: "১ ঘণ্টার কম" },
  { value: "1_6h", label: "১–৬ ঘণ্টা" },
  { value: "6_24h", label: "৬–২৪ ঘণ্টা" },
  { value: "1_3d", label: "১–৩ দিন" },
  { value: "4_7d", label: "৪–৭ দিন" },
  { value: "1_2w", label: "১–২ সপ্তাহ" },
  { value: "2_4w", label: "২–৪ সপ্তাহ" },
  { value: "over_1m", label: "১ মাসের বেশি" },
];

function solverLabel(value: string | null): string {
  if (!value) return "";
  return SOLVER_KINDS.find((kind) => kind.value === value)?.label ?? value;
}

function durationLabel(value: string | null): string {
  if (!value) return "";
  return SOLVE_DURATIONS.find((slot) => slot.value === value)?.label ?? value;
}

export function SpotlightForum() {
  const { toast } = useToast();
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<string | null>(null);
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

  // The marking dialog. One form serves all four states; which fields it demands depends on the
  // state chosen, and the database enforces the same rules.
  const [marking, setMarking] = React.useState<SpotlightPost | null>(null);
  const [markStatus, setMarkStatus] = React.useState("solved");
  const [markKind, setMarkKind] = React.useState("");
  const [markName, setMarkName] = React.useState("");
  const [markDuration, setMarkDuration] = React.useState("");
  const [markNote, setMarkNote] = React.useState("");
  const [markProof, setMarkProof] = React.useState<GalleryItem[]>([]);
  const [markBusy, setMarkBusy] = React.useState(false);
  const [markError, setMarkError] = React.useState("");

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
        if (!user) return;
        const { data: roleRow, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (roleError) reportError("spotlight role", roleError);
        if (!cancelled) {
          setRole((roleRow as { role?: string } | null)?.role ?? null);
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

  // The author settles their own issue; the desk settles anyone's. The RPC enforces exactly this,
  // so the button is only shown where the call would succeed.
  function canMark(post: SpotlightPost): boolean {
    if (!userId) return false;
    if (one(post.author)?.id === userId) return true;
    return role === "moderator" || role === "admin";
  }

  function openMark(post: SpotlightPost) {
    setMarkStatus(post.issue_status === "open" ? "solved" : post.issue_status);
    setMarkKind(post.solver_kind ?? "");
    setMarkName(post.solver_name ?? "");
    setMarkDuration(post.solve_duration ?? "");
    setMarkNote(post.issue_note ?? "");
    setMarkProof([]);
    setMarkError("");
    setMarking(post);
  }

  function closeMark() {
    for (const item of markProof) URL.revokeObjectURL(item.objectUrl);
    setMarkProof([]);
    setMarking(null);
  }

  async function saveMark() {
    if (!marking) return;
    setMarkError("");
    const needsSolver = markStatus === "solved" || markStatus === "in_progress";
    if (needsSolver && !markKind) {
      setMarkError("কে সমাধান করেছে বা কাজ করছে, তা নির্বাচন করুন।");
      return;
    }
    if (markStatus === "solved" && !markDuration) {
      setMarkError("সমাধানে কত সময় লেগেছে তা নির্বাচন করুন।");
      return;
    }
    if (markStatus === "invalid" && markNote.trim().length < 3) {
      setMarkError("ভিত্তিহীন বা অপ্রাসঙ্গিক হিসেবে চিহ্নিত করতে কারণ লিখুন।");
      return;
    }
    setMarkBusy(true);
    try {
      const proofIds = markProof.map((item) => item.id);
      const { error: markFailure } = await supabaseBrowser().rpc(
        "mark_spotlight_issue",
        {
          p_post_id: marking.id,
          p_status: markStatus,
          p_solver_kind: needsSolver ? markKind : null,
          p_solver_name: needsSolver && markName.trim() ? markName.trim() : null,
          p_solve_duration: markStatus === "solved" ? markDuration : null,
          p_note: markNote.trim() || null,
          p_media_ids:
            markStatus === "solved" && proofIds.length ? proofIds : null,
        },
      );
      if (markFailure) {
        setMarkError(
          errorMessage(
            "spotlight marking",
            markFailure,
            "ইস্যুর অবস্থা সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      toast({
        tone: "success",
        title: "ইস্যুর অবস্থা সংরক্ষিত হয়েছে।",
        description:
          markStatus === "solved" ? "সমাধান হিসেবে চিহ্নিত করা হয়েছে।" : undefined,
      });
      closeMark();
      await loadPosts();
    } catch (err) {
      setMarkError(
        errorMessage(
          "spotlight marking",
          err,
          "ইস্যুর অবস্থা সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
        ),
      );
    } finally {
      setMarkBusy(false);
    }
  }

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
      toast({ tone: "success", title: "পোস্ট মুছে ফেলা হয়েছে।" });
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
      toast({ tone: "error", title: "শিরোনাম ও বিবরণ আবশ্যক।" });
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
        const message = errorMessage(
          "spotlight submission",
          submitError,
          "পোস্ট পাঠানো যায়নি। আবার চেষ্টা করুন।",
        );
        setError(message);
        toast({ tone: "error", title: message });
        return;
      }
      for (const item of gallery) URL.revokeObjectURL(item.objectUrl);
      setGallery([]);
      setTitle("");
      setDescription("");
      setDone("আপনার পোস্ট প্রকাশিত হয়েছে।");
      toast({
        tone: "success",
        title: "পোস্ট প্রকাশিত হয়েছে।",
        description: "যেকোনো সময় ইস্যুর অবস্থা হালনাগাদ করতে পারবেন।",
      });
      await loadPosts();
    } catch (err) {
      const message = errorMessage(
        "spotlight submission",
        err,
        "পোস্ট পাঠানো যায়নি। আবার চেষ্টা করুন।",
      );
      setError(message);
      toast({ tone: "error", title: message });
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
          const proof = (post.spotlight_resolution_media ?? [])
            .slice()
            .sort((a, b) => a.position - b.position);
          const name =
            author?.display_name?.trim() ||
            (author?.username ? `@${author.username}` : "সদস্য");
          const statusLabel =
            ISSUE_STATUS_LABELS[post.issue_status] ?? post.issue_status;
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
                  <div className="flex items-center gap-1">
                    {post.status !== "visible" && (
                      <Badge variant="secondary">লুকানো</Badge>
                    )}
                    <Badge variant={ISSUE_STATUS_VARIANTS[post.issue_status] ?? "secondary"}>
                      {statusLabel}
                    </Badge>
                    {canMark(post) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="ইস্যুর অবস্থা নির্ধারণ"
                        title="ইস্যুর অবস্থা নির্ধারণ"
                        onClick={() => openMark(post)}
                      >
                        <BadgeCheck className="size-4" />
                      </Button>
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
                {post.issue_status !== "open" && (
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-sm font-medium">
                      {statusLabel}
                      {post.solver_kind
                        ? ` · ${solverLabel(post.solver_kind)}`
                        : ""}
                      {post.solver_name ? ` (${post.solver_name})` : ""}
                    </p>
                    {post.solve_duration && (
                      <p className="text-xs text-muted-foreground">
                        সময় লেগেছে: {durationLabel(post.solve_duration)}
                      </p>
                    )}
                    {post.issue_note && (
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                        {post.issue_note}
                      </p>
                    )}
                    {proof.length > 0 && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {proof.map((photo) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={photo.media_id}
                            src={spotlightMediaUrlFor(photo.media_id)}
                            alt="সমাধানের প্রমাণ"
                            loading="lazy"
                            className="h-auto w-full rounded-lg border object-cover"
                          />
                        ))}
                      </div>
                    )}
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

      {/* Marking: the same form for solved / in progress / irrelevant, with the fields the chosen
          state requires. Submitting writes the post, its proof pictures and an event. */}
      <Dialog
        open={marking !== null}
        onOpenChange={(open) => {
          if (!open) closeMark();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ইস্যুর অবস্থা নির্ধারণ</DialogTitle>
            <DialogDescription>
              {marking ? `“${marking.title}”` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field label="অবস্থা" htmlFor="mark-status">
              <Select
                id="mark-status"
                value={markStatus}
                onChange={(e) => setMarkStatus(e.target.value)}
              >
                <option value="solved">সমাধান হয়েছে</option>
                <option value="in_progress">কাজ চলছে</option>
                <option value="invalid">ভিত্তিহীন / অপ্রাসঙ্গিক</option>
                <option value="open">খোলা (চিহ্ন সরান)</option>
              </Select>
            </Field>

            {(markStatus === "solved" || markStatus === "in_progress") && (
              <FieldGrid>
                <Field
                  label={
                    markStatus === "solved"
                      ? "সমাধান করেছে"
                      : "কাজটি করছে"
                  }
                  htmlFor="mark-kind"
                >
                  <Select
                    id="mark-kind"
                    value={markKind}
                    onChange={(e) => setMarkKind(e.target.value)}
                  >
                    <option value="">বেছে নিন</option>
                    {SOLVER_KINDS.map((kind) => (
                      <option key={kind.value} value={kind.value}>
                        {kind.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="নাম / দপ্তর (ঐচ্ছিক)"
                  htmlFor="mark-name"
                  hint="নির্দিষ্ট ব্যক্তি বা অফিস জানা থাকলে লিখুন।"
                >
                  <Input
                    id="mark-name"
                    value={markName}
                    maxLength={120}
                    onChange={(e) => setMarkName(e.target.value)}
                  />
                </Field>
              </FieldGrid>
            )}

            {markStatus === "solved" && (
              <Field
                label="সমাধানে কত সময় লেগেছে"
                htmlFor="mark-duration"
              >
                <Select
                  id="mark-duration"
                  value={markDuration}
                  onChange={(e) => setMarkDuration(e.target.value)}
                >
                  <option value="">বেছে নিন</option>
                  {SOLVE_DURATIONS.map((slot) => (
                    <option key={slot.value} value={slot.value}>
                      {slot.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {markStatus === "invalid" ? (
              <Field
                label="কারণ (আবশ্যক)"
                htmlFor="mark-note"
                hint="কেন এটি ভিত্তিহীন বা অপ্রাসঙ্গিক, তা লিখুন।"
              >
                <Textarea
                  id="mark-note"
                  value={markNote}
                  rows={3}
                  minLength={3}
                  maxLength={500}
                  onChange={(e) => setMarkNote(e.target.value)}
                />
              </Field>
            ) : (
              <Field
                label="নোট (ঐচ্ছিক)"
                htmlFor="mark-note"
                hint="সমাধান বা কাজের অগ্রগতি নিয়ে সংক্ষিপ্ত তথ্য।"
              >
                <Textarea
                  id="mark-note"
                  value={markNote}
                  rows={2}
                  maxLength={500}
                  onChange={(e) => setMarkNote(e.target.value)}
                />
              </Field>
            )}

            {markStatus === "solved" && (
              <FieldSection
                title="সমাধানের প্রমাণ"
                description="ছবি থাকলে যুক্ত করুন (সর্বোচ্চ ৬টি)।"
              >
                <GalleryUploader
                  items={markProof}
                  onChange={setMarkProof}
                  scope="spotlight"
                />
              </FieldSection>
            )}

            {markError && <FormMessage>{markError}</FormMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeMark()}>
              বাতিল
            </Button>
            <Button
              type="button"
              disabled={markBusy}
              onClick={() => void saveMark()}
            >
              {markBusy ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
