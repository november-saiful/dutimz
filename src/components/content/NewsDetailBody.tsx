import type { ContentWithRelations } from "@/types";
import Link from "next/link";
import Image from "next/image";
import { ContentGrid } from "@/components/content/ContentGrid";
import { SectionHeading } from "@/components/content/SectionHeading";
import { NewsletterCTA } from "@/components/content/NewsletterCTA";
import { CommentSection } from "@/components/content/CommentSection";
import { ShareButtons } from "@/components/content/ShareButtons";
import { BookmarkButton } from "@/components/content/BookmarkButton";
import { ReadTracker } from "@/components/content/ReadTracker";
import { ReadingProgress } from "@/components/content/ReadingProgress";
import { formatCount, estimateReadTime } from "@/lib/utils/format";
import { sanitizeArticleHtml } from "@/lib/content/sanitize";
import { SITE } from "@/lib/constants/app";

interface Props {
  content: ContentWithRelations;
  related: ContentWithRelations[];
  showVideoEmbed?: boolean;
}

export function NewsDetailBody({ content, related, showVideoEmbed = false }: Props) {
  const title = content.title_bn;
  const subtitle = content.subtitle_bn;
  const excerpt = content.excerpt_bn;
  const rawBody = content.body_bn;
  // Phase 3: server-side sanitization of editor-produced HTML.
  const body = sanitizeArticleHtml(rawBody);
  const readTime = content.read_time ?? estimateReadTime(body);

  return (
    <article className="container mt-6 max-w-4xl page-transition">
      <ReadingProgress />
      <ReadTracker content={content} />
      <nav aria-label="ব্রেডক্রাম্ব" className="mb-4 text-xs opacity-60">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/">হোম</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/category/${content.category?.slug ?? ""}`}>
              {content.category?.name_bn ?? "—"}
            </Link>
          </li>
        </ol>
      </nav>

      {content.category && (
        <span
          className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: "var(--md-sys-color-primary)", color: "#fff" }}
        >
          {content.category.name_bn}
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
          <time dateTime={content.published_at}>
            {new Date(content.published_at).toLocaleDateString("bn-BD")}
          </time>
        )}
        <span>
          {formatCount(readTime, "bn")} মিনিট পড়ুন
        </span>
        <span>
          {formatCount(content.view_count, "bn")} বার পঠিত
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

      <div
        className="prose-bn mt-6 space-y-4 text-[1.075rem] leading-[1.8] text-justify"
        dangerouslySetInnerHTML={{ __html: body }}
      />

      {content.attachments.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">সংযুক্তি</h2>
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

      {/* শেয়ার ও বুকমার্ক */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl p-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
        <ShareButtons
          title={title}
          url={`${SITE.url}/news/${content.slug}`}
        />
        <BookmarkButton contentId={content.id} />
      </div>

      {/* মন্তব্য */}
      {content.is_commentable && (
        <CommentSection contentId={content.id} />
      )}

      <section className="mt-10">
        <SectionHeading title="সম্পর্কিত খবর" />
        <ContentGrid items={related} />
      </section>

      <NewsletterCTA />
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
