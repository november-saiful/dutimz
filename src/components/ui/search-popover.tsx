'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  SearchIcon,
  Loader2Icon,
  XIcon,
  NewspaperIcon,
  FilmIcon,
  BookOpenIcon,
  EyeIcon,
  ClockIcon,
  Trash2Icon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from 'cn';
import { Highlight } from '@/components/ui/highlight';
import type { Category, ContentWithRelations } from '@/types';

/* ── constants ────────────────────────────────────────────────────── */

const RECENT_KEY = 'dutimz_recent_searches';
const MAX_RECENT = 6;

const TYPE_ICONS: Record<string, typeof NewspaperIcon> = {
  news: NewspaperIcon,
  article: BookOpenIcon,
  documentary: FilmIcon,
};

const TYPE_COLORS: Record<string, string> = {
  news: 'text-[#5f2367] bg-[#5f2367]/10 dark:text-[#dbbce0] dark:bg-[#5f2367]/20',
  article: 'text-[#a370a0] bg-[#a370a0]/10 dark:text-[#dbbce0] dark:bg-[#a370a0]/20',
  documentary: 'text-[#5f2367] bg-[#5f2367]/10 dark:text-[#dbbce0] dark:bg-[#5f2367]/20',
};

/* ── recent-search helpers (localStorage) ─────────────────────────── */

function loadRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return;
  const prev = loadRecent().filter((q) => q !== trimmed);
  prev.unshift(trimmed);
  localStorage.setItem(RECENT_KEY, JSON.stringify(prev.slice(0, MAX_RECENT)));
}

function clearRecent() {
  localStorage.removeItem(RECENT_KEY);
}

/* ── hooks ────────────────────────────────────────────────────────── */

const useDebounce = (value: string, delay: number = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

/* ── component ────────────────────────────────────────────────────── */

interface Props {
  categories?: Category[];
}

const SearchPopover = ({ categories = [] }: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [results, setResults] = useState<ContentWithRelations[]>([]);
  const [total, setTotal] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounce(inputValue);

  // Load recent searches on mount
  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const performSearch = useCallback(async (query: string, categoryId?: string | null) => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setTotal(0);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      let url = `/api/search?q=${encodeURIComponent(q)}&limit=8`;
      if (categoryId) {
        url += `&category=${encodeURIComponent(categoryId)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setResults(data.items ?? []);
        setTotal(data.total ?? 0);
        // Save successful query to history
        saveRecent(q);
        setRecent(loadRecent());
      } else {
        setResults([]);
        setTotal(0);
      }
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    performSearch(debouncedSearch, selectedCategoryId);
  }, [debouncedSearch, selectedCategoryId, performSearch]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim().length >= 2) {
      saveRecent(inputValue.trim());
      setOpen(false);
      router.push(`/search?q=${encodeURIComponent(inputValue.trim())}`);
    }
  };

  // Auto-focus the input whenever the dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      // Small delay to let the dialog animate in
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Reset state when closing
      setInputValue('');
      setResults([]);
      setTotal(0);
      setHasSearched(false);
    }
  };

  const handleClear = () => {
    setInputValue('');
    setResults([]);
    setTotal(0);
    setHasSearched(false);
    setSelectedCategoryId(null);
    inputRef.current?.focus();
  };

  const handleClearHistory = () => {
    clearRecent();
    setRecent([]);
  };

  const handleRecentClick = (query: string) => {
    setInputValue(query);
  };

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategoryId((prev) => (prev === categoryId ? null : categoryId));
  };

  const showRecent = !inputValue && recent.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="nav-icon-btn"
          />
        }
      >
        <SearchIcon className="size-5" />
        <span className="sr-only">খুঁজুন</span>
      </DialogTrigger>

      <DialogBackdrop />
      <DialogPopup className="p-0">
        <div className="mx-4 max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex flex-col gap-5 p-6">
            {/* Category filter */}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedCategoryId(null)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-semibold transition-all',
                    !selectedCategoryId
                      ? 'bg-[#5f2367] text-white dark:bg-[#dbbce0] dark:text-[#5f2367]'
                      : 'border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800',
                  )}
                >
                  সব
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryToggle(cat.id)}
                    className={cn(
                      'rounded-full px-3 py-1 text-[11px] font-semibold transition-all',
                      selectedCategoryId === cat.id
                        ? 'bg-[#5f2367] text-white dark:bg-[#dbbce0] dark:text-[#5f2367]'
                        : 'border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800',
                    )}
                  >
                    {cat.name_bn}
                  </button>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3.5 text-neutral-400">
                <SearchIcon className="size-4" />
              </div>
              <Input
                ref={inputRef}
                type="text"
                placeholder="সংবাদ খুঁজুন..."
                value={inputValue}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setInputValue(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                className="h-12 rounded-xl border border-neutral-200 bg-neutral-50 px-10 text-sm font-medium transition-all outline-none placeholder:text-neutral-400 focus-visible:border-[var(--md-sys-color-primary)] focus-visible:ring-0 focus-visible:ring-offset-0 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-visible:border-[var(--md-sys-color-primary)]"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                {isSearching ? (
                  <Loader2Icon className="size-4 animate-spin text-[#5f2367]" />
                ) : (
                  inputValue && (
                    <button
                      onClick={handleClear}
                      className="group rounded-lg p-1.5 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      <XIcon className="size-3.5 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200" />
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Recent searches */}
            {showRecent && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs tracking-tight text-neutral-400">
                    সাম্প্রতিক অনুসন্ধান
                  </span>
                  <button
                    onClick={handleClearHistory}
                    className="flex items-center gap-1 text-[10px] font-medium text-neutral-400 transition-colors hover:text-red-500"
                  >
                    <Trash2Icon className="size-2.5" />
                    মুছুন
                  </button>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {recent.map((query) => (
                    <li key={query}>
                      <button
                        onClick={() => handleRecentClick(query)}
                        className="flex items-center gap-1.5 rounded-full border border-neutral-100 bg-neutral-50 px-3 py-1.5 text-[11px] font-medium text-neutral-600 transition-all hover:bg-neutral-100 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                      >
                        <ClockIcon className="size-2.5 shrink-0 text-neutral-400" />
                        {query}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Results header */}
            {inputValue && (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs tracking-tight text-neutral-400">
                  অনুসন্ধান ফলাফল
                </span>
                {hasSearched && !isSearching && (
                  <span className="text-[10px] font-bold text-neutral-400/60">
                    {total} টি
                  </span>
                )}
              </div>
            )}

            {/* Results list */}
            <ul className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
              {results.length > 0 ? (
                results.map((item) => {
                  const TypeIcon = TYPE_ICONS[item.content_type] ?? NewspaperIcon;
                  const typeColor = TYPE_COLORS[item.content_type] ?? TYPE_COLORS.news;
                  const href = item.content_type === 'documentary'
                    ? `/documentaries/${item.slug}`
                    : item.content_type === 'article'
                      ? `/articles/${item.slug}`
                      : `/news/${item.slug}`;

                  return (
                    <li key={item.id}>
                      <Link
                        href={href}
                        className="group flex items-start gap-3 rounded-2xl p-2.5 transition-all hover:bg-neutral-50 dark:hover:bg-neutral-900"
                      >
                        {item.thumbnail_url ? (
                          <img
                            src={item.thumbnail_url}
                            alt={item.thumbnail_alt ?? item.title_bn}
                            className="size-9 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <div
                            className={cn(
                              'flex size-9 shrink-0 items-center justify-center rounded-lg border border-transparent transition-all group-hover:scale-105',
                              typeColor,
                            )}
                          >
                            <TypeIcon className="size-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-1 text-[13px] font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                            <Highlight text={item.title_bn} query={inputValue} />
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            {item.category && (
                              <span className="text-[10px] font-medium text-[#a370a0]">
                                <Highlight text={item.category.name_bn} query={inputValue} />
                              </span>
                            )}
                            <span className="flex items-center gap-0.5 text-[10px] text-neutral-400">
                              <EyeIcon className="size-2.5" />
                              {item.view_count.toLocaleString('bn-BD')}
                            </span>
                          </div>
                        </div>
                        {item.is_breaking && (
                          <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-500">
                            ব্রেকিং
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })
              ) : (
                hasSearched &&
                !isSearching && (
                  <li className="py-10 text-center">
                    <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-3xl border border-neutral-100 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
                      <SearchIcon className="size-5 text-neutral-300 dark:text-neutral-700" />
                    </div>
                    <p className="text-sm font-bold text-neutral-400">
                      কোনো ফলাফল পাওয়া যায়নি
                    </p>
                    <p className="text-xs font-medium tracking-tight text-neutral-500">
                      অন্য কীওয়ার্ড দিয়ে চেষ্টা করুন
                    </p>
                  </li>
                )
              )}
            </ul>

            {/* View full search link */}
            {hasSearched && (
              <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <Link
                  href={`/search?q=${encodeURIComponent(inputValue)}`}
                  onClick={() => { if (inputValue.trim()) saveRecent(inputValue.trim()); setOpen(false); }}
                  className="block text-center text-xs font-semibold text-[#5f2367] transition-colors hover:text-[#a370a0] dark:text-[#dbbce0]"
                >
                  {results.length > 0 ? `সব ${total} টি ফলাফল দেখুন →` : 'সব ফলাফল দেখুন →'}
                </Link>
              </div>
            )}
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
};

export default SearchPopover;
