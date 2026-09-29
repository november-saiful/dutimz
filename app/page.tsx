import Link from "next/link";
import { BarChart3 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { ThroughputChart } from "@/components/dashboard/throughput-chart";
import {
  PreviewStoryCard,
  RecommendedItem,
  StoryArt,
  StoryCard,
} from "@/components/dashboard/story-card";
import {
  getDashboardStats,
  getLatestStories,
  isDemoMode,
  previewStories,
} from "@/lib/stories";
import { CATEGORIES, mediaUrlFor } from "@/lib/site";
import { storyCategory, type Story } from "@/lib/supabase";
import type { PreviewStory } from "@/lib/stories";

export const revalidate = 30;

export default async function HomePage() {
  const demo = isDemoMode();
  const stories = demo ? [] : await getLatestStories(25);
  const stats = await getDashboardStats(stories);
  const featured = demo ? previewStories[0] : stories[0] ?? null;
  const side: (Story | PreviewStory)[] = demo
    ? previewStories.slice(1)
    : stories.slice(1, 7);
  const breaking = (demo ? previewStories : stories).slice(0, 5).map((s) => ({
    href: `/news/${"slug" in s ? s.slug : ""}/`,
    title: s.title,
  }));

  // The desk-wide counts (reports, sections, authors, comments) live in the
  // admin dashboard, not on the public homepage: they answer an editorial
  // question, not a reader one. The homepage keeps the flow chart and the
  // recent-activity feed, which still read from the same stats object.
  return (
    <DutimzShell title="স্বাগতম" breaking={breaking}>
      {/* Featured hero */}
      {featured && (
        <Card className="overflow-hidden">
          <Link
            href={`/news/${featured.slug}/`}
            aria-label={`পড়ুন: ${featured.title}`}
          >
            {"hero_media_key" in featured ? (
              <StoryArt
                slug={storyCategory(featured).slug}
                imageUrl={
                  featured.hero_media_key
                    ? mediaUrlFor(featured.hero_media_key)
                    : null
                }
                title={featured.title}
                className="aspect-[21/9] w-full"
              />
            ) : (
              <StoryArt
                slug={
                  "categorySlug" in featured ? featured.categorySlug : "campus"
                }
                imageUrl={"imageUrl" in featured ? featured.imageUrl : null}
                title={featured.title}
                className="aspect-[21/9] w-full"
              />
            )}
          </Link>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge>
                {"categorySlug" in featured
                  ? featured.category
                  : storyCategory(featured).title_bn}
              </Badge>
              <span className="text-xs text-muted-foreground">
                নির্বাচিত প্রতিবেদন
              </span>
            </div>
            <CardTitle className="text-2xl leading-snug">
              <Link href={`/news/${featured.slug}/`} className="hover:underline">
                {featured.title}
              </Link>
            </CardTitle>
            <CardDescription className="text-sm">
              {featured.excerpt}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Throughput chart (App1 Task throughput → প্রকাশনা প্রবাহ) */}
      <Card>
        <CardHeader>
          <CardTitle>প্রকাশনা প্রবাহ</CardTitle>
          <CardDescription>
            গত আট সপ্তাহে প্রকাশিত প্রতিবেদনের ধারা
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.weekly.length ? (
            <ThroughputChart data={stats.weekly} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {demo
                ? "প্রিভিউ সংস্করণে প্রবাহ চিত্র নেই।"
                : "এখনো পর্যাপ্ত প্রকাশনার তথ্য নেই।"}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active projects → সাম্প্রতিক প্রতিবেদন */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>সাম্প্রতিক প্রতিবেদন</CardTitle>
                <CardDescription>ক্যাম্পাসের খবর</CardDescription>
              </div>
              <Button variant="link" asChild>
                <Link href="/search">সব খবর দেখুন →</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {side.length === 0 && (
              <p className="text-sm text-muted-foreground">
                প্রথম প্রতিবেদনটি আসছে। সম্পাদকীয় ডেস্কের যাচাই করা খবর এখানে
                দেখানো হবে।
              </p>
            )}
            {side.slice(0, 4).map((story) =>
              "categorySlug" in story ? (
                <PreviewStoryCard key={story.slug} story={story} />
              ) : (
                <StoryCard key={story.id} story={story} />
              ),
            )}
          </CardContent>
        </Card>

        {/* Recent activity → real publishes */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>সাম্প্রতিক কার্যক্রম</CardTitle>
              <CardDescription>সর্বশেষ প্রকাশনা</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.recentActivity.length ? (
                <ol className="flex flex-col gap-4">
                  {stats.recentActivity.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">
                          {entry.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">
                          <span className="font-medium">{entry.name}</span>{" "}
                          <span className="text-muted-foreground">
                            {entry.action}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.time}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {demo
                    ? "প্রিভিউ সংস্করণে কার্যক্রম নেই।"
                    : "নতুন প্রতিবেদন এলে এখানে দেখানো হবে।"}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>আরও পড়ুন</CardTitle>
              <CardDescription>পাঠকের পছন্দ</CardDescription>
            </CardHeader>
            <CardContent>
              {!demo && stories.length > 1 ? (
                stories
                  .slice(1, 7)
                  .map((story) => (
                    <RecommendedItem key={story.id} story={story} />
                  ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  নতুন প্রতিবেদন এলে এখানে দেখানো হবে।
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {CATEGORIES.filter((c) => c.slug !== "all")
                  .slice(0, 3)
                  .map((c) => (
                    <Button key={c.slug} variant="outline" size="sm" asChild>
                      <Link href={`/category/${c.slug}`}># {c.label}</Link>
                    </Button>
                  ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="size-5 text-muted-foreground" />
                আপনার গল্পটিও বলুন
              </CardTitle>
              <CardDescription>
                ঢাকা বিশ্ববিদ্যালয়ের যেকোনো শিক্ষার্থী বা পাঠক নিজের প্রতিবেদন
                পাঠাতে পারেন।
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/account/write">প্রতিবেদন পাঠান ↗</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Below-fold full feed for crawlers + readers */}
      {side.length > 4 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {side.slice(4).map((story) =>
            "categorySlug" in story ? (
              <PreviewStoryCard
                key={story.slug}
                story={story}
                rank={side.indexOf(story) + 1}
              />
            ) : (
              <StoryCard key={story.id} story={story} />
            ),
          )}
        </div>
      )}
    </DutimzShell>
  );
}
