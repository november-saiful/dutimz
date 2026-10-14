"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { CATEGORIES } from "@/lib/site";
import { cn } from "@/lib/utils";

interface TopicSelectorProps {
  onSelectDesk: (slug: string) => void;
  selectedDesk?: string | null;
}

/**
 * The desks as a filter, from the same configured list the top bar, the menu
 * and the footer read — one desk list everywhere, so a chip always names a
 * desk that exists. Choosing a chip filters the archive by that desk's slug
 * (a server-side predicate), instead of searching for the desk's name as text.
 */
export function TopicSelector({ onSelectDesk, selectedDesk }: TopicSelectorProps) {
  const desks = CATEGORIES.filter((category) => category.slug !== "all");
  return (
    <div className="rounded-[24px] border border-border/80 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-foreground">জনপ্রিয় বিষয়সমূহ</h3>
          <p className="text-xs text-muted-foreground mt-0.5">যে বিষয়ে খবর পড়তে চান তা বেছে নিন</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {desks.map((desk) => {
          const isSelected = selectedDesk === desk.slug;

          return (
            <button
              key={desk.slug}
              type="button"
              onClick={() => onSelectDesk(desk.slug)}
              aria-pressed={isSelected}
              className={cn(
                "relative flex items-center justify-between p-3 rounded-[18px] border text-left transition-all",
                isSelected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/80 bg-card hover:border-foreground/30 hover:bg-muted/50",
              )}
            >
              <div className="min-w-0 pr-2">
                <p className="text-sm font-semibold truncate leading-tight">{desk.label}</p>
              </div>

              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/50 text-transparent",
                )}
              >
                <Check className="size-3.5 stroke-[3]" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
