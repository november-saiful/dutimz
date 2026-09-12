/**
 * Phase 5 Personalization Hook — client-side reading tracking and
 * recommendation helpers. Wraps the personalization.ts utilities
 * with React state and effects.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  recordRead,
  getTopInterests,
  hasRead,
  getReadingHistory,
  type ReadingEntry,
} from "@/lib/personalization";
import type { ContentWithRelations } from "@/types";

/** Track that a content item was viewed. Call on mount of detail pages. */
export function useTrackRead(content: ContentWithRelations) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    recordRead({
      contentId: content.id,
      slug: content.slug,
      categorySlug: content.category?.slug ?? null,
    });
  }, [content.id, content.slug, content.category?.slug]);
}

/** Get personalized content recommendations from a list of all content. */
export function useRecommendations(
  allContent: ContentWithRelations[],
  limit = 6,
): ContentWithRelations[] {
  const [recs, setRecs] = useState<ContentWithRelations[]>([]);

  useEffect(() => {
    const interests = getTopInterests(3);
    if (interests.length === 0) {
      // No history — show popular content
      const popular = [...allContent]
        .filter((c) => c.status === "published")
        .sort((a, b) => b.view_count - a.view_count)
        .slice(0, limit);
      setRecs(popular);
      return;
    }

    // Score each content by category interest match + recency + views
    const scored = allContent
      .filter((c) => c.status === "published" && !hasRead(c.id))
      .map((c) => {
        const catScore = c.category?.slug
          ? interests.indexOf(c.category.slug) >= 0
            ? 3 - interests.indexOf(c.category.slug) // Higher score for top interests
            : 0
          : 0;
        const recencyScore = c.published_at
          ? Math.max(0, 1 - (Date.now() - new Date(c.published_at).getTime()) / (7 * 86_400_000))
          : 0;
        const viewScore = Math.min(c.view_count / 1000, 2);
        return { item: c, score: catScore * 3 + recencyScore + viewScore };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.item);

    setRecs(scored);
  }, [allContent, limit]);

  return recs;
}

/** Get the user's reading history. */
export function useReadingHistory(): ReadingEntry[] {
  const [history, setHistory] = useState<ReadingEntry[]>([]);

  useEffect(() => {
    setHistory(getReadingHistory());
  }, []);

  return history;
}

/** Get top interests as a simple array. */
export function useInterests(): string[] {
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    setInterests(getTopInterests(5));
  }, []);

  return interests;
}
