"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import {
  IconArrowRight,
  IconBookmark,
  IconChartBar,
  IconFileText,
  IconHome,
  IconInfoCircle,
  IconLoader2,
  IconNews,
  IconPencil,
  IconScale,
  IconSearch,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { reportError } from "@/lib/errors";
import type { SearchHit, SearchResponse } from "@/lib/search";
import { CATEGORIES } from "@/lib/site";

/*
  The header search control: a palette that opens on click or ⌘K/Ctrl+K and
  searches the published archive through /api/search (the same RPC the search
  page uses), while still offering the site's sections and pages as shortcuts.

  It replaces the old inline header field, which could only push the reader to a
  separate results page and could never show an article without a round trip.
*/

type PageLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const PAGES: PageLink[] = [
  { href: "/", label: "সব খবর", icon: IconHome },
  { href: "/statistics/", label: "পরিসংখ্যান", icon: IconChartBar },
  { href: "/saved/", label: "সংরক্ষিত প্রতিবেদন", icon: IconBookmark },
  { href: "/account/", label: "আমার ড্যাশবোর্ড", icon: IconUser },
  { href: "/account/write/", label: "প্রতিবেদন লিখুন", icon: IconPencil },
  { href: "/corrections/", label: "সংশোধন ও তথ্য যাচাই", icon: IconScale },
  { href: "/about/", label: "আমাদের পরিচয়", icon: IconInfoCircle },
  { href: "/guidelines/", label: "সম্পাদকীয় নীতিমালা", icon: IconUsers },
];

const DEBOUNCE_MS = 180;

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [demo, setDemo] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);
  const [activeValue, setActiveValue] = React.useState("");

  const term = query.trim().toLowerCase();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /*
    The archive query is debounced and aborted on every keystroke: without the
    abort, a slow response for "ক্য" could land after the one for "ক্যাম্পাস"
    and replace good results with stale ones.
  */
  React.useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setUnavailable(false);
      setLoading(false);
      return;
    }
    setUnavailable(false);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // The slashed path is this site's canonical shape (trailingSlash: true),
        // so asking for `/api/search?q=` would only cost a 308 per keystroke.
        const response = await fetch(
          `/api/search/?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`Search request failed (${response.status})`);
        }
        const payload = (await response.json()) as SearchResponse;
        setHits(payload.results ?? []);
        setDemo(Boolean(payload.demo));
        setUnavailable(Boolean(payload.unavailable));
        if (payload.unavailable) reportError("command palette search", new Error("Archive search unavailable"));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          reportError("command palette search", error);
          setHits([]);
          setUnavailable(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      setHits([]);
      setUnavailable(false);
      router.push(href);
    },
    [router],
  );

  const matches = React.useCallback(
    (haystack: string) => !term || haystack.toLowerCase().includes(term),
    [term],
  );

  const categories = CATEGORIES.filter(
    (category) =>
      category.slug !== "all" && matches(`${category.label} ${category.slug}`),
  );
  const pages = PAGES.filter((page) => matches(`${page.label} ${page.href}`));
  const searching = Boolean(term) && loading && !hits.length;
  const nothingFound =
    Boolean(term) && !unavailable && !hits.length && !categories.length && !pages.length;

  /*
    Keep the highlighted row on the best match. Results arrive after a debounce,
    so the row that was highlighted is usually gone by the time the new ones
    render; cmdk keeps its pointer at the removed row and highlights nothing,
    which makes Enter a no-op until an arrow key moves the selection. Whenever
    the set of rows changes the highlight returns to the top row — which is the
    newest article once a response lands, not the shortcut that was highlighted
    while the archive was still being queried.
  */
  const itemValues = [
    ...hits.map((hit) => hit.title),
    ...(term ? [`সব ফলাফল ${query.trim()}`] : []),
    ...categories.map((category) => category.label),
    ...pages.map((page) => page.label),
  ];
  const itemKey = itemValues.join("|");
  React.useEffect(() => {
    setActiveValue(itemValues[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="খবর খুঁজুন"
        aria-haspopup="dialog"
        className="hidden h-9 w-44 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:flex xl:w-56"
      >
        <IconSearch className="size-4 shrink-0" />
        <span className="truncate">খবর খুঁজুন…</span>
        <CommandShortcut className="hidden xl:inline">⌘K</CommandShortcut>
      </button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="খবর খুঁজুন"
        aria-haspopup="dialog"
        className="lg:hidden"
        onClick={() => setOpen(true)}
      >
        <IconSearch className="size-4" />
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
            setHits([]);
            setUnavailable(false);
            setActiveValue("");
          }
        }}
        label="খবর খুঁজুন"
        commandProps={{ value: activeValue, onValueChange: setActiveValue }}
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="খবর, বিভাগ বা পাতা খুঁজুন…"
          aria-label="খবর খুঁজুন"
        />
        <CommandList>
          {hits.length > 0 && (
            <CommandGroup heading={demo ? "প্রিভিউ প্রতিবেদন" : "প্রতিবেদন"}>
              {hits.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={hit.title}
                  onSelect={() => go(`/news/${hit.slug}/`)}
                >
                  <IconNews className="size-4 shrink-0 text-muted-foreground group-data-[selected=true]/command-item:text-primary" />
                  <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {hit.category}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {searching && (
            <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <IconLoader2 className="size-4 animate-spin" />
              খোঁজা হচ্ছে…
            </p>
          )}
          {unavailable && !loading && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground" role="status">
              প্রতিবেদন খোঁজা যাচ্ছে না। আবার চেষ্টা করুন।
            </p>
          )}
          {nothingFound && !searching && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              “{query.trim()}” — কোনো কিছু পাওয়া যায়নি।
            </p>
          )}

          {term && (
            <>
              <CommandSeparator />
              <CommandGroup heading="আরও">
                <CommandItem
                  value={`সব ফলাফল ${query.trim()}`}
                  onSelect={() =>
                    go(`/search?q=${encodeURIComponent(query.trim())}`)
                  }
                >
                  <IconArrowRight className="size-4 shrink-0 text-muted-foreground group-data-[selected=true]/command-item:text-primary" />
                  <span className="min-w-0 flex-1 truncate">
                    “{query.trim()}” — সব ফলাফল দেখুন
                  </span>
                </CommandItem>
              </CommandGroup>
            </>
          )}

          {categories.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="সংবাদ বিভাগ">
                {categories.map((category) => (
                  <CommandItem
                    key={category.slug}
                    value={category.label}
                    onSelect={() => go(`/category/${category.slug}/`)}
                  >
                    <IconFileText className="size-4 shrink-0 text-muted-foreground group-data-[selected=true]/command-item:text-primary" />
                    <span className="min-w-0 flex-1 truncate">
                      {category.label}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {pages.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="পাতা">
                {pages.map((page) => (
                  <CommandItem
                    key={page.href}
                    value={page.label}
                    onSelect={() => go(page.href)}
                  >
                    <page.icon className="size-4 shrink-0 text-muted-foreground group-data-[selected=true]/command-item:text-primary" />
                    <span className="min-w-0 flex-1 truncate">
                      {page.label}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
