import Link from "next/link";
import type { ContentWithRelations } from "@/types";
import { GlassCard } from "@/components/glass/GlassCard";
import { formatCount } from "@/lib/utils/format";

const BN_NUMERALS = ["১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯", "১০"];

export function PopularList({ items }: { items: ContentWithRelations[] }) {
  if (items.length === 0) return null;

  return (
    <GlassCard hover={false} className="p-5">
      <h3 className="mb-4 text-lg font-bold">জনপ্রিয়</h3>
      <ol className="space-y-4">
        {items.map((item, i) => {
          const title = item.title_bn;
          const href =
            item.content_type === "news"
              ? `/news/${item.slug}`
              : item.content_type === "article"
                ? `/articles/${item.slug}`
                : `/documentaries/${item.slug}`;
          return (
            <li key={item.id} className="flex items-start gap-3">
              <span className="text-2xl font-bold leading-none opacity-25" style={{ minWidth: "1.5em" }}>
                {BN_NUMERALS[i] ?? i + 1}
              </span>
              <div>
                <Link href={href} className="line-clamp-2 text-sm font-medium leading-snug hover:underline">
                  {title}
                </Link>
                <p className="mt-1 text-xs opacity-60">
                  {formatCount(item.view_count, "bn")} বার পঠিত
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );
}
