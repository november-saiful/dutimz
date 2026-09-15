'use client';

import { useState, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';
import type { Category } from '@/types';

const CONTENT_TYPES = [
  { value: 'news', label: 'সংবাদ', labelEn: 'News' },
  { value: 'article', label: 'নিবন্ধ', labelEn: 'Article' },
  { value: 'documentary', label: 'প্রামাণ্যচিত্র', labelEn: 'Documentary' },
] as const;

export interface SearchFilters {
  contentType: string | null;
  categoryId: string | null;
}

interface SearchFilterProps {
  categories: Category[];
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
}

export function SearchFilter({ categories, filters, onFiltersChange }: SearchFilterProps) {
  const [localType, setLocalType] = useState<string | null>(filters.contentType);
  const [localCategory, setLocalCategory] = useState<string | null>(filters.categoryId);

  // Sync with external filters
  useEffect(() => {
    setLocalType(filters.contentType);
    setLocalCategory(filters.categoryId);
  }, [filters.contentType, filters.categoryId]);

  const activeCount = (localType !== null ? 1 : 0) + (localCategory !== null ? 1 : 0);

  const handleApply = () => {
    onFiltersChange({ contentType: localType, categoryId: localCategory });
  };

  const handleReset = () => {
    setLocalType(null);
    setLocalCategory(null);
    onFiltersChange({ contentType: null, categoryId: null });
  };

  const toggleType = (value: string) => {
    setLocalType((prev) => (prev === value ? null : value));
  };

  const toggleCategory = (id: string) => {
    setLocalCategory((prev) => (prev === id ? null : id));
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'nav-icon-btn',
              activeCount > 0 && 'bg-[var(--md-sys-color-primary)]/10 text-[var(--md-sys-color-primary)]',
            )}
          />
        }
      >
        {/* Filter icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[var(--md-sys-color-primary)] text-[9px] font-bold text-white">
            {activeCount}
          </span>
        )}
        <span className="sr-only">ফিল্টার</span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 overflow-hidden rounded-3xl border-neutral-100 bg-white p-5 shadow-lg dark:border-neutral-800 dark:bg-neutral-950"
      >
        <div className="flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                ফিল্টার
              </span>
              <p className="text-[11px] font-medium text-neutral-400">
                ধরন ও বিভাগ অনুযায়ী ফিল্টার করুন
              </p>
            </div>
            {activeCount > 0 && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-neutral-400 transition-colors hover:text-red-500"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                রিসেট
              </button>
            )}
          </div>

          {/* Content type filter */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-neutral-400">ধরন</span>
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => toggleType(ct.value)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                    localType === ct.value
                      ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary)]/10 text-[var(--md-sys-color-primary)]'
                      : 'border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600',
                  )}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category filter */}
          {categories.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-neutral-400">বিভাগ</span>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
                      localCategory === cat.id
                        ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary)]/10 text-[var(--md-sys-color-primary)]'
                        : 'border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600',
                    )}
                  >
                    {cat.name_bn}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Apply button */}
          <button
            onClick={handleApply}
            className="w-full rounded-xl bg-[var(--md-sys-color-primary)] px-4 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
          >
            ফিল্টার প্রয়োগ করুন
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
