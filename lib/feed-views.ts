/*
  One request for every card on the page.

  Each card's count is a `.news-score` that refreshes itself on mount, and ten cards mounting in
  the same commit must not mean ten reads: this module gathers the ids requested in one tick and
  sends them as a single summary call, then hands every waiter the one answer. It deliberately
  keeps no cache — a stale stored count is exactly what the refresh exists to replace.
*/
type Resolver = (counts: Map<string, number>) => void;

let pending = new Set<string>();
let waiting: Resolver[] = [];
let scheduled: number | null = null;

export function requestFeedViews(ids: string[]): Promise<Map<string, number>> {
  for (const id of ids) if (id) pending.add(id);
  return new Promise((resolve) => {
    waiting.push(resolve);
    if (scheduled === null) {
      scheduled = window.setTimeout(flush, 0);
    }
  });
}

async function flush(): Promise<void> {
  scheduled = null;
  const ids = [...pending];
  const queue = waiting;
  pending = new Set();
  waiting = [];

  const counts = new Map<string, number>();
  try {
    const response = await fetch(
      `/api/views/summary?ids=${ids.map(encodeURIComponent).join(",")}`,
      { cache: "no-store" },
    );
    if (response.ok) {
      const body = (await response.json()) as {
        counts?: Record<string, unknown>;
      };
      for (const [id, value] of Object.entries(body.counts ?? {})) {
        const views = Number(value);
        if (Number.isFinite(views)) counts.set(id, views);
      }
    }
  } catch {
    // A failed refresh leaves the server-rendered number in place, never a gap.
  }
  for (const resolve of queue) resolve(counts);
}
