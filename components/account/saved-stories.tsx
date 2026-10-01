"use client";

import Link from "next/link";

import { SignInButton } from "@/components/auth/sign-in-button";
import { StoryCard } from "@/components/dashboard/story-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSavedStories } from "@/lib/use-saved-stories";

export function SavedStories() {
  const { state, stories, message } = useSavedStories();

  if (state === "loading") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (state === "signed-out") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-3 pt-6">
          <strong>সংরক্ষিত খবর দেখতে প্রবেশ করুন</strong>
          <p className="text-sm text-muted-foreground">
            বুকমার্ক করা খবর আপনার অ্যাকাউন্টের সঙ্গে সংরক্ষিত থাকে।
          </p>
          <SignInButton />
        </CardContent>
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          {message}
        </CardContent>
      </Card>
    );
  }

  if (!stories.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-lg">
            ▱
          </span>
          <strong>এখনো কোনো প্রতিবেদন সংরক্ষণ করেননি</strong>
          <p className="text-sm text-muted-foreground">
            খবরের পাতায় বুকমার্ক চিহ্ন চাপলে সেটি এখানে পাবেন।
          </p>
          <Button variant="link" asChild>
            <Link href="/">খবর পড়ুন →</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stories.map((story) => (
        <StoryCard key={story.id} story={story} />
      ))}
    </div>
  );
}
