"use client";

import * as React from "react";
import { BookOpen, CalendarClock, Eye, EyeOff, Gavel, Gift, Pencil, Search, Trash2 } from "lucide-react";

import { AuthedMediaImage } from "@/components/article/authed-media-image";
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
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { RichTextContent } from "@/components/ui/rich-text-content";
import { revalidateReaders } from "@/lib/desk-client";
import { earningBreakdown, type EarningDetails } from "@/lib/earning-details";
import { errorMessage, reportError } from "@/lib/errors";
import { inlineMediaIds } from "@/lib/richtext";
import { supabaseBrowser } from "@/lib/supabase";
import { bn, bnMoney, formatDateBn } from "@/lib/site";

type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  status: string;
  is_anonymous: boolean;
  published_at: string | null;
  created_at: string;
  category: { slug: string; title_bn: string } | null;
  author: { username: string; display_name: string } | null;
  hero_media_key: string | null;
  article_media: { media_id: string; position: number }[] | null;
};

type Member = { id: string; username: string; display_name: string };

/** Ledger rows that record what a story earned: the automatic formula fee and view income. */
type Earning = {
  id: string;
  amount_tk: number;
  entry_type: string;
  created_at: string;
  details: EarningDetails | null;
};

const STATUS_LABELS: Record<string, string> = {
  published: "প্রকাশিত",
  pending: "অপেক্ষমাণ",
  rejected: "প্রত্যাখ্যাত",
  draft: "খসড়া",
};

const STATUS_FILTERS = [
  ["all", "সব"],
  ["pending", "অপেক্ষমাণ"],
  ["published", "প্রকাশিত"],
  ["rejected", "প্রত্যাখ্যাত"],
] as const;

// One page of the desk's story list. The table used to stop at the first page with no way
// forward, so anything past sixty stories was unreachable from the panel.
const PAGE_SIZE = 60;

const BYLINE_LABELS: Record<string, string> = {
  keep: "অপরিবর্তিত",
  author: "লেখকের নামে",
  anonymous: "নাম প্রকাশে অনিচ্ছুক",
};

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "published") return "default";
  if (status === "rejected") return "destructive";
  if (status === "pending") return "secondary";
  return "outline";
}

/** Bengali digits for the article count, matching the rest of the panel. */
function countLabel(value: number): string {
  return bn(value);
}

export function AdminArticles() {
  const [articles, setArticles] = React.useState<Article[]>([]);
  const [status, setStatus] = React.useState<string>("all");
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  // Offset of the next page, and whether the last fetch filled its page.
  const [offset, setOffset] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  // How many stories the whole filtered archive holds. The header used to read the length of the
  // loaded page instead, so it said sixty for every desk past sixty stories.
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  // What the visible list was actually fetched for. The header reads this rather than the live
  // controls, so the count never describes a filter the table has not applied yet.
  const [scope, setScope] = React.useState({ status: "all", query: "" });
  // Ticked rows. The desk can erase several stories in one go, so the set outlives a single row's
  // dialog; it is cleared whenever the list itself is replaced.
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const selectAllRef = React.useRef<HTMLInputElement>(null);

  // The edit dialog holds the whole body, so it is its own state rather than a field on the row.
  const [editing, setEditing] = React.useState<Article | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editSlug, setEditSlug] = React.useState("");
  const [editExcerpt, setEditExcerpt] = React.useState("");
  const [editBody, setEditBody] = React.useState("");

  // Byline and dateline travel together in one desk operation.
  const [publishing, setPublishing] = React.useState<Article | null>(null);
  const [byline, setByline] = React.useState("keep");
  const [authorQuery, setAuthorQuery] = React.useState("");
  const [authorMatches, setAuthorMatches] = React.useState<Member[]>([]);
  const [author, setAuthor] = React.useState<Member | null>(null);
  const [publishDate, setPublishDate] = React.useState("");

  // Taking a story down (or putting it back) is its own audited decision.
  const [deciding, setDeciding] = React.useState<Article | null>(null);

  // Erasing a story is the only decision the desk cannot undo, so the dialog says what leaves with
  // it: the row and its pictures, and any money the story earned — clawed back even when it was
  // already withdrawn, which can leave the author's balance below zero.
  const [deleting, setDeleting] = React.useState<Article | null>(null);

  // The preview shows the story as a reader sees it, with what the story has earned floating at its
  // foot. The earning rows are read once when the preview opens, and the total stays off until then.
  const [previewing, setPreviewing] = React.useState<Article | null>(null);
  const [earnings, setEarnings] = React.useState<Earning[]>([]);
  const [earningsLoaded, setEarningsLoaded] = React.useState(false);
  const [earningMessage, setEarningMessage] = React.useState("");

  // The desk's bonus. Whole taka between 10 and 20, published stories only — the server
  // refuses anything else, so the dialog only has to collect the number.
  const [bonusing, setBonusing] = React.useState<Article | null>(null);
  const [bonusAmount, setBonusAmount] = React.useState("");

  // The desk's penalty, the mirror image: whole taka 10–20 docked from the story's owner.
  const [penalizing, setPenalizing] = React.useState<Article | null>(null);
  const [penaltyAmount, setPenaltyAmount] = React.useState("");

  // The pictures the story's own body already draws. The preview's attachment strip skips them so
  // the desk sees the page the reader will get, not the body plus a duplicate of every inline image.
  const previewInlineMedia = previewing
    ? inlineMediaIds(previewing.body, "article")
    : [];

  // The automatic earning rows behind the preview's money line: one formula fee at publish plus
  // whatever the view settlements have added since. The sum is the story's whole income.
  const income = earnings.reduce((sum, row) => sum + Number(row.amount_tk), 0);
  const feeRow = earnings.find((row) => row.entry_type.startsWith("article_earning_"));
  const feeBreakdown = feeRow ? earningBreakdown(feeRow.entry_type, feeRow.details) : null;
  const viewRows = earnings.filter((row) => row.entry_type.startsWith("view_earning_"));
  const bonusRows = earnings.filter((row) => row.entry_type.startsWith("bonus_earning_"));
  const bonusTotal = bonusRows.reduce((sum, row) => sum + Number(row.amount_tk), 0);
  const penaltyTotal = earnings
    .filter((row) => row.entry_type === "penalty")
    .reduce((sum, row) => sum + Number(row.amount_tk), 0);
  const viewsTotal = viewRows.reduce((sum, row) => sum + Number(row.amount_tk), 0);
  const viewCount = viewRows.reduce((sum, row) => sum + Number(row.details?.views ?? 0), 0);

  const load = React.useCallback(
    async (nextStatus: string, nextQuery: string, nextOffset = 0, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const supabase = supabaseBrowser();
        let request = supabase
          .from("articles")
          .select(
            "id,slug,title,excerpt,body,status,is_anonymous,published_at,created_at,hero_media_key,article_media(media_id,position),category:categories(slug,title_bn),author:profiles!articles_author_id_fkey(username,display_name)",
            // The total arrives beside the page: PostgREST counts every matching row and reports it
            // in Content-Range, so the archive size costs no second request.
            { count: "exact" },
          )
          .order("created_at", { ascending: false })
          .range(nextOffset, nextOffset + PAGE_SIZE - 1);
        // Either filter is optional, and PostgREST lets both narrow the same request.
        if (nextStatus !== "all") request = request.eq("status", nextStatus);
        if (nextQuery.trim()) request = request.ilike("title", `%${nextQuery.trim()}%`);
        const { data, count, error: loadError } = await request;
        if (loadError) {
          setError(
            errorMessage("admin articles", loadError, "প্রতিবেদনের তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।"),
          );
          return;
        }
        const rows = (data as unknown as Article[]) ?? [];
        const loaded = nextOffset + rows.length;
        setArticles((prev) => (append ? [...prev, ...rows] : rows));
        setOffset(loaded);
        // A count of null means the header simply repeats what is loaded, rather than claiming zero.
        setTotal(count ?? loaded);
        setHasMore(count == null ? rows.length === PAGE_SIZE : loaded < count);
        setScope({ status: nextStatus, query: nextQuery.trim() });
        // A ticked row that is no longer on screen must not be erased by a later bulk action.
        if (!append) setSelected(new Set());
      } catch (err) {
        setError(errorMessage("admin articles", err, "প্রতিবেদনের তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।"));
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void load(status, query, 0, false);
    // Re-runs when the filter changes; the search box submits explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function openEditor(article: Article) {
    setEditing(article);
    setEditTitle(article.title);
    setEditSlug(article.slug);
    setEditExcerpt(article.excerpt);
    setEditBody(article.body);
  }

  async function saveEdit() {
    if (!editing) return;
    setError("");
    setNotice("");
    setBusy(`edit-${editing.id}`);
    try {
      const { error: saveError } = await supabaseBrowser().rpc("admin_update_article", {
        p_article_id: editing.id,
        p_title: editTitle.trim(),
        p_excerpt: editExcerpt.trim(),
        p_body: editBody,
        p_slug: editSlug.trim().toLowerCase() || null,
      });
      if (saveError) {
        setError(errorMessage("article edit", saveError, "প্রতিবেদন সম্পাদনা করা যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      // The edit has rewriten a story a reader can reach, so the cached copies of the reading
      // surfaces are invalidated before the desk moves on.
      void revalidateReaders();
      setNotice("প্রতিবেদন সংরক্ষিত হয়েছে।");
      setEditing(null);
      await load(status, query, 0, false);
    } catch (err) {
      setError(errorMessage("article edit", err, "প্রতিবেদন সম্পাদনা করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(null);
    }
  }

  function openPublishing(article: Article) {
    setPublishing(article);
    setByline("keep");
    setAuthorQuery("");
    setAuthorMatches([]);
    setAuthor(null);
    // An existing dateline is offered as the starting point, in the local wall-clock the
    // datetime-local input understands.
    setPublishDate(
      article.published_at
        ? new Date(article.published_at).toISOString().slice(0, 16)
        : "",
    );
  }

  async function findAuthors(term: string) {
    setAuthorQuery(term);
    if (term.trim().length < 2) {
      setAuthorMatches([]);
      return;
    }
    try {
      const { data, error: lookupError } = await supabaseBrowser().rpc("admin_member_records", {
        p_query: term.trim(),
        p_limit: 8,
        p_offset: 0,
      });
      if (lookupError) {
        setError(errorMessage("article author lookup", lookupError, "লেখক খুঁজে পাওয়া যায়নি।"));
        return;
      }
      setAuthorMatches((data as unknown as Member[]) ?? []);
    } catch (err) {
      setError(errorMessage("article author lookup", err, "লেখক খুঁজে পাওয়া যায়নি।"));
    }
  }

  async function savePublishing() {
    if (!publishing) return;
    setError("");
    setNotice("");
    // The server needs an id, but the desk should never type one: the search above resolves a
    // name to the member row, and that row is what is sent.
    if (byline === "author" && !author) {
      setError("লেখকের নামে প্রকাশ করতে একজন সদস্য নির্বাচন করুন।");
      return;
    }
    setBusy(`publish-${publishing.id}`);
    try {
      const { error: publishError } = await supabaseBrowser().rpc("admin_set_article_publication", {
        p_article_id: publishing.id,
        p_byline: byline,
        p_author_id: author?.id ?? null,
        p_published_at: publishDate ? new Date(publishDate).toISOString() : null,
      });
      if (publishError) {
        setError(
          errorMessage("article publication", publishError, "বাইলাইন বা তারিখ সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"),
        );
        return;
      }
      // A byline or publication date decides whether the story is on the front page at all, and
      // which author it is credited to there.
      void revalidateReaders();
      setNotice("বাইলাইন ও প্রকাশের তারিখ সংরক্ষিত হয়েছে।");
      setPublishing(null);
      await load(status, query, 0, false);
    } catch (err) {
      setError(errorMessage("article publication", err, "বাইলাইন বা তারিখ সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(null);
    }
  }

  async function decideStatus(article: Article, next: "published" | "rejected") {
    setError("");
    setNotice("");
    setBusy(`status-${article.id}`);
    try {
      const { error: statusError } = await supabaseBrowser().rpc("admin_set_article_status", {
        p_article_id: article.id,
        p_status: next,
      });
      if (statusError) {
        setError(errorMessage("article status", statusError, "প্রতিবেদনের অবস্থা বদলানো যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      // Publishing puts the story on the front page, its section and its own page; rejecting takes
      // it off all three.
      void revalidateReaders();
      setNotice(next === "published" ? "প্রতিবেদন প্রকাশ করা হয়েছে।" : "প্রতিবেদন প্রকাশ থেকে সরানো হয়েছে।");
      setDeciding(null);
      await load(status, query, 0, false);
    } catch (err) {
      setError(errorMessage("article status", err, "প্রতিবেদনের অবস্থা বদলানো যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(null);
    }
  }

  function openBonus(article: Article) {
    setBonusing(article);
    setBonusAmount("");
  }

  async function awardBonus() {
    if (!bonusing) return;
    setError("");
    setNotice("");
    const amountTk = Number(bonusAmount);
    if (!Number.isInteger(amountTk) || amountTk < 10 || amountTk > 20) {
      setError("বোনাস ১০ থেকে ২০ টাকার মধ্যে একটি পূর্ণসংখ্যা হতে হবে।");
      return;
    }
    setBusy(`bonus-${bonusing.id}`);
    try {
      const { error: bonusError } = await supabaseBrowser().rpc("admin_award_bonus", {
        p_article_id: bonusing.id,
        p_amount_tk: amountTk,
      });
      if (bonusError) {
        setError(errorMessage("article bonus", bonusError, "বোনাস যোগ করা যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      setNotice(`৳${bn(amountTk)} বোনাস যোগ করা হয়েছে।`);
      setBonusing(null);
    } catch (err) {
      setError(errorMessage("article bonus", err, "বোনাস যোগ করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(null);
    }
  }

  function openPenalty(article: Article) {
    setPenalizing(article);
    setPenaltyAmount("");
  }

  async function applyPenalty() {
    if (!penalizing) return;
    setError("");
    setNotice("");
    const amountTk = Number(penaltyAmount);
    if (!Number.isInteger(amountTk) || amountTk < 10 || amountTk > 20) {
      setError("জরিমানা ১০ থেকে ২০ টাকার মধ্যে একটি পূর্ণসংখ্যা হতে হবে।");
      return;
    }
    setBusy(`penalty-${penalizing.id}`);
    try {
      const { error: penaltyError } = await supabaseBrowser().rpc("admin_apply_penalty", {
        p_article_id: penalizing.id,
        p_amount_tk: amountTk,
      });
      if (penaltyError) {
        setError(errorMessage("article penalty", penaltyError, "জরিমানা যোগ করা যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      setNotice(`৳${bn(amountTk)} জরিমানা যোগ করা হয়েছে।`);
      setPenalizing(null);
    } catch (err) {
      setError(errorMessage("article penalty", err, "জরিমানা যোগ করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(null);
    }
  }

  function openDelete(article: Article) {
    setDeleting(article);
  }

  async function deleteArticle() {
    if (!deleting) return;
    setError("");
    setNotice("");
    setBusy(`delete-${deleting.id}`);
    try {
      const { error: deleteError } = await supabaseBrowser().rpc("admin_delete_article", {
        p_article_id: deleting.id,
      });
      if (deleteError) {
        setError(
          errorMessage("article delete", deleteError, "প্রতিবেদন স্থায়ীভাবে মুছে ফেলা যায়নি। আবার চেষ্টা করুন।"),
        );
        return;
      }
      // The story may have been live on the front page, its section and its own address.
      void revalidateReaders();
      setNotice("প্রতিবেদনটি স্থায়ীভাবে মুছে ফেলা হয়েছে।");
      setDeleting(null);
      await load(status, query, 0, false);
    } catch (err) {
      setError(
        errorMessage("article delete", err, "প্রতিবেদন স্থায়ীভাবে মুছে ফেলা যায়নি। আবার চেষ্টা করুন।"),
      );
    } finally {
      setBusy(null);
    }
  }

  function openBulkDelete() {
    if (selected.size === 0) return;
    setBulkOpen(true);
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = supabaseBrowser();
      let failed = 0;
      for (const id of selected) {
        const { error: deleteError } = await supabase.rpc("admin_delete_article", { p_article_id: id });
        if (deleteError) {
          failed += 1;
          reportError("article bulk delete", deleteError);
        }
      }
      const removed = selected.size - failed;
      // One invalidation covers the batch: every story in it may have been live somewhere.
      if (removed > 0) void revalidateReaders();
      if (removed > 0) {
        setNotice(`${countLabel(removed)}টি প্রতিবেদন স্থায়ীভাবে মুছে ফেলা হয়েছে।`);
      }
      if (failed > 0) {
        setError(`${countLabel(failed)}টি প্রতিবেদন মোছা যায়নি। আবার চেষ্টা করুন।`);
      }
      setBulkOpen(false);
      setSelected(new Set());
      await load(status, query, 0, false);
    } catch (err) {
      setError(errorMessage("article bulk delete", err, "প্রতিবেদনগুলো মোছা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBulkBusy(false);
    }
  }

  async function openPreview(article: Article) {
    setPreviewing(article);
    setEarnings([]);
    setEarningsLoaded(false);
    setEarningMessage("");
    try {
      const { data, error: readError } = await supabaseBrowser()
        .from("earnings_ledger")
        .select("id,amount_tk,entry_type,created_at,details")
        .eq("article_id", article.id)
        .in("entry_type", [
          "article_earning_available",
          "article_earning_held",
          "view_earning_available",
          "view_earning_held",
          "bonus_earning_available",
          "bonus_earning_held",
          "penalty",
        ]);
      if (readError) {
        setEarningMessage(errorMessage("article earning read", readError, "আয়ের হিসাব দেখানো যাচ্ছে না।"));
        return;
      }
      setEarnings((data as unknown as Earning[]) ?? []);
    } catch (err) {
      setEarningMessage(errorMessage("article earning read", err, "আয়ের হিসাব দেখানো যাচ্ছে না।"));
    } finally {
      setEarningsLoaded(true);
    }
  }

  const allSelected = articles.length > 0 && articles.every((article) => selected.has(article.id));
  const someSelected = selected.size > 0 && !allSelected;

  // The header box shows a dash while only some of the loaded rows are ticked.
  React.useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  // "মোট" only when nothing narrows the list, so the number always names exactly what it counts.
  // Before the first page arrives the count is unknown, and the header says nothing rather than zero.
  const heading =
    loading && total === 0
      ? "প্রতিবেদন"
      : `প্রতিবেদন (${scope.status === "all" && !scope.query ? "মোট " : ""}${countLabel(total)}টি)`;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm text-success" role="status">
          {notice}
        </p>
      )}
      <Card className="admin-card">
        <CardHeader>
          <CardTitle>{heading}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            className="flex items-start gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void load(status, query, 0, false);
            }}
          >
            <Field label="প্রতিবেদন খুঁজুন" htmlFor="article-search" hideLabel className="min-w-0 flex-1">
              <Input
                id="article-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="শিরোনাম দিয়ে খুঁজুন…"
              />
            </Field>
            <Button type="submit">
              <Search className="size-4" aria-hidden />
              <span className="sr-only">খুঁজুন</span>
            </Button>
          </form>
          <div className="flex flex-wrap gap-2" role="group" aria-label="অবস্থা অনুযায়ী ছাঁকনি">
            {STATUS_FILTERS.map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={status === key ? "default" : "outline"}
                aria-pressed={status === key}
                onClick={() => setStatus(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <span className="text-sm font-medium">{countLabel(selected.size)}টি নির্বাচিত</span>
              <Button size="sm" variant="destructive" onClick={() => void openBulkDelete()}>
                <Trash2 className="size-4" aria-hidden />
                নির্বাচিতগুলো মুছুন
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                নির্বাচন বাতিল
              </Button>
            </div>
          )}
          <Table aria-label="প্রতিবেদনের তালিকা">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="size-4 cursor-pointer accent-primary align-middle"
                    aria-label="দৃশ্যমান সব প্রতিবেদন নির্বাচন করুন"
                    checked={allSelected}
                    disabled={loading || articles.length === 0}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? new Set(articles.map((article) => article.id))
                          : new Set(),
                      )
                    }
                  />
                </TableHead>
                <TableHead>প্রতিবেদন</TableHead>
                <TableHead>অবস্থা</TableHead>
                <TableHead className="hidden md:table-cell">লেখক</TableHead>
                <TableHead className="hidden lg:table-cell">প্রকাশ</TableHead>
                <TableHead className="w-52">
                  <span className="sr-only">পদক্ষেপ</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    তালিকা লোড হচ্ছে…
                  </TableCell>
                </TableRow>
              )}
              {!loading && articles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    এই ছাঁকনিতে কোনো প্রতিবেদন নেই।
                  </TableCell>
                </TableRow>
              )}
              {articles.map((article) => {
                const live = article.status === "published";
                return (
                  <TableRow key={article.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 cursor-pointer accent-primary"
                        aria-label={`${article.title} নির্বাচন করুন`}
                        checked={selected.has(article.id)}
                        onChange={(event) =>
                          setSelected((prev) =>
                            event.target.checked
                              ? new Set([...prev, article.id])
                              : new Set([...prev].filter((id) => id !== article.id)),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{article.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {article.category?.title_bn ?? "শ্রেণি নেই"} · /{article.slug}
                      </p>
                    </TableCell>
                    <TableCell data-label="অবস্থা">
                      <Badge variant={statusVariant(article.status)}>
                        {STATUS_LABELS[article.status] ?? article.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell" data-label="লেখক">
                      {article.is_anonymous
                        ? "নাম প্রকাশে অনিচ্ছুক"
                        : article.author
                          ? article.author.display_name?.trim() || `@${article.author.username}`
                          : "—"}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell" data-label="প্রকাশ">
                      {article.published_at ? formatDateBn(article.published_at) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void openPreview(article)}
                          aria-label={`${article.title} পূর্বরূপ`}
                          title="পূর্বরূপ ও অর্থ নির্ধারণ"
                        >
                          <BookOpen className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditor(article)}
                          aria-label={`${article.title} সম্পাদনা`}
                          title="সম্পাদনা"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openPublishing(article)}
                          aria-label={`${article.title} বাইলাইন ও তারিখ`}
                          title="বাইলাইন ও প্রকাশের তারিখ"
                        >
                          <CalendarClock className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeciding(article)}
                          aria-label={live ? `${article.title} প্রকাশ থেকে সরান` : `${article.title} প্রকাশ করুন`}
                          title={live ? "প্রকাশ থেকে সরান" : "প্রকাশ করুন"}
                        >
                          {live ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openBonus(article)}
                          aria-label={`${article.title} বোনাস`}
                          title="বোনাস দিন"
                        >
                          <Gift className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => openPenalty(article)}
                          aria-label={`${article.title} জরিমানা`}
                          title="জরিমানা দিন"
                        >
                          <Gavel className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => void openDelete(article)}
                          aria-label={`${article.title} স্থায়ীভাবে মুছুন`}
                          title="স্থায়ীভাবে মুছুন"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {hasMore && (
            <div className="flex flex-col items-center gap-1 pt-1">
              <Button
                variant="outline"
                onClick={() => void load(scope.status, scope.query, offset, true)}
                disabled={loadingMore}
              >
                {loadingMore
                  ? "লোড হচ্ছে…"
                  : `আরও দেখুন (${countLabel(articles.length)} / ${countLabel(total)})`}
              </Button>
              <p className="text-xs text-muted-foreground">
                আরও {countLabel(Math.max(0, total - articles.length))}টি প্রতিবেদন বাকি
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* The desk edit. It writes a revision and can touch any status, which is what lets a
          pending submission be corrected before it goes out. */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>প্রতিবেদন সম্পাদনা</DialogTitle>
            <DialogDescription>
              {editing && <>/{editing.slug} — সংরক্ষণ করলে একটি সংশোধন সংস্করণও লেখা হবে।</>}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="শিরোনাম" htmlFor="edit-title">
              <Input
                id="edit-title"
                value={editTitle}
                maxLength={180}
                onChange={(event) => setEditTitle(event.target.value)}
              />
            </Field>
            <Field
              label="ঠিকানা (slug)"
              htmlFor="edit-slug"
              hint="প্রকাশিত ঠিকানা। বদলালে পুরোনো লিংক আর কাজ করবে না।"
            >
              <Input
                id="edit-slug"
                value={editSlug}
                maxLength={96}
                onChange={(event) => setEditSlug(event.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <Field label="সংক্ষিপ্ত পরিচিতি" htmlFor="edit-excerpt" hint="১০–২৮০ অক্ষর।">
              <Textarea
                id="edit-excerpt"
                value={editExcerpt}
                rows={2}
                maxLength={280}
                onChange={(event) => setEditExcerpt(event.target.value)}
              />
            </Field>
            <Field label="প্রতিবেদনের অংশ" htmlFor="edit-body" hint="অন্তত ১০০ অক্ষর।">
              <Textarea
                id="edit-body"
                value={editBody}
                rows={10}
                onChange={(event) => setEditBody(event.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              বাতিল
            </Button>
            <Button onClick={() => void saveEdit()} disabled={busy !== null}>
              {busy?.startsWith("edit-") ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Byline and dateline. The author is chosen by name, never by id. */}
      <Dialog open={publishing !== null} onOpenChange={(open) => !open && setPublishing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>বাইলাইন ও প্রকাশের তারিখ</DialogTitle>
            <DialogDescription>
              {publishing && <>&ldquo;{publishing.title}&rdquo; — এখন {STATUS_LABELS[publishing.status] ?? publishing.status}।</>}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="বাইলাইন" htmlFor="pub-byline">
              <Select id="pub-byline" value={byline} onChange={(event) => setByline(event.target.value)}>
                {Object.entries(BYLINE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            {byline !== "keep" && (
              <div className="grid gap-2">
                <Field
                  label="লেখক খুঁজুন"
                  htmlFor="pub-author"
                  hint="নাম বা ইউজারনেম লিখে সদস্য নির্বাচন করুন — কোনো আইডি টাইপ করতে হবে না।"
                >
                  <Input
                    id="pub-author"
                    value={authorQuery}
                    onChange={(event) => void findAuthors(event.target.value)}
                    placeholder="নাম বা ইউজারনেম…"
                  />
                </Field>
                {author ? (
                  <p className="text-sm">
                    নির্বাচিত: {author.display_name?.trim() || `@${author.username}`}{" "}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAuthor(null)}
                      className="h-6 px-2"
                    >
                      বাতিল
                    </Button>
                  </p>
                ) : (
                  authorMatches.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {authorMatches.map((member) => (
                        <li key={member.id}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => {
                              setAuthor(member);
                              setAuthorMatches([]);
                            }}
                          >
                            {member.display_name?.trim() || `@${member.username}`}{" "}
                            <span className="text-muted-foreground">@{member.username}</span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            )}
            <FieldGrid>
              <Field
                label="প্রকাশের তারিখ"
                htmlFor="pub-date"
                hint="খালি রাখলে বর্তমান তারিখ অপরিবর্তিত থাকবে। ভবিষ্যতের সময় সার্ভার বর্তমানে নামিয়ে আনে।"
              >
                <Input
                  id="pub-date"
                  type="datetime-local"
                  value={publishDate}
                  onChange={(event) => setPublishDate(event.target.value)}
                />
              </Field>
            </FieldGrid>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishing(null)}>
              বাতিল
            </Button>
            <Button onClick={() => void savePublishing()} disabled={busy !== null}>
              {busy?.startsWith("publish-") ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Take a live story down, or put it back. */}
      <Dialog open={deciding !== null} onOpenChange={(open) => !open && setDeciding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deciding?.status === "published" ? "প্রকাশ থেকে সরান" : "প্রকাশ করুন"}
            </DialogTitle>
            <DialogDescription>
              {deciding && (
                <>
                  &ldquo;{deciding.title}&rdquo; —{" "}
                  {deciding.status === "published"
                    ? "প্রকাশ থেকে সরালে প্রতিবেদনটি পাঠকের কাছে আর দেখা যাবে না।"
                    : "প্রকাশ করলে প্রতিবেদনটি সঙ্গে সঙ্গে পাঠকের কাছে যাবে।"}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeciding(null)}>
              বাতিল
            </Button>
            <Button
              variant={deciding?.status === "published" ? "destructive" : "default"}
              onClick={() =>
                deciding && void decideStatus(deciding, deciding.status === "published" ? "rejected" : "published")
              }
              disabled={busy !== null}
            >
              {busy?.startsWith("status-") ? "সংরক্ষণ হচ্ছে…" : "নিশ্চিত করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The desk's discretionary bonus: ৳10–20 whole taka on a published story. The server
          holds it until the author's profile completes, exactly like automatic earnings. */}
      <Dialog open={bonusing !== null} onOpenChange={(open) => !open && setBonusing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>বোনাস দিন</DialogTitle>
            <DialogDescription>
              {bonusing && (
                <>
                  &ldquo;{bonusing.title}&rdquo; — {bonusing.is_anonymous
                    ? "নাম প্রকাশে অনিচ্ছুক"
                    : bonusing.author
                      ? bonusing.author.display_name?.trim() || `@${bonusing.author.username}`
                      : "লেখক নেই"}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="বোনাসের পরিমাণ (টাকা)" htmlFor="bonus-amount" hint="১০ থেকে ২০ টাকার মধ্যে একটি পূর্ণসংখ্যা।">
              <Input
                id="bonus-amount"
                type="number"
                min={10}
                max={20}
                step={1}
                value={bonusAmount}
                onChange={(event) => setBonusAmount(event.target.value)}
                placeholder="১০–২০"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBonusing(null)}>
              বাতিল
            </Button>
            <Button onClick={() => void awardBonus()} disabled={busy !== null}>
              {busy?.startsWith("bonus-") ? "যোগ করা হচ্ছে…" : "বোনাস যোগ করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The desk's discretionary penalty: ৳10–20 whole taka docked from the story's owner when
          the story is judged to deserve less than it earned. The deduction is immediate. */}
      <Dialog open={penalizing !== null} onOpenChange={(open) => !open && setPenalizing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>জরিমানা দিন</DialogTitle>
            <DialogDescription>
              {penalizing && (
                <>
                  &ldquo;{penalizing.title}&rdquo; — {penalizing.is_anonymous
                    ? "নাম প্রকাশে অনিচ্ছুক"
                    : penalizing.author
                      ? penalizing.author.display_name?.trim() || `@${penalizing.author.username}`
                      : "লেখক নেই"}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              এই পরিমাণ লেখকের মোট ব্যালেন্স থেকে সঙ্গে সঙ্গে কেটে নেওয়া হবে।
            </p>
            <Field label="জরিমানার পরিমাণ (টাকা)" htmlFor="penalty-amount" hint="১০ থেকে ২০ টাকার মধ্যে একটি পূর্ণসংখ্যা।">
              <Input
                id="penalty-amount"
                type="number"
                min={10}
                max={20}
                step={1}
                value={penaltyAmount}
                onChange={(event) => setPenaltyAmount(event.target.value)}
                placeholder="১০–২০"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPenalizing(null)}>
              বাতিল
            </Button>
            <Button variant="destructive" onClick={() => void applyPenalty()} disabled={busy !== null}>
              {busy?.startsWith("penalty-") ? "কাটা হচ্ছে…" : "জরিমানা যোগ করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Erasing a story. The one desk action that cannot be undone, so it names what leaves with
          the story and offers the reversible alternative beside it. */}
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>প্রতিবেদন স্থায়ীভাবে মুছুন</DialogTitle>
            <DialogDescription>
              {deleting && (
                <>
                  &ldquo;{deleting.title}&rdquo; — মুছে ফেললে এটি আর ফিরিয়ে আনা যাবে না।
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            প্রতিবেদনটির সঙ্গে তার ছবি, মন্তব্য, প্রতিক্রিয়া, বুকমার্ক ও সংশোধনের ইতিহাসও স্থায়ীভাবে
            মুছে যাবে। শুধু পাঠকের চোখ থেকে সরাতে চাইলে বদলে &ldquo;প্রকাশ থেকে সরান&rdquo; ব্যবহার করুন।
          </p>
          <p className="text-sm text-muted-foreground">
            এই প্রতিবেদনের আয় ইতিমধ্যে লেখকের ব্যালেন্সে যোগ হয়ে থাকলে সেটিও কেটে নেওয়া হবে — টাকা
            তোলা হয়ে থাকলেও। ফলে লেখকের ব্যালেন্স শূন্যের নিচে নেমে ঋণাত্মক হতে পারে।
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              বাতিল
            </Button>
            <Button
              variant="destructive"
              onClick={() => void deleteArticle()}
              disabled={busy !== null}
            >
              {busy?.startsWith("delete-") ? "মুছে ফেলা হচ্ছে…" : "স্থায়ীভাবে মুছুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The same decision for a batch. Every selected story goes, and the dialog says what the
          money behind them does before the desk confirms. */}
      <Dialog open={bulkOpen} onOpenChange={(open) => !open && setBulkOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>নির্বাচিত প্রতিবেদনগুলো স্থায়ীভাবে মুছুন</DialogTitle>
            <DialogDescription>
              {countLabel(selected.size)}টি প্রতিবেদন — মুছে ফেললে আর ফিরিয়ে আনা যাবে না।
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            প্রতিটি প্রতিবেদনের সঙ্গে তার ছবি, মন্তব্য, প্রতিক্রিয়া, বুকমার্ক ও সংশোধনের ইতিহাসও
            স্থায়ীভাবে মুছে যাবে।
          </p>
          <p className="text-sm text-muted-foreground">
            নির্বাচিত প্রতিবেদনগুলো থেকে যে আয় ইতিমধ্যে লেখকদের ব্যালেন্সে যোগ হয়েছে, সেটিও কেটে
            নেওয়া হবে — টাকা তোলা হয়ে থাকলেও। ফলে তাদের ব্যালেন্স শূন্যের নিচে নেমে ঋণাত্মক হতে
            পারে।
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              বাতিল
            </Button>
            <Button
              variant="destructive"
              onClick={() => void deleteSelected()}
              disabled={bulkBusy}
            >
              {bulkBusy ? "মুছে ফেলা হচ্ছে…" : "স্থায়ীভাবে মুছুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The story as a reader sees it. The one money decision lives at the foot of this dialog. */}
      <Dialog open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {previewing && (
            <>
              <DialogHeader>
                <DialogTitle>{previewing.title}</DialogTitle>
                <DialogDescription>
                  {previewing.category?.title_bn ?? "শ্রেণি নেই"} · {STATUS_LABELS[previewing.status] ?? previewing.status} ·{" "}
                  {previewing.is_anonymous
                    ? "নাম প্রকাশে অনিচ্ছুক"
                    : previewing.author
                      ? previewing.author.display_name?.trim() || `@${previewing.author.username}`
                      : "লেখক নেই"}
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{previewing.excerpt}</p>
              {previewing.hero_media_key && (
                <AuthedMediaImage
                  mediaId={previewing.hero_media_key}
                  alt={previewing.title}
                  className="w-full rounded-lg border object-cover"
                />
              )}
              <div className="article-body text-sm leading-7">
                {/* A preview of something not necessarily published: fetch pictures with the token. */}
                <RichTextContent
                  markdown={previewing.body}
                  Image={AuthedMediaImage}
                />
              </div>
              {(previewing.article_media ?? [])
                .slice()
                .sort((a, b) => a.position - b.position)
                .filter(
                  (item) =>
                    item.media_id !== previewing.hero_media_key &&
                    !previewInlineMedia.includes(item.media_id),
                )
                .map((item) => (
                  <AuthedMediaImage
                    key={item.media_id}
                    mediaId={item.media_id}
                    alt={previewing.title}
                    className="w-full rounded-lg border object-cover"
                  />
                ))}

              {/* The story's automatic earnings, read-only: the formula credited the fee at publish
                  and the settlements keep adding view income. Corrections belong to the wallet's
                  adjustment tool, not to the story. */}
              <div className="sticky bottom-0 flex flex-col items-end gap-2 pt-2">
                {earningMessage && (
                  <p className="text-sm text-destructive" role="alert">
                    {earningMessage}
                  </p>
                )}
                {earningsLoaded && (
                  <div className="w-full rounded-lg border bg-background p-4 shadow-lg">
                    <p className="text-sm font-medium">আয়: {bnMoney(income)}</p>
                    {feeBreakdown && (
                      <p className="mt-1 text-xs text-muted-foreground">{feeBreakdown}</p>
                    )}
                    {viewsTotal > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        ভিউ আয়: {bnMoney(viewsTotal)} ({bn(viewCount)}টি ভিউ)
                      </p>
                    )}
                    {bonusTotal > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        বোনাস: {bnMoney(bonusTotal)}
                      </p>
                    )}
                    {penaltyTotal < 0 && (
                      <p className="mt-1 text-xs text-destructive">
                        জরিমানা: {bnMoney(penaltyTotal)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
