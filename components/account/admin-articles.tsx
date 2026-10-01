"use client";

import * as React from "react";
import { CalendarClock, Eye, EyeOff, Pencil, Search } from "lucide-react";

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
import { errorMessage } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase";
import { bn, formatDateBn } from "@/lib/site";

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
};

type Member = { id: string; username: string; display_name: string };

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

  // The edit dialog holds the whole body, so it is its own state rather than a field on the row.
  const [editing, setEditing] = React.useState<Article | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editExcerpt, setEditExcerpt] = React.useState("");
  const [editBody, setEditBody] = React.useState("");
  const [editReason, setEditReason] = React.useState("");

  // Byline and dateline travel together in one desk operation.
  const [publishing, setPublishing] = React.useState<Article | null>(null);
  const [byline, setByline] = React.useState("keep");
  const [authorQuery, setAuthorQuery] = React.useState("");
  const [authorMatches, setAuthorMatches] = React.useState<Member[]>([]);
  const [author, setAuthor] = React.useState<Member | null>(null);
  const [publishDate, setPublishDate] = React.useState("");
  const [publishReason, setPublishReason] = React.useState("");

  // Taking a story down (or putting it back) is its own audited decision.
  const [deciding, setDeciding] = React.useState<Article | null>(null);
  const [decideReason, setDecideReason] = React.useState("");

  const load = React.useCallback(async (nextStatus: string, nextQuery: string) => {
    try {
      const supabase = supabaseBrowser();
      let request = supabase
        .from("articles")
        .select(
          "id,slug,title,excerpt,body,status,is_anonymous,published_at,created_at,category:categories(slug,title_bn),author:profiles!articles_author_id_fkey(username,display_name)",
        )
        .order("created_at", { ascending: false })
        .limit(60);
      // Either filter is optional, and PostgREST lets both narrow the same request.
      if (nextStatus !== "all") request = request.eq("status", nextStatus);
      if (nextQuery.trim()) request = request.ilike("title", `%${nextQuery.trim()}%`);
      const { data, error: loadError } = await request;
      if (loadError) {
        setError(
          errorMessage("admin articles", loadError, "প্রতিবেদনের তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।"),
        );
        return;
      }
      setArticles((data as unknown as Article[]) ?? []);
    } catch (err) {
      setError(errorMessage("admin articles", err, "প্রতিবেদনের তালিকা লোড করা যায়নি। আবার চেষ্টা করুন।"));
    }
  }, []);

  React.useEffect(() => {
    void load(status, query);
    // Re-runs when the filter changes; the search box submits explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function openEditor(article: Article) {
    setEditing(article);
    setEditTitle(article.title);
    setEditExcerpt(article.excerpt);
    setEditBody(article.body);
    setEditReason("");
  }

  async function saveEdit() {
    if (!editing) return;
    setError("");
    setNotice("");
    if (editReason.trim().length < 3) {
      setError("সম্পাদনার কারণ লিখুন (অন্তত ৩ অক্ষর)।");
      return;
    }
    setBusy(`edit-${editing.id}`);
    try {
      const { error: saveError } = await supabaseBrowser().rpc("admin_update_article", {
        p_article_id: editing.id,
        p_title: editTitle.trim(),
        p_excerpt: editExcerpt.trim(),
        p_body: editBody,
        p_reason: editReason.trim(),
      });
      if (saveError) {
        setError(errorMessage("article edit", saveError, "প্রতিবেদন সম্পাদনা করা যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      setNotice("প্রতিবেদন সংরক্ষিত হয়েছে।");
      setEditing(null);
      await load(status, query);
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
    setPublishReason("");
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
    if (publishReason.trim().length < 3) {
      setError("পরিবর্তনের কারণ লিখুন (অন্তত ৩ অক্ষর)।");
      return;
    }
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
        p_reason: publishReason.trim(),
      });
      if (publishError) {
        setError(
          errorMessage("article publication", publishError, "বাইলাইন বা তারিখ সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"),
        );
        return;
      }
      setNotice("বাইলাইন ও প্রকাশের তারিখ সংরক্ষিত হয়েছে।");
      setPublishing(null);
      await load(status, query);
    } catch (err) {
      setError(errorMessage("article publication", err, "বাইলাইন বা তারিখ সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(null);
    }
  }

  async function decideStatus(article: Article, next: "published" | "rejected") {
    setError("");
    setNotice("");
    if (decideReason.trim().length < 3) {
      setError("সিদ্ধান্তের কারণ লিখুন (অন্তত ৩ অক্ষর)।");
      return;
    }
    setBusy(`status-${article.id}`);
    try {
      const { error: statusError } = await supabaseBrowser().rpc("admin_set_article_status", {
        p_article_id: article.id,
        p_status: next,
        p_reason: decideReason.trim(),
      });
      if (statusError) {
        setError(errorMessage("article status", statusError, "প্রতিবেদনের অবস্থা বদলানো যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      setNotice(next === "published" ? "প্রতিবেদন প্রকাশ করা হয়েছে।" : "প্রতিবেদন প্রকাশ থেকে সরানো হয়েছে।");
      setDeciding(null);
      await load(status, query);
    } catch (err) {
      setError(errorMessage("article status", err, "প্রতিবেদনের অবস্থা বদলানো যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(null);
    }
  }

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
      <Card>
        <CardHeader>
          <CardTitle>প্রতিবেদন ({countLabel(articles.length)}টি)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            className="flex items-start gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void load(status, query);
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
          <Table aria-label="প্রতিবেদনের তালিকা">
            <TableHeader>
              <TableRow>
                <TableHead>প্রতিবেদন</TableHead>
                <TableHead>অবস্থা</TableHead>
                <TableHead className="hidden md:table-cell">লেখক</TableHead>
                <TableHead className="hidden lg:table-cell">প্রকাশ</TableHead>
                <TableHead className="w-32">
                  <span className="sr-only">পদক্ষেপ</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {articles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    এই ছাঁকনিতে কোনো প্রতিবেদন নেই।
                  </TableCell>
                </TableRow>
              )}
              {articles.map((article) => {
                const live = article.status === "published";
                return (
                  <TableRow key={article.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{article.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {article.category?.title_bn ?? "শ্রেণি নেই"} · /{article.slug}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(article.status)}>
                        {STATUS_LABELS[article.status] ?? article.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {article.is_anonymous
                        ? "নাম প্রকাশে অনিচ্ছুক"
                        : article.author
                          ? article.author.display_name?.trim() || `@${article.author.username}`
                          : "—"}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                      {article.published_at ? formatDateBn(article.published_at) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
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
                          onClick={() => {
                            setDeciding(article);
                            setDecideReason("");
                          }}
                          aria-label={live ? `${article.title} প্রকাশ থেকে সরান` : `${article.title} প্রকাশ করুন`}
                          title={live ? "প্রকাশ থেকে সরান" : "প্রকাশ করুন"}
                        >
                          {live ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
            <Field label="সম্পাদনার কারণ" htmlFor="edit-reason" hint="কারণ অডিট লগে সংরক্ষিত হয়।">
              <Textarea
                id="edit-reason"
                value={editReason}
                rows={2}
                minLength={3}
                maxLength={500}
                onChange={(event) => setEditReason(event.target.value)}
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
            <Field label="পরিবর্তনের কারণ" htmlFor="pub-reason" hint="কারণ অডিট লগে সংরক্ষিত হয়।">
              <Textarea
                id="pub-reason"
                value={publishReason}
                rows={2}
                minLength={3}
                maxLength={500}
                onChange={(event) => setPublishReason(event.target.value)}
              />
            </Field>
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
          <Field label="সিদ্ধান্তের কারণ" htmlFor="decide-reason" hint="কারণ অডিট লগে সংরক্ষিত হয়।">
            <Textarea
              id="decide-reason"
              value={decideReason}
              rows={2}
              minLength={3}
              maxLength={500}
              onChange={(event) => setDecideReason(event.target.value)}
            />
          </Field>
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
    </div>
  );
}
