import Link from "next/link";
import Image from "next/image";
import type { ContentWithRelations } from "@/types";

const TYPE_LABELS: Record<string, string> = {
  news: "সংবাদ",
  article: "নিবন্ধ",
  documentary: "প্রামাণ্যচিত্র",
};

const TYPE_ROUTES: Record<string, string> = {
  news: "/news",
  article: "/articles",
  documentary: "/documentaries",
};

export function SearchResultList({ items }: { items: ContentWithRelations[] }) {
  if (items.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-lg opacity-50">কোনো ফলাফল পাওয়া যায়নি।</p>
        <p className="mt-2 text-sm opacity-40">ভিন্ন কীওয়ার্ড দিয়ে চেষ্টা করুন।</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const title = item.title_bn;
        const excerpt = item.excerpt_bn;
        const typeName = TYPE_LABELS[item.content_type] ?? "সংবাদ";
        const route = TYPE_ROUTES[item.content_type] ?? "/news";

        return (
          <Link
            key={item.id}
            href={`${route}/${item.slug}`}
            className="glass-card flex gap-4 p-4 transition-all hover:scale-[1.01] hover:shadow-lg"
          >
            {item.thumbnail_url && (
              <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg">
                <Image
                  src={item.thumbnail_url}
                  alt={item.thumbnail_alt ?? title}
                  fill
                  className="object-cover"
                  sizes="128px"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ background: "var(--md-sys-color-primary)" }}
                >
                  {typeName}
                </span>
                {item.category && (
                  <span className="text-xs opacity-50">
                    {item.category.name_bn}
                  </span>
                )}
              </div>
              <h3 className="font-bold text-sm leading-snug line-clamp-2">{title}</h3>
              {excerpt && (
                <p className="mt-1 text-xs opacity-60 line-clamp-2">{excerpt}</p>
              )}
              <div className="mt-2 flex items-center gap-3 text-[10px] opacity-40">
                {item.author && (
                  <span>{item.author.display_name ?? item.author.username}</span>
                )}
                {item.view_count > 0 && (
                  <span>{item.view_count.toLocaleString()} বার পঠিত</span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
