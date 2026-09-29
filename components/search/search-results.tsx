"use client";

import * as React from "react";

import { StoryCard } from "@/components/dashboard/story-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { one, supabaseBrowser, type Story } from "@/lib/supabase";

type CategoryInfo = { slug: string; title_bn: string };

function categoryOf(story: Story): CategoryInfo {
  return (
    one(story.category as CategoryInfo | CategoryInfo[] | null) ?? {
      slug: "campus",
      title_bn: "ক্যাম্পাস",
    }
  );
}

export function SearchResults({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = React.useState(initialQuery);
  const [results, setResults] = React.useState<Story[] | null>(null);
  const [searched, setSearched] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const run = React.useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setResults(null);
      setSearched(null);
      return;
    }
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase.rpc("search_public_articles", {
        p_query: trimmed,
        p_limit: 30,
      });
      if (error) {
        setResults([]);
      } else {
        setResults((data ?? []) as unknown as Story[]);
      }
      setSearched(trimmed);
    } catch {
      setResults([]);
      setSearched(trimmed);
    } finally {
      setBusy(false);
    }
  }, []);

  React.useEffect(() => {
    if (initialQuery.trim()) void run(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const params = new URLSearchParams(window.location.search);
          if (query.trim()) params.set("q", query.trim());
          else params.delete("q");
          window.history.replaceState(
            {},
            "",
            `${window.location.pathname}?${params.toString()}`,
          );
          void run(query);
        }}
      >
        <label htmlFor="search-page-input" className="sr-only">
          সংবাদ খুঁজুন
        </label>
        <Input
          id="search-page-input"
          name="q"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="যেমন: ক্যাম্পাস, সংস্কৃতি, শিক্ষার্থী…"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "খুঁজছে…" : "খুঁজুন ⌕"}
        </Button>
      </form>

      {searched !== null && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          “{searched}” খোঁজার ফলাফল
          {results !== null &&
            ` — ${new Intl.NumberFormat("bn-BD").format(results.length)}টি প্রতিবেদন`}
        </p>
      )}

      {results !== null &&
        (results.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((article) => (
              <StoryCard key={article.id} story={article} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border p-8 text-center">
            <strong>এই খোঁজে কোনো খবর পাওয়া যায়নি</strong>
            <p className="mt-1 text-sm text-muted-foreground">
              বানান ঠিক আছে কি না দেখে আবার চেষ্টা করুন।
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
