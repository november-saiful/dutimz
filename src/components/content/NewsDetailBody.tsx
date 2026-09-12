import type { ContentWithRelations } from "@/types";
import Link from "next/link";
import Image from "next/image";
import { ContentGrid } from "@/components/content/ContentGrid";
import { SectionHeading } from "@/components/content/SectionHeading";
import { NewsletterCTA } from "@/components/content/NewsletterCTA";
import { CommentSection } from "@/components/content/CommentSection";
import { ShareButtons } from "@/components/content/ShareButtons";
import { BookmarkButton } from "@/components/content/BookmarkButton";
import { TextToSpeech } from "@/components/content/TextToSpeech";
import { ReadTracker } from "@/components/content/ReadTracker";
import { formatDate, formatCount, estimateReadTime } from "@/lib/utils/format";
import { sanitizeArticleHtml } from "@/lib/content/sanitize";
import { translate } from "@/lib/i18n/dictionary";
import { SITE } from "@/lib/constants/app";
import type { Locale } from "@/lib/constants/app";

interface Props {
  content: ContentWithRelations;
  related: ContentWithRelations[];
  locale: Locale;
  showVideoEmbed?: boolean;
}

export function NewsDetailBody({ content, related, locale, showVideoEmbed = false }: Props) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const title = locale === "bn" ? content.title_bn : (content.title_en ?? content.title_bn);
  const subtitle = locale === "bn" ? content.subtitle_bn : (content.subtitle_en ?? content.subtitle_bn);
  const excerpt = locale === "bn" ? content.excerpt_bn : (content.excerpt_en ?? content.excerpt_bn);
  const rawBody = locale === "bn" ? content.body_bn : (content.body_en ?? content.body_bn);
  // Phase 3: server-side sanitization of editor-produced HTML.
  const body = sanitizeArticleHtml(rawBody);
  const readTime = content.read_time ?? estimateReadTime(body);

  return (
    <article className="container mt-6 max-w-4xl page-transition">
      <ReadTracker content={content} />
      <nav aria-label="Breadcrumb" className="mb-4 text-xs opacity-60">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/">{locale === "bn" ? "হোম" : "Home"}</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/category/${content.category?.slug ?? ""}`}>
              {content.category
                ? locale === "bn"
                  ? content.category.name_bn
                  : content.category.name_en
                : "—"}
            </Link>
          </li>
        </ol>
      </nav>

      {content.category && (
        <span
          className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: "var(--md-sys-color-primary)", color: "#fff" }}
        >
          {locale === "bn" ? content.category.name_bn : content.category.name_en}
        </span>
      )}

      <h1 className="text-3xl font-bold leading-tight md:text-4xl">{title}</h1>
      {subtitle && <p className="mt-3 text-lg opacity-70">{subtitle}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs opacity-70">
        {content.author && (
          <span className="font-medium">
            {content.author.display_name ?? content.author.username}
            {content.author.is_verified && " ✓"}
          </span>
        )}
        {content.published_at && (
          <time dateTime={content.published_at}>{formatDate(content.published_at, locale)}</time>
        )}
        <span>
          {formatCount(readTime, locale)} {t("content.minRead")}
        </span>
        <span>
          {formatCount(content.view_count, locale)} {t("content.views")}
        </span>
      </div>

      {showVideoEmbed && content.video_url ? (
        <div className="mt-6 aspect-video overflow-hidden rounded-glass">
          <iframe
            src={toEmbedUrl(content.video_url) ?? content.video_url}
            title={title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      ) : content.thumbnail_url ? (
        <figure className="mt-6">
          <div className="relative aspect-video overflow-hidden rounded-glass">
            <Image
              src={content.thumbnail_url}
              alt={content.thumbnail_alt ?? title}
              fill
              priority
              sizes="(max-width: 896px) 100vw, 896px"
              className="object-cover"
            />
          </div>
          {content.thumbnail_alt && (
            <figcaption className="mt-2 text-xs opacity-60">{content.thumbnail_alt}</figcaption>
          )}
        </figure>
      ) : null}

      {excerpt && <p className="mt-6 border-l-4 pl-4 text-lg opacity-80" style={{ borderColor: "var(--md-sys-color-primary)" }}>{excerpt}</p>}

      {/* Listen to article */}
      {rawBody && (
        <div className="mt-6 max-w-[720px]">
          <TextToSpeech
            bodyHtml={rawBody}
            title={title}
            language={content.language_primary}
          />
        </div>
      )}

      <div
        className="prose-bn mt-6 max-w-[720px] space-y-4 text-[1.075rem] leading-[1.8]"
        // Editor-produced HTML, sanitized above with sanitize-html (Phase 3).
        dangerouslySetInnerHTML={{ __html: body }}
      />

      {content.attachments.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{locale === "bn" ? "সংযুক্তি" : "Attachments"}</h2>
          <ul className="space-y-2">
            {content.attachments.map((att, i) => (
              <li key={`${att.url}-${i}`}>
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm underline hover:opacity-80"
                >
                  📎 {att.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Share & Bookmark bar */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl p-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
        <ShareButtons
          title={title}
          url={`${SITE.url}/news/${content.slug}`}
        />
        <BookmarkButton contentId={content.id} />
      </div>

      {/* Comments */}
      {content.is_commentable && (
        <CommentSection contentId={content.id} />
      )}

      <section className="mt-10">
        <SectionHeading title={locale === "bn" ? "সম্পর্কিত খবর" : "Related Stories"} />
        <ContentGrid items={related} locale={locale} />
      </section>

      <NewsletterCTA locale={locale} />
    </article>
  );
}

/** Convert YouTube/Vimeo watch URLs to embed URLs; returns null if not convertible. */
function toEmbedUrl(url: string): string | null {
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  );
  if (yt?.[1]) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo?.[1]) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}
