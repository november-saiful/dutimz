"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";

import { SignInButton } from "@/components/auth/sign-in-button";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTimeBn } from "@/lib/site";
import { storyCategory } from "@/lib/supabase";
import { useSavedStories } from "@/lib/use-saved-stories";

/** The header shows a taste of the list; the /saved page renders the rest. */
const PREVIEW_LIMIT = 5;

function storyHref(slug: string): string {
  return `/news/${encodeURIComponent(slug)}`;
}

export function SavedPopover() {
  const { state, stories, message } = useSavedStories(PREVIEW_LIMIT);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="সংরক্ষিত প্রতিবেদন">
          <Bookmark />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[340px] max-w-[calc(100vw-2rem)] p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">সংরক্ষিত প্রতিবেদন</p>
          <PopoverClose asChild>
            <Link
              href="/saved"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              সব দেখুন
            </Link>
          </PopoverClose>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-1">
          {state === "loading" && (
            <div className="flex flex-col gap-1 p-1">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          )}

          {state === "signed-out" && (
            <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
              <p className="text-sm font-medium">সংরক্ষিত খবর দেখতে প্রবেশ করুন</p>
              <p className="text-xs text-muted-foreground">
                বুকমার্ক করা খবর আপনার অ্যাকাউন্টের সঙ্গে সংরক্ষিত থাকে।
              </p>
              <SignInButton />
            </div>
          )}

          {state === "error" && (
            <p className="px-3 py-6 text-center text-xs text-destructive">
              {message}
            </p>
          )}

          {state === "ready" && stories.length === 0 && (
            <div className="flex flex-col items-center gap-1 px-3 py-6 text-center">
              <p className="text-sm font-medium">এখনো কোনো প্রতিবেদন সংরক্ষণ করেননি</p>
              <p className="text-xs text-muted-foreground">
                প্রতিবেদনের বুকমার্ক চিহ্ন চাপলে সেটি এখানে পাবেন।
              </p>
            </div>
          )}

          {state === "ready" &&
            stories.map((story) => (
              <PopoverClose key={story.id} asChild>
                <Link
                  href={storyHref(story.slug)}
                  className="flex flex-col gap-1 rounded-md p-2 transition-colors hover:bg-accent"
                >
                  <span className="line-clamp-2 text-sm font-medium leading-snug">
                    {story.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {storyCategory(story).title_bn} · {relativeTimeBn(story.published_at)}
                  </span>
                </Link>
              </PopoverClose>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
