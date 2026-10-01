import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleActions } from "@/components/article/article-actions";
import { Comments } from "@/components/article/comments";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { RecommendedItem, StoryArt } from "@/components/dashboard/story-card";
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
import {
  CATEGORIES,
  SITE_URL,
  bn,
  formatDateBn,
  mediaUrlFor,
} from "@/lib/site";
import {
  getLatestStories,
  getSitemapArticles,
  getStoryBySlug,
} from "@/lib/stories";
import {
  ANONYMOUS_BYLINE,
  one,
  storyCategory,
  storyCredit,
} from "@/lib/supabase";

export const revalidate = 60;

/**
 * How many of the newest stories are laid down at build time.
 *
 * Bounded because prerendering is a build-time cost, and unnecessary for freshness: see below.
 */
const PRERENDERED_STORIES = 50;

/**
 * Prerender the newest stories, which is what makes the `revalidate` above mean anything.
 *
 * For a dynamic segment the `revalidate` export on its own does nothing: without
 * `generateStaticParams` Next classifies the route `ƒ (Dynamic)` and renders it from the
 * database on every single request, which is the state this route shipped in while still
 * declaring a 60 second window. Only a bounded slice is listed because that is enough to cover
 * the pages that take nearly all the traffic, and `dynamicParams` keeps its default, so any
 * other published slug is still rendered on demand and then cached by the same window.
 */
export async function generateStaticParams() {
  const articles = await getSitemapArticles(PRERENDERED_STORIES);
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getStoryBySlug(slug);
  if (!article) return { title: "প্রতিবেদন পাওয়া যায়নি" };
  const url = `/news/${encodeURIComponent(article.slug)}/`;
  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: `${article.title} | DUTIMZ`,
      description: article.excerpt,
      url,
      publishedTime: article.published_at,
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getStoryBySlug(slug);
  if (!article) notFound();

  const category = storyCategory(article);
  const credit = storyCredit(article);
  const paragraphs = article.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const gallery = (article.article_media ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((item) => item.media_id !== article.hero_media_key);
  const images = [
    article.hero_media_key,
    ...gallery.map((item) => item.media_id),
  ]
    .filter((key): key is string => Boolean(key))
    .map((key) => mediaUrlFor(key));

  const related = (await getLatestStories(10)).filter(
    (story) => story.id !== article.id,
  );
  const sameCategory = related.filter(
    (story) => storyCategory(story).slug === category.slug,
  );
  const recommended = (sameCategory.length ? sameCategory : related).slice(0, 5);

  return (
    <DutimzShell
      title={article.title}
      crumbs={[
        { label: category.title_bn, href: `/category/${category.slug}` },
        { label: article.title },
      ]}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>
                  <Link href={`/category/${category.slug}`}>
                    {category.title_bn}
                  </Link>
                </Badge>
                <time
                  dateTime={article.published_at}
                  className="text-xs text-muted-foreground"
                >
                  {formatDateBn(article.published_at)}
                </time>
              </div>
              <CardTitle className="text-2xl leading-snug sm:text-3xl sm:leading-tight">
                {article.title}
              </CardTitle>
              <CardDescription className="text-base">
                {article.excerpt}
              </CardDescription>
              <div className="flex items-center gap-3 pt-1">
                <Avatar className="size-10">
                  <AvatarFallback>ঢা</AvatarFallback>
                </Avatar>
                <div className="text-sm">
                  {credit.href ? (
                    <Link
                      href={credit.href}
                      className="font-medium hover:underline"
                    >
                      {credit.name}
                    </Link>
                  ) : (
                    <strong>{ANONYMOUS_BYLINE}</strong>
                  )}
                  <p className="text-xs text-muted-foreground">
                    প্রকাশিত {formatDateBn(article.published_at)}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {article.hero_media_key ? (
                <figure className="overflow-hidden rounded-lg">
                  <Image
                    src={mediaUrlFor(article.hero_media_key)}
                    alt=""
                    width={1200}
                    height={675}
                    priority
                    className="h-auto w-full object-cover"
                  />
                </figure>
              ) : (
                <StoryArt
                  slug={category.slug}
                  title={article.title}
                  className="aspect-video w-full rounded-lg"
                />
              )}
              <div className="article-body max-w-[68ch] text-[17px] leading-8">
                {paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </CardContent>
          </Card>

          {gallery.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>ছবির গ্যালারি</CardTitle>
                    <CardDescription>প্রতিবেদনের ছবি</CardDescription>
                  </div>
                  <Badge variant="secondary">{bn(gallery.length)}টি</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {gallery.map((item, index) => (
                    <figure
                      key={item.media_id}
                      className="overflow-hidden rounded-lg"
                    >
                      <Image
                        src={mediaUrlFor(item.media_id)}
                        alt={`${article.title} — ছবি ${index + 1}`}
                        width={800}
                        height={600}
                        loading="lazy"
                        className="h-auto w-full object-cover"
                      />
                    </figure>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Phones use the single floating CTA below instead of this row. */}
          <Card className="hidden lg:block">
            <CardContent className="pt-6">
              <ArticleActions
                articleId={article.id}
                articleTitle={article.title}
                correctionSubject={`সংশোধন: ${article.title}`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>মন্তব্য</CardTitle>
              <CardDescription>পাঠকের আলোচনা</CardDescription>
            </CardHeader>
            <CardContent>
              <Comments articleId={article.id} />
            </CardContent>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <div className="lg:sticky lg:top-32 lg:flex lg:flex-col lg:gap-6">
            <Card className="hidden lg:block">
              <CardContent className="pt-6">
                <ArticleActions
                  articleId={article.id}
                  articleTitle={article.title}
                  correctionSubject={`সংশোধন: ${article.title}`}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>লেখক</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Avatar className="size-10">
                  <AvatarFallback>ঢা</AvatarFallback>
                </Avatar>
                <div className="text-sm">
                  {credit.href ? (
                    <Link
                      href={credit.href}
                      className="font-medium hover:underline"
                    >
                      {credit.name}
                    </Link>
                  ) : (
                    <strong>{ANONYMOUS_BYLINE}</strong>
                  )}
                  <p className="text-xs text-muted-foreground">DUTIMZ সদস্য</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>আরও পড়ুন</CardTitle>
                <CardDescription>
                  {category.title_bn} বিভাগ থেকে
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recommended.length ? (
                  recommended.map((story) => (
                    <RecommendedItem key={story.id} story={story} />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    সম্পর্কিত প্রতিবেদন শীঘ্রই এখানে দেখা যাবে।
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>বিষয়</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {CATEGORIES.filter((c) => c.slug !== "all")
                  .slice(0, 6)
                  .map((c) => (
                    <Button key={c.slug} variant="outline" size="sm" asChild>
                      <Link href={`/category/${c.slug}`}># {c.label}</Link>
                    </Button>
                  ))}
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      {/* Phone: one floating call to action that unfolds every article action. */}
      <ArticleActions
        variant="floating"
        articleId={article.id}
        articleTitle={article.title}
        correctionSubject={`সংশোধন: ${article.title}`}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            headline: article.title,
            description: article.excerpt,
            datePublished: article.published_at,
            author: {
              "@type": "Person",
              name: credit.name,
              ...(credit.href ? { url: `${SITE_URL}${credit.href}` } : {}),
            },
            publisher: {
              "@type": "Organization",
              name: "DUTIMZ",
              url: SITE_URL,
            },
            inLanguage: "bn",
            ...(images.length ? { image: images } : {}),
          }),
        }}
      />
      <AuthorShim
        profile={one(article.profiles)}
        anonymous={article.is_anonymous}
      />
    </DutimzShell>
  );
}

function AuthorShim({
  profile,
  anonymous,
}: {
  profile: { avatar_url?: string | null } | null;
  anonymous?: boolean | null;
}) {
  void profile;
  void anonymous;
  return null;
}
