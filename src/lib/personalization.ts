/**
 * Phase 5 Personalization Engine — tracks reading history in localStorage,
 * derives interest weights per category, and recommends content based on
 * those interests. No server-side state needed for the basic version.
 */

const HISTORY_KEY = "dutimz-reading-history";
const MAX_HISTORY = 50;

export interface ReadingEntry {
  contentId: string;
  slug: string;
  categorySlug: string | null;
  readAt: number; // timestamp
  timeSpent: number; // seconds (estimated)
}

/** Get the reading history from localStorage. */
export function getReadingHistory(): ReadingEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Record a content view in reading history. */
export function recordRead(entry: Omit<ReadingEntry, "readAt" | "timeSpent"> & { timeSpent?: number }) {
  if (typeof window === "undefined") return;
  const history = getReadingHistory();
  // Deduplicate by contentId — keep the latest
  const filtered = history.filter((h) => h.contentId !== entry.contentId);
  filtered.unshift({
    ...entry,
    readAt: Date.now(),
    timeSpent: entry.timeSpent ?? 0,
  });
  // Trim to max
  const trimmed = filtered.slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}

/** Clear reading history. */
export function clearReadingHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
}

/**
 * Derive interest weights per category from reading history.
 * Recent reads and longer time spent = higher weight.
 */
export function getCategoryInterests(): Map<string, number> {
  const history = getReadingHistory();
  const weights = new Map<string, number>();
  const now = Date.now();

  for (const entry of history) {
    if (!entry.categorySlug) continue;
    const ageDays = (now - entry.readAt) / 86_400_000;
    // Exponential decay: recent reads matter more
    const recency = Math.exp(-ageDays / 7); // half-life ~5 days
    // Time bonus: articles read longer get more weight
    const timeBonus = Math.min(entry.timeSpent / 60, 2); // cap at 2 min
    const score = recency * (1 + timeBonus * 0.3);

    weights.set(entry.categorySlug, (weights.get(entry.categorySlug) ?? 0) + score);
  }

  return weights;
}

/**
 * Get the top N category slugs the user is most interested in.
 */
export function getTopInterests(n = 3): string[] {
  const weights = getCategoryInterests();
  return [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([slug]) => slug);
}

/**
 * Check if the user has already read a specific content item.
 */
export function hasRead(contentId: string): boolean {
  return getReadingHistory().some((h) => h.contentId === contentId);
}

/**
 * Get recently read content IDs (for excluding from recommendations).
 */
export function getRecentlyReadIds(limit = 10): string[] {
  return getReadingHistory()
    .slice(0, limit)
    .map((h) => h.contentId);
}
