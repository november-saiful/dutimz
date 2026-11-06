import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowUp } from "lucide-react";

import { ArticleActions } from "@/components/article/article-actions";
import { ArticleBack, ArticleShare } from "@/components/article/article-chrome";
import { ArticleGallery } from "@/components/article/article-gallery";
import { QuestionnaireSummary } from "@/components/article/questionnaire-summary";
import { Comments } from "@/components/article/comments";
import { PendingArticle } from "@/components/article/pending-article";
import { ReadingProgress } from "@/components/article/reading-progress";
import { ViewBeacon } from "@/components/article/view-beacon";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { Flag } from "@/components/dashboard/flag";
import { StoryCarousel } from "@/components/dashboard/story-carousel";
import {
  BlockHead,
  CarouselCard,
  MiniRow,
  storyItemFromStory,
  storyUrl,
} from "@/components/dashboard/story-blocks";
import { StoryArt } from "@/components/dashboard/story-card";
import { RichTextContent } from "@/components/ui/rich-text-content";
import {
  CATEGORIES,
  SITE_URL,
  bn,
  formatDateBn,
  interviewSectionLabel,
  mediaUrlFor,
  relativeTimeBn,
} from "@/lib/site";
import { inlineMediaIds, splitAfterFirstParagraph } from "@/lib/richtext";
import {
  articleSlugExists,
  getArticleAuthorOfRecord,
  getArticleQuestionnaire,
  getArticleVoteSummary,
  getLatestStories,
  getSitemapArticles,
  getStoryBySlug,
  shareImageFor,
} from "@/lib/stories";
import {
  ANONYMOUS_BYLINE,
  storyCategory,
  storyCredit,
} from "@/lib/supabase";

/*
  Cached, and invalidated the moment the desk changes what readers see.

  This used to render on every request, because a cached copy (including one first rendered while
  the story was still pending) keeps the old state until a background regeneration runs — which is
  how readers saw approved stories as missing or pending for hours. Rendering per request is also
  what put the page over the Worker's resource limit: Cloudflare answered 503, error 1102 ("Worker
  exceeded resource limits"), to article pages as well as to the front page.

  `generateStaticParams` is what makes this route cacheable at all: a dynamic segment with no
  params to prerender is rendered per request and never stored, whatever `revalidate` says. Every
  published story is rendered at deploy time (and uploaded with the Worker, so the first reader
  after a release is served from the cache), and a story published since then is rendered on
  demand and cached like any other. The desk invalidates what it changes; the window is the
  backstop for an approval whose invalidation never arrives.

  Three hours, matched by the schedule's archive sweep (SWEEP_WINDOW_SECONDS in lib/revalidate.ts):
  an article changes only when the desk edits it, and the desk says so, so the window is only the
  width of the sweep that rewrites the pages the desk did not touch.
*/
export const revalidate = 10_800;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  // Slugs only: the render fetches each story itself, and this list is already the one the
  // sitemap advertises. A build with no database configured (or a preview) simply prerenders
  // nothing and every article is generated on demand.
  return (await getSitemapArticles()).map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getStoryBySlug(slug);
  if (!article) {
    // An unpublished story is cased exactly as the page cases it: only if its slug exists at all.
    if (await articleSlugExists(slug)) {
      return {
        title: "পর্যালোচনার অপেক্ষায়",
        robots: { index: false, follow: false },
      };
    }
    return { title: "প্রতিবেদন পাওয়া যায়নি" };
  }
  const url = `/news/${encodeURIComponent(article.slug)}/`;
  // The crawler's picture is the story's own hero, or its first gallery image, or the site banner
  // when the reporter attached no art. It has to be absolute and set per article: Next replaces a
  // page's `openGraph` rather than merging it, so without this every share fell back to the text
  // logo in the layout default. The rule itself lives in lib/stories.ts, where the reel deck that
  // shares the same story takes it from too.
  const image = shareImageFor(article);
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
      images: [{ url: image, width: 1200, height: 630, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${article.title} | DUTIMZ`,
      description: article.excerpt,
      images: [image],
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
  if (!article) {
    // A slug no story has ever claimed is a real 404. One that a story has claimed but that is not
    // published yet is served as a gated preview, so an author can open the link they copied from
    // the write form; the client component decides whether this reader may see it.
    if (!(await articleSlugExists(slug))) notFound();
    return (
      <DutimzShell
        title="পর্যালোচনার অপেক্ষায়"
        crumbs={[{ label: "প্রতিবেদন" }]}
      >
        <PendingArticle slug={slug} />
      </DutimzShell>
    );
  }

  const category = storyCategory(article);
  const credit = storyCredit(article);
  // The account the view count belongs to, resolved the same way the database resolves it: an
  // anonymous story's author lives in `article_attributions`, not on the article row.
  const authorId =
    article.author_id ?? (await getArticleAuthorOfRecord(article.id));
  // The interview desk's second step: virtual vs in-person, shown beside the desk tag.
  const interviewSection =
    category.slug === "interview"
      ? interviewSectionLabel(article.interview_kind ?? null)
      : null;
  // A picture placed in the text is drawn by the body itself, so the gallery strip must not show
  // it a second time. `inlineMediaIds` is the same rule the database applies when it decides which
  // of these pictures the media host is allowed to serve, so the two can never disagree about
  // which images are "in the text".
  const inlineMedia = inlineMediaIds(article.body, "article");
  const gallery = (article.article_media ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter(
      (item) =>
        item.media_id !== article.hero_media_key &&
        !inlineMedia.includes(item.media_id),
    );
  const images = [
    article.hero_media_key,
    ...gallery.map((item) => item.media_id),
  ]
    .filter((key): key is string => Boolean(key))
    .map((key) => mediaUrlFor(key));
  // The gallery sits between the opening paragraph and the rest of the story, the way a printed
  // page breaks its type around a plate, rather than piling every picture at the foot.
  const { lead, rest } = splitAfterFirstParagraph(article.body);

  const questionnaire = await getArticleQuestionnaire(article.id);
  const related = ((await getLatestStories(10)).filter(
    (story) => story.id !== article.id,
  )).map(storyItemFromStory);
  const sameCategory = related.filter(
    (story) => story.sectionSlug === category.slug,
  );
  const recommended = (sameCategory.length ? sameCategory : related).slice(0, 5);
  const monthBest = related.slice(5, 7);
  const forYou = related.slice(0, 5);
  // The design's previous/next pair walks the same newest-first list: the
  // newest neighbour is "next", the oldest "previous".
  const next = related[0] ?? null;
  const previous = related.length > 1 ? related[related.length - 1] : null;
  const correctionSubject = `সংশোধন: ${article.title}`;
  const articleUrl = `${SITE_URL}/news/${encodeURIComponent(article.slug)}/`;
  const desks = [
    { slug: category.slug, label: category.title_bn },
    ...CATEGORIES.filter(
      (desk) => desk.slug !== "all" && desk.slug !== category.slug,
    ),
  ];
  // The reader's split, read once on the server so the header and the floating
  // bar both open with the real numbers instead of zero.
  const votes = await getArticleVoteSummary(article.id);
  const voteTotal = votes.upvotes + votes.downvotes;
  const upPercent = voteTotal ? Math.round((votes.upvotes / voteTotal) * 100) : 0;
  const downPercent = voteTotal ? 100 - upPercent : 0;

  return (
    <DutimzShell bare>
      <div className="post-view">
        {/* The reading hairline stays, drawn over the picture rather than on a bar. */}
        <div className="post-progress">
          <ReadingProgress />
        </div>

        <header className="post-hero">
          <StoryArt
            imageUrl={
              article.hero_media_key
                ? mediaUrlFor(article.hero_media_key)
                : null
            }
            title={article.title}
            className="post-hero-art"
            sizes="100vw"
            priority
          />
          <span className="post-hero-shade" aria-hidden />
          <div className="post-float">
            <ArticleBack />
            <ArticleShare title={article.title} url={articleUrl} />
          </div>
        </header>

        <div className="post-sheet">
          <div className="article-grid post-grid">
            <article className="article-main post-main">
              <div className="post-kicker">
                <Link href={`/category/${category.slug}/`}>
                  {category.title_bn}
                </Link>
                <i aria-hidden>•</i>
                <time dateTime={article.published_at}>
                  {relativeTimeBn(article.published_at)}
                </time>
              </div>

              <h1>{article.title}</h1>

              <p className="post-byline">
                {credit.href ? (
                  <Link href={credit.href}>{credit.name}</Link>
                ) : (
                  <strong>{ANONYMOUS_BYLINE}</strong>
                )}
                <span aria-hidden>·</span>
                <time dateTime={article.published_at}>
                  প্রকাশিত {formatDateBn(article.published_at)}
                </time>
              </p>

              <div className="post-trust">
                <span className="post-votes">
                  <ArrowUp size={14} strokeWidth={2.6} aria-hidden />
                  {bn(votes.upvotes)} ভোট
                  {voteTotal > 0 && (
                    <span className="post-split">
                      ({bn(upPercent)}% আপ · {bn(downPercent)}% ডাউন)
                    </span>
                  )}
                </span>
              </div>

              <div className="article-body">
                <RichTextContent markdown={lead} />

                {gallery.length > 0 && (
                  <section aria-label="ছবির গ্যালারি" className="my-8">
                    <ArticleGallery
                      images={gallery.map((item) => ({
                        src: mediaUrlFor(item.media_id),
                        alt: article.title,
                      }))}
                    />
                  </section>
                )}

                <RichTextContent markdown={rest} />
              </div>

              <div className="post-tags">
                <div className="tags">
                  <span>#{category.title_bn}</span>
                  {interviewSection && <span>#{interviewSection}</span>}
                </div>
                <ArticleActions
                  variant="socials"
                  articleId={article.id}
                  articleTitle={article.title}
                  articleUrl={articleUrl}
                  correctionSubject={correctionSubject}
                />
              </div>

              {questionnaire && <QuestionnaireSummary questionnaire={questionnaire} />}

              <section className="comments" id="comments">
                <h3>মন্তব্য</h3>
                <Comments articleId={article.id} />
              </section>

              <div className="pn">
                {previous ? (
                  <Link href={storyUrl(previous)}>
                    <span className="lbl">
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M19 12H5M11 6l-6 6 6 6" />
                      </svg>
                      আগের প্রতিবেদন
                    </span>
                    <span className="t clamp2">{previous.title}</span>
                  </Link>
                ) : (
                  <span />
                )}
                {next && (
                  <Link href={storyUrl(next)} className="next">
                    <span className="lbl">
                      পরের প্রতিবেদন
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                    <span className="t clamp2">{next.title}</span>
                  </Link>
                )}
              </div>
            </article>

            <aside className="a-aside">
              {recommended.length > 0 && (
                <>
                  <Flag label="প্রস্তাবিত" />
                  {recommended.map((item, index) => (
                    <MiniRow key={`${item.slug}-${index}`} item={item} />
                  ))}
                </>
              )}
              {monthBest.length > 0 && (
                <>
                  <Flag label="মাসের সেরা" />
                  {monthBest.map((item, index) => (
                    <MiniRow key={`${item.slug}-${index}`} item={item} />
                  ))}
                </>
              )}
              <Flag label="আরও খবর" />
              <div className="tagpills">
                {desks.map((desk) => (
                  <Link key={desk.slug} href={`/category/${desk.slug}/`}>
                    {desk.label}
                  </Link>
                ))}
              </div>
            </aside>
          </div>

          {/* The mockup's dark action bar: floating over a phone's page, inline
              at the foot of the column on a wide screen. */}
          <div className="post-actions">
            <ArticleActions
              variant="bar"
              articleId={article.id}
              articleTitle={article.title}
              articleUrl={articleUrl}
              correctionSubject={correctionSubject}
              initialUpvotes={votes.upvotes}
              initialDownvotes={votes.downvotes}
            />
          </div>
        </div>
      </div>

      {forYou.length > 0 && (
        <section className="block" aria-label="আপনার জন্য আরও">
          {/* The link searches this story's own desk, so "more" means more
              like this — not the generic archive. */}
          <BlockHead
            flag="আপনার জন্য আরও"
            moreHref={`/search/?q=${encodeURIComponent(category.title_bn)}`}
          />
          <StoryCarousel label="আপনার জন্য আরও">
            {forYou.map((item, index) => (
              <CarouselCard key={`${item.slug}-${index}`} item={item} />
            ))}
          </StoryCarousel>
        </section>
      )}

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
      <ViewBeacon articleId={article.id} authorId={authorId} />
    </DutimzShell>
  );
}
