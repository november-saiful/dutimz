"use client";

import Link from "next/link";
import * as React from "react";

import {
  storyItemFromPreview,
  storyItemFromStory,
  storyUrl,
  type StoryItem,
} from "@/components/dashboard/story-blocks";
import { StoryArt } from "@/components/dashboard/story-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import { Select } from "@/components/ui/select";
import { reportError } from "@/lib/errors";
import { previewStories } from "@/lib/preview";
import { CATEGORIES, bn } from "@/lib/site";
import { isSupabaseConfigured, supabaseBrowser, type Story } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/*
  The whole archive on one page.

  The public archive used to be `/search/` with an empty query, which lists the
  newest reports and nothing else: no order but newest-first, no window in time,
  no count. This page reads the same published rows — directly from the browser
  under the readers' own RLS policies, the way the search page does — but lets
  the reader narrow by desk and by period and choose the order.

  The first page arrives with the cached HTML (the page is prerendered), so a
  reader who opens `/news/` gets the newest reports without a request. The
  browser only asks the database again once a control changes, which keeps a
  default visit as cheap as any other section page. The chosen filters live in
  the address (`?desk=campus&range=week&sort=oldest`) so a filtered archive can
  be shared or reloaded without being rebuilt.
*/

const PAGE_SIZE = 24;

const ARTICLE_SELECT =
  "id,slug,title,excerpt,published_at,updated_at,is_anonymous,hero_media_key,interview_kind,category:categories!inner(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url)";

type Range = "all" | "today" | "week" | "month";
type Sort = "newest" | "updated" | "oldest";

const RANGES: { value: Range; label: string }[] = [
  { value: "all", label: "সব সময়" },
  { value: "today", label: "আজ" },
  { value: "week", label: "৭ দিন" },
  { value: "month", label: "৩০ দিন" },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "সর্বশেষ প্রকাশিত" },
  { value: "updated", label: "সর্বশেষ সম্পাদিত" },
  { value: "oldest", label: "পুরোনো আগে" },
];

const RANGE_LABELS = Object.fromEntries(
  RANGES.map((entry) => [entry.value, entry.label]),
) as Record<Range, string>;

/**
 * The preview fixtures have no publication dates, so a demo build can only
 * answer an all-time archive; a narrower window is honestly empty.
 */
function demoArchive(desk: string | null, range: Range, sort: Sort): StoryItem[] {
  if (range !== "all") return [];
  const rows = previewStories
    .map(storyItemFromPreview)
    .filter((item) => !desk || item.sectionSlug === desk);
  return sort === "oldest" ? rows.slice().reverse() : rows;
}

/** The oldest instant a window admits; `null` means the whole archive. */
function sinceFor(range: Range): Date | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "today") {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    return midnight;
  }
  const days = range === "week" ? 7 : 30;
  return new Date(now.getTime() - days * 86_400_000);
}

function isRange(value: string | null): value is Range {
  return RANGES.some((entry) => entry.value === value);
}

function isSort(value: string | null): value is Sort {
  return SORTS.some((entry) => entry.value === value);
}

export function NewsArchive({
  sections,
  initialStories,
  initialTotal,
}: {
  /** The live desks, read once by the page so the chips match the top bar. */
  sections: { slug: string; label: string }[];
  /** The newest page, prerendered with the page. */
  initialStories: Story[];
  /** How many published reports exist, for the count and the first "more" test. */
  initialTotal: number;
}) {
  const demo = !isSupabaseConfigured();
  const desks = React.useMemo(
    () => (sections.length ? sections : CATEGORIES).filter((section) => section.slug !== "all"),
    [sections],
  );
  const initialRows = React.useMemo(
    () =>
      demo
        ? demoArchive(null, "all", "newest")
        : initialStories.map(storyItemFromStory),
    [demo, initialStories],
  );

  const [rows, setRows] = React.useState<StoryItem[]>(initialRows);
  const [total, setTotal] = React.useState(
    demo ? initialRows.length : initialTotal,
  );
  const [hasMore, setHasMore] = React.useState(
    demo ? false : initialTotal > initialRows.length,
  );
  const [desk, setDesk] = React.useState<string | null>(null);
  const [range, setRange] = React.useState<Range>("all");
  const [sort, setSort] = React.useState<Sort>("newest");
  const [busy, setBusy] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  // The newest request wins: a slow page that lands after a filter changed
  // must not paint rows the reader no longer asked for.
  const ticket = React.useRef(0);
  const firstRun = React.useRef(true);
  const needsFetch = React.useRef(false);

  const fetchPage = React.useCallback(
    async (
      offset: number,
    ): Promise<{ rows: StoryItem[]; total: number }> => {
      if (demo) {
        const all = demoArchive(desk, range, sort);
        return {
          rows: all.slice(offset, offset + PAGE_SIZE),
          total: all.length,
        };
      }
      let query = supabaseBrowser()
        .from("articles")
        .select(ARTICLE_SELECT, { count: "exact" })
        .eq("status", "published");
      if (desk) query = query.eq("category.slug", desk);
      const since = sinceFor(range);
      if (since) query = query.gte("published_at", since.toISOString());
      const primary = sort === "updated" ? "updated_at" : "published_at";
      const { data, error, count } = await query
        .order(primary, { ascending: sort === "oldest", nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      return {
        rows: ((data ?? []) as unknown as Story[]).map(storyItemFromStory),
        total: count ?? 0,
      };
    },
    [demo, desk, range, sort],
  );

  const loadFirstPage = React.useCallback(async () => {
    const current = ++ticket.current;
    setBusy(true);
    try {
      const page = await fetchPage(0);
      if (current !== ticket.current) return;
      setRows(page.rows);
      setTotal(page.total);
      setHasMore(page.total > page.rows.length);
      setFailed(false);
    } catch (error) {
      if (current !== ticket.current) return;
      reportError("news archive", error);
      setRows([]);
      setTotal(0);
      setHasMore(false);
      setFailed(true);
    } finally {
      if (current === ticket.current) setBusy(false);
    }
  }, [fetchPage]);

  async function loadMore() {
    if (loadingMore) return;
    const current = ++ticket.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(rows.length);
      if (current !== ticket.current) return;
      setRows((existing) => {
        const seen = new Set(existing.map((row) => row.id));
        return [...existing, ...page.rows.filter((row) => !seen.has(row.id))];
      });
      setTotal(page.total);
      setHasMore(rows.length + page.rows.length < page.total);
    } catch (error) {
      if (current !== ticket.current) return;
      reportError("news archive", error);
      setFailed(true);
    } finally {
      if (current === ticket.current) setLoadingMore(false);
    }
  }

  // The address is read once on mount. The controls render their defaults in
  // the cached HTML, so a shared filtered link is applied a frame later rather
  // than mismatching hydration.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deskParam = params.get("desk");
    if (deskParam && desks.some((section) => section.slug === deskParam)) {
      setDesk(deskParam);
      needsFetch.current = true;
    }
    const rangeParam = params.get("range");
    if (isRange(rangeParam)) {
      setRange(rangeParam);
      if (rangeParam !== "all") needsFetch.current = true;
    }
    const sortParam = params.get("sort");
    if (isSort(sortParam)) {
      setSort(sortParam);
      if (sortParam !== "newest") needsFetch.current = true;
    }
    setReady(true);
    // Mount only: later changes come from the controls below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    if (firstRun.current) {
      firstRun.current = false;
      // The prerendered page already is the default view.
      if (!needsFetch.current) return;
    }
    void loadFirstPage();
  }, [ready, desk, range, sort, loadFirstPage]);

  React.useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams();
    if (desk) params.set("desk", desk);
    if (range !== "all") params.set("range", range);
    if (sort !== "newest") params.set("sort", sort);
    const search = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}`,
    );
  }, [ready, desk, range, sort]);

  const activeDesk = desks.find((section) => section.slug === desk) ?? null;

  function clearFilters() {
    setDesk(null);
    setRange("all");
    setSort("newest");
  }

  return (
    <div data-news-archive className="flex flex-col gap-5">
      <section
        aria-label="সংবাদ ফিল্টার"
        className="flex flex-col gap-4 rounded-[24px] border border-border/80 bg-card p-4 shadow-sm sm:p-5"
      >
        <div role="group" aria-label="বিভাগ" className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted-foreground">বিভাগ</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <FilterChip active={!desk} onClick={() => setDesk(null)}>
              সব খবর
            </FilterChip>
            {desks.map((section) => (
              <FilterChip
                key={section.slug}
                active={desk === section.slug}
                onClick={() =>
                  setDesk(desk === section.slug ? null : section.slug)
                }
              >
                {section.label}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div role="group" aria-label="সময়" className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground">সময়</p>
            <div className="flex flex-wrap gap-2">
              {RANGES.map((entry) => (
                <FilterChip
                  key={entry.value}
                  active={range === entry.value}
                  onClick={() => setRange(entry.value)}
                >
                  {entry.label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="news-sort"
              className="text-xs font-semibold text-muted-foreground"
            >
              সাজান
            </label>
            <Select
              id="news-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="h-9 w-[190px] bg-card text-xs font-semibold"
            >
              {SORTS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      <div
        aria-live="polite"
        className="flex flex-wrap items-baseline justify-between gap-2"
      >
        <p className="text-sm text-muted-foreground">
          {activeDesk ? `${activeDesk.label} বিভাগ` : "সব বিভাগ"}
          {range !== "all" && ` · ${RANGE_LABELS[range]}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {busy
            ? "লোড হচ্ছে…"
            : `${bn(total)}টি প্রতিবেদন${
                rows.length < total
                  ? ` · ${bn(rows.length)}টি দেখানো হচ্ছে`
                  : ""
              }`}
        </p>
      </div>

      {failed ? (
        <div
          className="rounded-[24px] border p-8 text-center"
          role="status"
        >
          <strong>প্রতিবেদন আনতে পারা যাচ্ছে না</strong>
          <p className="mt-1 text-sm text-muted-foreground">
            সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => void loadFirstPage()}
          >
            আবার চেষ্টা করুন
          </Button>
        </div>
      ) : rows.length > 0 ? (
        <>
          <div
            aria-busy={busy}
            className={cn(
              "grid gap-5 sm:grid-cols-2 xl:grid-cols-3",
              busy && "opacity-60",
            )}
          >
            {rows.map((item) => (
              <ArchiveCard key={item.id} item={item} />
            ))}
          </div>
          {hasMore && (
            <Button
              type="button"
              variant="outline"
              className="mx-auto"
              disabled={loadingMore || busy}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "লোড হচ্ছে…" : "আরও দেখুন"}
            </Button>
          )}
        </>
      ) : busy ? (
        <div
          aria-hidden
          className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-lg border bg-card"
            >
              <div className="aspect-video w-full animate-pulse bg-muted" />
              <div className="flex flex-col gap-3 p-4">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border p-10 text-center">
          <strong>এই ফিল্টারে কোনো প্রতিবেদন নেই</strong>
          <p className="mt-1 text-sm text-muted-foreground">
            {demo && range !== "all"
              ? "প্রিভিউ সংস্করণে সময়ভিত্তিক ফিল্টার খালি থাকে।"
              : "বিভাগ বা সময়ের সীমা বদলে আবার দেখুন।"}
          </p>
          {(desk || range !== "all" || sort !== "newest") && (
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={clearFilters}
            >
              সব ফিল্টার মুছুন
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** A pill that is both a control and a state, like the front page's desk strip. */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/80 bg-card text-foreground hover:border-foreground/30 hover:bg-muted/50",
      )}
    >
      {children}
    </button>
  );
}

/** One report in the archive grid: the same shape as the home page's cards. */
function ArchiveCard({ item }: { item: StoryItem }) {
  const url = storyUrl(item);
  return (
    <Card className="overflow-hidden">
      <Link href={url} aria-label={`পড়ুন: ${item.title}`}>
        <StoryArt
          imageUrl={item.image}
          title={item.title}
          className="aspect-video w-full"
        />
      </Link>
      <CardContent className="flex flex-col gap-2 pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href={`/category/${item.sectionSlug}/`}
            className="font-medium text-primary hover:underline"
          >
            {item.section}
          </Link>
          <span aria-hidden>·</span>
          <RelativeTime value={item.publishedAt} fallback={item.when} />
        </div>
        <h2 className="text-base font-semibold leading-snug">
          <Link href={url} className="hover:underline">
            {item.title}
          </Link>
        </h2>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {item.excerpt}
        </p>
        <div className="text-xs text-muted-foreground">
          {item.bylineHref ? (
            <Link href={item.bylineHref} className="hover:underline">
              {item.byline}
            </Link>
          ) : (
            <span>{item.byline}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
