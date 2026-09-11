import Image from "next/image";
import Link from "next/link";
import type { ContentWithRelations } from "@/types";
import { GlassCard } from "@/components/glass/GlassCard";
import type { Locale } from "@/lib/constants/app";

export function DocumentarySpotlight({
  content,
  locale,
}: {
  content: ContentWithRelations | null;
  locale: Locale;
}) {
  if (!content) return null;

  const title = locale === "bn" ? content.title_bn : (content.title_en ?? content.title_bn);
  const excerpt = locale === "bn" ? content.excerpt_bn : (content.excerpt_en ?? content.excerpt_bn);
  const minutes = content.video_duration ? Math.round(content.video_duration / 60) : null;

  return (
    <GlassCard className="grid md:grid-cols-2">
      <Link
        href={`/documentaries/${content.slug}`}
        className="relative block min-h-56 overflow-hidden md:rounded-l-glass md:min-h-full"
      >
        {content.thumbnail_url && (
          <Image
            src={content.thumbnail_url}
            alt={content.thumbnail_alt ?? title}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/25 backdrop-blur transition-transform hover:scale-110">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
        {minutes && (
          <span className="absolute bottom-3 right-3 rounded bg-black/70 px-2 py-0.5 text-xs font-bold text-white">
            {minutes} min
          </span>
        )}
      </Link>
      <div className="flex flex-col justify-center gap-3 p-6">
        <p className="text-xs font-bold uppercase tracking-wide opacity-60">
          {locale === "bn" ? "প্রামাণ্যচিত্র" : "Documentary"}
        </p>
        <h3 className="text-xl font-bold leading-snug md:text-2xl">
          <Link href={`/documentaries/${content.slug}`}>{title}</Link>
        </h3>
        {excerpt && <p className="text-sm opacity-70">{excerpt}</p>}
      </div>
    </GlassCard>
  );
}
