'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SearchForm } from '@/components/content/SearchForm';
import { SearchResultList } from '@/components/content/SearchResultList';
import { SearchFilter, type SearchFilters } from '@/components/ui/search-filter';
import type { ContentWithRelations, Category } from '@/types';

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get('q') ?? '';

  const [results, setResults] = useState<ContentWithRelations[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({
    contentType: searchParams.get('type'),
    categoryId: searchParams.get('category'),
  });

  // Load categories
  useEffect(() => {
    fetch('/api/categories')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const fetchResults = useCallback(async (q: string, f: SearchFilters) => {
    if (!q || q.length < 2) {
      setResults([]);
      setTotal(0);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ q, limit: '24' });
      if (f.contentType) params.set('type', f.contentType);
      if (f.categoryId) params.set('category', f.categoryId);

      const res = await fetch(`/api/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.items ?? []);
        setTotal(data.total ?? 0);
      } else {
        setResults([]);
        setTotal(0);
      }
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (query) fetchResults(query, filters);
  }, [query, filters, fetchResults]);

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    // Update URL without reload
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (newFilters.contentType) params.set('type', newFilters.contentType);
    if (newFilters.categoryId) params.set('category', newFilters.categoryId);
    router.replace(`/search?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="container mt-10 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold flex-1">খুঁজুন</h1>
        {query && (
          <SearchFilter
            categories={categories}
            filters={filters}
            onFiltersChange={handleFiltersChange}
          />
        )}
      </div>

      <SearchForm initialQuery={query} />

      {query && (
        <div className="mt-8">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="relative size-6">
                <div className="absolute inset-0 rounded-full border-2 border-neutral-200 dark:border-neutral-800" />
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--md-sys-color-primary)]" />
              </div>
              <p className="text-xs text-neutral-400">অনুসন্ধান হচ্ছে…</p>
            </div>
          ) : results.length > 0 ? (
            <>
              <p className="mb-4 text-sm opacity-60">
                &ldquo;{query}&rdquo; — {total} টি ফলাফল পাওয়া গেছে
                {filters.contentType && (
                  <span className="ml-1 text-[var(--md-sys-color-primary)] font-semibold">
                    ({CONTENT_TYPE_LABELS[filters.contentType] ?? filters.contentType})
                  </span>
                )}
              </p>
              <SearchResultList items={results} query={query} />
            </>
          ) : (
            <div className="glass-card p-8 text-center">
              <p className="text-lg opacity-50">কোনো ফলাফল পাওয়া যায়নি।</p>
              <p className="mt-2 text-sm opacity-40">ভিন্ন কীওয়ার্ড দিয়ে চেষ্টা করুন।</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  news: 'সংবাদ',
  article: 'নিবন্ধ',
  documentary: 'প্রামাণ্যচিত্র',
};
