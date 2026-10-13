"use client";

import * as React from "react";

import { reportError } from "@/lib/errors";
import { mediaUrlFor, spotlightMediaUrlFor } from "@/lib/site";
import { freshAccessToken } from "@/lib/supabase";
import type { MediaScope } from "@/lib/richtext";
import { cn } from "@/lib/utils";

/**
 * An article image that is not public yet.
 *
 * A published story's pictures resolve for anyone, so the news page can point an `<img>` at the
 * media host directly. An unpublished story's pictures resolve only for their owner and the desk,
 * and the media Worker authenticates with an `Authorization: Bearer` header — which a plain image
 * request cannot send. So the picture is fetched on the client with the reader's live token, turned
 * into an object URL, and revoked when it leaves. Without a valid session it stays a placeholder.
 */
export function AuthedMediaImage({
  mediaId,
  alt,
  className,
  scope = "article",
}: {
  mediaId: string;
  alt: string;
  className?: string;
  /** Spotlight pictures live in their own bucket and are served from their own path. */
  scope?: MediaScope;
}) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const token = await freshAccessToken();
        if (!token || cancelled) return;
        const response = await fetch(
          scope === "spotlight"
            ? spotlightMediaUrlFor(mediaId)
            : mediaUrlFor(mediaId),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok || cancelled) return;
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (err) {
        reportError("pending article image", err);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId, scope]);

  if (!url) {
    return (
      <div
        aria-hidden
        className={cn("min-h-40 w-full animate-pulse rounded-lg border bg-muted", className)}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
