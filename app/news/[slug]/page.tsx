import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleActions } from "@/components/article/article-actions";
import { ArticleGallery } from "@/components/article/article-gallery";
import { QuestionnaireSummary } from "@/components/article/questionnaire-summary";
import { Comments } from "@/components/article/comments";
import { PendingArticle } from "@/components/article/pending-article";
import { ReadingProgress } from "@/components/article/reading-progress";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { StoryCarousel } from "@/components/dashboard/story-carousel";
import {
  BlockHead,
  CarouselCard,
  MiniRow,
  storyItemFromStory,
  storyUrl,
} from "@/components/dashboard/story-blocks";
import { StoryArt } from "@/components/dashboard/story-card";
import {
  CATEGORIES,
  SITE_URL,
  bn,
  formatDateBn,
  mediaUrlFor,
} from "@/lib/site";
import {
  articleSlugExists,
  getArticleQuestionnaire,
  getLatestStories,
  getStoryBySlug,
} from "@/lib/stories";
import {
  ANONYMOUS_BYLINE,
  storyCategory,
  storyCredit,
} from "@/lib/supabase";

// Rendered per request: an approved story must be readable the moment it is approved. A cached
// page, including one first rendered while the story was still pending, keeps the old state until
// a background regeneration runs, so readers saw approved stories as missing or pending for hours.
export const dynamic = "force-dynamic";

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
  // logo in the layout default.
  const heroKey =
    article.hero_media_key ??
    (article.article_media ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)[0]?.media_id ??
    null;
  const image = heroKey ? mediaUrlFor(heroKey) : "/og-banner.png";
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

  return (
    <DutimzShell bare>
      {/*
        The reading bar: back, the running title, and the reader's own chips
        (likes, saves, comments). The purple progress hairline tracks how far
        the reader has come.
      */}
      <div className="article-bar">
        <div className="bar-in">
          <Link href="/" className="back">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            ফিরে যান
          </Link>
          <div className="ab-title">{article.title}</div>
          <ArticleActions
            variant="chips"
            articleId={article.id}
            articleTitle={article.title}
            correctionSubject={correctionSubject}
          />
        </div>
        <ReadingProgress />
      </div>

      <div className="article-grid">
        <article className="article-main">
          <div className="crumb">
            <Link href={`/category/${category.slug}/`}>{category.title_bn}</Link>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <span>{article.title}</span>
          </div>

          <h1>{article.title}</h1>

          <div className="meta" style={{ margin: "18px 0 4px" }}>
            {credit.href ? (
              <Link href={credit.href}>{credit.name}</Link>
            ) : (
              <strong className="text-foreground">{ANONYMOUS_BYLINE}</strong>
            )}
            <i aria-hidden>•</i>
            <time dateTime={article.published_at}>
              প্রকাশিত {formatDateBn(article.published_at)}
            </time>
          </div>

          <div className="a-row">
            <div className="tags">
              <span>#{category.title_bn}</span>
            </div>
            <ArticleActions
              variant="socials"
              articleId={article.id}
              articleTitle={article.title}
              articleUrl={articleUrl}
              correctionSubject={correctionSubject}
            />
          </div>

          <figure className="fig fig-big">
            <StoryArt
              slug={category.slug}
              imageUrl={
                article.hero_media_key
                  ? mediaUrlFor(article.hero_media_key)
                  : null
              }
              title={article.title}
              className="h-full w-full"
            />
          </figure>

          <div className="article-body">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>

          {gallery.length > 0 && (
            <section aria-label="ছবির গ্যালারি" className="mt-6">
              <h2>
                ছবির গ্যালারি{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({bn(gallery.length)}টি)
                </span>
              </h2>
              <ArticleGallery
                images={gallery.map((item, index) => ({
                  src: mediaUrlFor(item.media_id),
                  alt: `${article.title} — ছবি ${index + 1}`,
                }))}
              />
            </section>
          )}

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
              <span className="flag">প্রস্তাবিত</span>
              {recommended.map((item, index) => (
                <MiniRow key={`${item.slug}-${index}`} item={item} />
              ))}
            </>
          )}
          {monthBest.length > 0 && (
            <>
              <span className="flag">মাসের সেরা</span>
              {monthBest.map((item, index) => (
                <MiniRow key={`${item.slug}-${index}`} item={item} />
              ))}
            </>
          )}
          <span className="flag">আরও খবর</span>
          <div className="tagpills">
            {desks.map((desk) => (
              <Link key={desk.slug} href={`/category/${desk.slug}/`}>
                {desk.label}
              </Link>
            ))}
          </div>
        </aside>
      </div>

      {forYou.length > 0 && (
        <section className="block" aria-label="আপনার জন্য আরও">
          <BlockHead flag="আপনার জন্য আরও" moreHref="/search/" />
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
    </DutimzShell>
  );
}
