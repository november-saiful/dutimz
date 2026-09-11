import Link from "next/link";
import type { ContentWithRelations } from "@/types";
import { translate, type TranslationKey } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/constants/app";

interface Props {
  items: ContentWithRelations[];
  locale: Locale;
}

export function BreakingNewsTicker({ items, locale }: Props) {
  if (items.length === 0) return null;
  const label = translate(locale, "ticker.label");

  // Duplicate the list for a seamless marquee loop.
  const loop = [...items, ...items];

  return (
    <div
      className="no-print flex items-center gap-3 overflow-hidden px-4 py-2 text-sm md:px-8"
      style={{ background: "var(--color-breaking, #ea4335)" }}
      role="region"
      aria-label={label}
    >
      <span className="shrink-0 rounded bg-white/20 px-2 py-0.5 text-xs font-bold tracking-wide text-white">
        {label}
      </span>
      <div className="relative flex-1 overflow-hidden">
        <div className="flex w-max animate-ticker items-center gap-10 whitespace-nowrap">
          {loop.map((item, i) => (
            <Link
              key={`${item.id}-${i}`}
              href={`/${item.content_type === "news" ? "news" : item.content_type === "article" ? "articles" : "documentaries"}/${item.slug}`}
              className="text-white/95 hover:underline"
            >
              {locale === "bn"
                ? item.title_bn
                : (item.title_en ?? item.title_bn)}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
