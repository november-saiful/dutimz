import type { ContentWithRelations } from "@/types";
import { GlassCard2 } from "@/components/glass/GlassCard2";

interface Props {
  items: ContentWithRelations[];
  columns?: 2 | 3 | 4;
  priorityCount?: number;
}

export function ContentGrid({ items, columns = 3, priorityCount = 0 }: Props) {
  const cols =
    columns === 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : columns === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid grid-cols-1 gap-5 ${cols}`}>
      {items.map((item, i) => (
        <div key={item.id} className="stagger-item" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
          <GlassCard2 content={item} priority={i < priorityCount} />
        </div>
      ))}
    </div>
  );
}
