import { reportError } from "./errors";
import { freshAccessToken } from "./supabase";

/*
  Telling the server that a desk action changed what readers see.

  The reading surfaces are cached — see `export const revalidate` in app/page.tsx,
  app/news/[slug]/page.tsx, app/category/[slug]/page.tsx and app/sitemap.ts — which is what keeps a
  reader's request from paying for a React render, and what stopped Cloudflare answering 503 (error
  1102, "Worker exceeded resource limits") to the front page and to every article.

  A cached page is only correct while something says it changed, and the desk is that something: it
  knows an approval happened and nothing else does. `app/api/revalidate/route.ts` verifies the
  caller and performs the invalidation, so the list of surfaces stays on the server and an
  unauthenticated request cannot force every reader's next visit into a render.

  Failure is deliberately quiet. The mutation has already landed in the database by the time this
  runs, and a page that is up to a minute old is a smaller problem than a desk action reporting
  failure because its invalidation call could not be made — the page's own revalidate window is the
  backstop. What is *not* quiet is the shape of the call sites: every desk action that changes
  published content calls this, which tests/cache-config.test.mjs holds to that list.
*/
export async function revalidateReaders(): Promise<void> {
  try {
    const token = await freshAccessToken();
    if (!token) {
      // Nobody signed in means no mutation of this kind either; nothing to report.
      return;
    }
    const response = await fetch("/api/revalidate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      reportError("desk revalidation", new Error(`HTTP ${response.status}`));
    }
  } catch (error) {
    reportError("desk revalidation", error);
  }
}
