/**
 * Phase 5 Read Tracker — invisible component that records a content view
 * in the user's localStorage reading history. Mount once per detail page.
 */
"use client";

import { useEffect } from "react";
import { recordRead } from "@/lib/personalization";
import type { ContentWithRelations } from "@/types";

export function ReadTracker({ content }: { content: ContentWithRelations }) {
  useEffect(() => {
    recordRead({
      contentId: content.id,
      slug: content.slug,
      categorySlug: content.category?.slug ?? null,
    });
  }, [content.id, content.slug, content.category?.slug]);

  return null;
}
