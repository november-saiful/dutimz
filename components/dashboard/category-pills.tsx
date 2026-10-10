"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { CATEGORIES } from "@/lib/site";
import { cn } from "@/lib/utils";

interface CategoryPillsProps {
  className?: string;
}

export function CategoryPills({ className }: CategoryPillsProps) {
  const pathname = usePathname();

  // All category items including "For You" (আপনার জন্য) matching the mockup
  const isForYouActive = pathname === "/";

  return (
    <div className={cn("relative w-full overflow-hidden py-1", className)}>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1">
        {/* Quick Preference button (+) matching mockup */}
        <Link
          href="/search"
          aria-label="পছন্দের বিষয় নির্বাচন"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-transform hover:scale-105"
        >
          <Plus className="size-4" />
        </Link>

        {/* For You (আপনার জন্য) - Primary Pill matching mockup */}
        <Link
          href="/"
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-all shadow-sm",
            isForYouActive
              ? "bg-[#121417] text-white"
              : "bg-card text-foreground hover:bg-muted border border-border",
          )}
        >
          আপনার জন্য
        </Link>

        {/* Categories */}
        {CATEGORIES.filter((c) => c.slug !== "all").map((cat) => {
          const catHref = `/category/${cat.slug}`;
          const isActive = pathname === catHref;

          return (
            <Link
              key={cat.slug}
              href={catHref}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-xs sm:text-sm font-medium transition-all shadow-sm",
                isActive
                  ? "bg-[#121417] text-white font-semibold"
                  : "bg-card text-foreground hover:bg-muted border border-border",
              )}
            >
              {cat.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
