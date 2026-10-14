"use client";

import * as React from "react";

import { StoryCard } from "@/components/dashboard/story-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TopicSelector } from "@/components/search/topic-selector";
import { reportError } from "@/lib/errors";
import { CATEGORY_NAMES } from "@/lib/site";
import { one, supabaseBrowser, type Story } from "@/lib/supabase";

type CategoryInfo = { slug: string; title_bn: string };

/** One screenful at a time; "আরও দেখুন" appends the next page. */
const PAGE_SIZE = 30;

function categoryOf(story: Story): CategoryInfo {
  return (
    one(story.category as CategoryInfo | CategoryInfo[] | null) ?? {
      slug: "campus",
      title_bn: "ক্যাম্পাস",
    }
  );
}

export function SearchResults({
  initialQuery,
  initialDesk,
}: {
  initialQuery: string;
  initialDesk: string | null;
}) {
  const [query, setQuery] = React.useState(initialQuery);
  // A desk chip filters the archive server-side by slug; typing a query
  // clears it, so the two modes never combine into a confusing hybrid.
  const [desk, setDesk] = React.useState<string | null>(initialDesk);
  const [results, setResults] = React.useState<Story[] | null>(null);
  const [searched, setSearched] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [searchFailed, setSearchFailed] = React.useState(false);

  const run = React.useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setResults(null);
      setSearched(null);
      setSearchFailed(false);
      return;
    }
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase.rpc("search_public_articles", {
        p_query: trimmed,
        p_limit: PAGE_SIZE,
      });
      if (error) {
        reportError("article search", error);
        setResults([]);
        setSearchFailed(true);
      } else {
        setResults((data ?? []) as unknown as Story[]);
        setSearchFailed(false);
      }
      setSearched(trimmed);
    } catch (err) {
      reportError("article search", err);
      setResults([]);
      setSearchFailed(true);
      setSearched(trimmed);
    } finally {
      setBusy(false);
    }
  }, []);

  // The archive: an empty query lists the newest published reports instead of
  // an empty form, so `/search/` is the "সব প্রতিবেদন" collection the footer
  // and the front page's latest band link to.
  const loadArchive = React.useCallback(
    async (offset: number, category: string | null) => {
      const { data, error } = await supabaseBrowser().rpc("list_public_articles", {
        p_limit: PAGE_SIZE,
        p_offset: offset,
        p_category_slug: category,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Story[];
    },
    [],
  );

  const runArchive = React.useCallback(
    async (category: string | null) => {
      setBusy(true);
      setSearched(null);
      try {
        const rows = await loadArchive(0, category);
        setResults(rows);
        setHasMore(rows.length === PAGE_SIZE);
        setSearchFailed(false);
      } catch (err) {
        reportError("article archive", err);
        setResults([]);
        setSearchFailed(true);
      } finally {
        setBusy(false);
      }
    },
    [loadArchive],
  );

  async function loadMore() {
    if (!results) return;
    setLoadingMore(true);
    try {
      const rows = await loadArchive(results.length, desk);
      setResults((current) => {
        const seen = new Set((current ?? []).map((story) => story.id));
        return [...(current ?? []), ...rows.filter((story) => !seen.has(story.id))];
      });
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      reportError("article archive", err);
      setSearchFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  React.useEffect(() => {
    if (initialQuery.trim()) void run(initialQuery);
    else void runArchive(initialDesk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitQuery(raw: string) {
    const trimmed = raw.trim();
    const params = new URLSearchParams(window.location.search);
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    params.delete("desk");
    setDesk(null);
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
    if (trimmed) void run(trimmed);
    else void runArchive(null);
  }

  // A desk chip filters the archive by slug; tapping the active chip clears
  // back to the whole archive. The text field is cleared so the two modes
  // never read as combined.
  function selectDesk(slug: string) {
    const next = desk === slug ? null : slug;
    setDesk(next);
    setQuery("");
    const params = new URLSearchParams(window.location.search);
    params.delete("q");
    if (next) params.set("desk", next);
    else params.delete("desk");
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
    void runArchive(next);
  }

  const isArchive = searched === null;

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submitQuery(query);
        }}
      >
        <Field
          label="সংবাদ খুঁজুন"
          htmlFor="search-page-input"
          hideLabel
          className="min-w-0 flex-1"
        >
          <Input
            id="search-page-input"
            name="q"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="যেমন: ক্যাম্পাস, সংস্কৃতি, শিক্ষার্থী…"
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "খুঁজছে…" : "খুঁজুন ⌕"}
        </Button>
      </form>

      {/* Visual Topic Picker matching Mockup */}
      <TopicSelector selectedDesk={desk} onSelectDesk={selectDesk} />

      {searched !== null && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          “{searched}” খোঁজার ফলাফল
          {results !== null &&
            ` — ${new Intl.NumberFormat("bn-BD").format(results.length)}টি প্রতিবেদন`}
        </p>
      )}
      {isArchive && results !== null && !searchFailed && results.length > 0 && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {desk && CATEGORY_NAMES[desk] ? `${CATEGORY_NAMES[desk]} ডেস্কের প্রতিবেদন` : "সর্বশেষ প্রতিবেদন"} —{" "}
          {new Intl.NumberFormat("bn-BD").format(results.length)}টি দেখানো হচ্ছে
        </p>
      )}

      {searchFailed && (
        <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground" role="status">
          খবর খোঁজা যাচ্ছে না। আবার চেষ্টা করুন।
        </p>
      )}
      {results !== null && !searchFailed &&
        (results.length ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((article) => (
                <StoryCard key={article.id} story={article} />
              ))}
            </div>
            {!isArchive && results.length === PAGE_SIZE && (
              <p className="text-center text-sm text-muted-foreground">
                প্রথম {new Intl.NumberFormat("bn-BD").format(PAGE_SIZE)}টি দেখানো
                হচ্ছে — আরও নির্দিষ্ট করে খুঁজুন।
              </p>
            )}
            {isArchive && hasMore && (
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
          </>
        ) : (
          <div className="rounded-lg border p-8 text-center">
            <strong>
              {isArchive ? "এখনো কোনো প্রতিবেদন প্রকাশিত হয়নি" : "এই খোঁজে কোনো খবর পাওয়া যায়নি"}
            </strong>
            <p className="mt-1 text-sm text-muted-foreground">
              {isArchive
                ? "সম্পাদকীয় ডেস্কের যাচাই করা খবর এখানে দেখানো হবে।"
                : "বানান ঠিক আছে কি না দেখে আবার চেষ্টা করুন।"}
            </p>
          </div>
        ))}
      <SearchCategoryShim check={categoryOf} />
    </div>
  );
}

function SearchCategoryShim({
  check,
}: {
  check: (story: Story) => CategoryInfo;
}) {
  void check;
  return null;
}
