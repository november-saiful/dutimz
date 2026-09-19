"use client";

import { useState, useEffect, useRef, useCallback } from "react";


interface SearchResult {
  type: "user" | "category" | "tag" | "content";
  id: string;
  title: string;
  subtitle: string;
  tab: string;
}

const COPY = {
  placeholder: "ব্যবহারকারী, বিভাগ, ট্যাগ বা কন্টেন্ট খুঁজুন…",
  users: "ব্যবহারকারী",
  categories: "বিভাগ",
  tags: "ট্যাগ",
  content: "কন্টেন্ট",
  noResults: "কোনো ফলাফল পাওয়া যায়নি।",
  typeToSearch: "অন্তত ২ অক্ষর লিখুন…",
} as const;

const TYPE_ICONS: Record<string, string> = {
  user: "👤",
  category: "📁",
  tag: "🏷️",
  content: "📰",
};

const TYPE_LABELS: Record<string, string> = {
  user: "ব্যবহারকারী",
  category: "বিভাগ",
  tag: "ট্যাগ",
  content: "কন্টেন্ট",
};

interface Props {
  onNavigate: (tab: string) => void;
}

export function AdminSearchBar({ onNavigate }: Props) {
  const t = COPY;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
        setSelectedIndex(-1);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        const result = results[selectedIndex];
        if (result) {
          handleSelect(result);
        }
      } else if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    },
    [open, results, selectedIndex],
  );

  function handleSelect(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    onNavigate(result.tab);
  }

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  const hasResults = results.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-lg">
      {/* Search input */}
      <div className="relative">
        {/* Search icon */}
        <svg
          className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40 pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.length >= 2 && results.length > 0) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t.placeholder}
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 pl-10 pr-10 text-sm outline-none placeholder:text-neutral-400 focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900 transition-colors"
        />

        {/* Loading spinner or clear button */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <svg className="h-4 w-4 animate-spin opacity-40" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                setOpen(false);
                inputRef.current?.focus();
              }}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      {/* Results dropdown */}
      {open && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-xl shadow-lg"
          style={{
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            backdropFilter: "blur(20px) saturate(180%)",
          }}
        >
          {!hasResults && !loading && (
            <div className="p-4 text-center text-xs opacity-50">
              {query.length < 2 ? t.typeToSearch : t.noResults}
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              {/* Section header */}
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">
                  {TYPE_LABELS[type] ?? type}
                </span>
              </div>

              {/* Results */}
              {items.map((result) => {
                const globalIdx = results.indexOf(result);
                const isSelected = globalIdx === selectedIndex;
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-[var(--md-sys-color-primary)]/10"
                        : "hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <span className="text-base shrink-0">{TYPE_ICONS[result.type]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{result.title}</p>
                      <p className="text-[10px] opacity-40 truncate">{result.subtitle}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold opacity-50"
                      style={{ background: "var(--md-sys-color-primary-container)" }}
                    >
                      {TYPE_LABELS[result.type]}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
