import Image from "next/image";
import Link from "next/link";
import type { ContentWithRelations } from "@/types";
import { GlassCard } from "@/components/glass/GlassCard";
import { formatCount } from "@/lib/utils/format";

interface Props {
  content: ContentWithRelations;
  priority?: boolean;
}

export function GlassCard2({ content, priority = false }: Props) {
  const href =
    content.content_type === "news"
      ? `/news/${content.slug}`
      : content.content_type === "article"
        ? `/articles/${content.slug}`
        : `/documentaries/${content.slug}`;

  const title = content.title_bn;
  const excerpt = content.excerpt_bn;
  const categoryName = content.category?.name_bn ?? null;

  return (
    <GlassCard className="flex h-full flex-col">
      <Link href={href} className="relative block aspect-video overflow-hidden rounded-t-glass">
        {content.thumbnail_url && (
          <Image
            src={content.thumbnail_url}
            alt={content.thumbnail_alt ?? title}
            fill
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 hover:scale-105"
          />
        )}
        {content.is_breaking && (
          <span className="breaking-chip absolute left-3 top-3 rounded px-2 py-0.5 text-xs font-bold">
            ব্রেকিং
          </span>
        )}
        {content.content_format === "video" && (
          <span
            className="absolute right-3 top-3 rounded px-2 py-0.5 text-xs font-bold"
            style={{ background: "var(--md-sys-color-tertiary)", color: "#000" }}
          >
            ▶ এখনই দেখুন
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {categoryName && (
          <span
            className="w-fit rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{ background: "var(--md-sys-color-primary-container)", color: "var(--md-sys-color-on-primary-container)" }}
          >
            {categoryName}
          </span>
        )}
        <h3 className="line-clamp-2 text-lg font-bold leading-snug">
          <Link href={href}>{title}</Link>
        </h3>
        {excerpt && <p className="line-clamp-2 text-sm opacity-70">{excerpt}</p>}
        <div className="mt-auto flex items-center gap-3 pt-2 text-xs opacity-60">
          {content.published_at && (
            <span>{new Date(content.published_at).toLocaleDateString("bn-BD")}</span>
          )}
          {content.read_time != null && (
            <span>
              {formatCount(content.read_time, "bn")} মিনিট পড়ুন
            </span>
          )}
          {content.view_count > 0 && (
            <span>
              {formatCount(content.view_count, "bn")} বার পঠিত
            </span>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
