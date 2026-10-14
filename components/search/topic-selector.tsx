"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { CATEGORIES } from "@/lib/site";
import { cn } from "@/lib/utils";

interface TopicSelectorProps {
  onSelectTopic: (topic: string) => void;
  selectedTopic?: string;
}

const TOPICS = [
  { slug: "campus", label: "ক্যাম্পাস", count: "১২০+" },
  { slug: "student-life", label: "শিক্ষার্থী জীবন", count: "৯৫+" },
  { slug: "culture", label: "সংস্কৃতি ও সাহিত্য", count: "৫০+" },
  { slug: "opinion", label: "মতামত ও বিশ্লেষণ", count: "৪০+" },
  { slug: "sports", label: "খেলাধুলা", count: "৩০+" },
];

export function TopicSelector({ onSelectTopic, selectedTopic }: TopicSelectorProps) {
  return (
    <div className="rounded-[24px] border border-border/80 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-foreground">জনপ্রিয় বিষয়সমূহ</h3>
          <p className="text-xs text-muted-foreground mt-0.5">যে বিষয়ে খবর পড়তে চান তা বেছে নিন</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {TOPICS.map((topic) => {
          const isSelected = selectedTopic === topic.label || selectedTopic === topic.slug;

          return (
            <button
              key={topic.slug}
              type="button"
              onClick={() => onSelectTopic(topic.label)}
              className={cn(
                "relative flex items-center justify-between p-3 rounded-[18px] border text-left transition-all",
                isSelected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/80 bg-card hover:border-foreground/30 hover:bg-muted/50",
              )}
            >
              <div className="min-w-0 pr-2">
                <p className="text-sm font-semibold truncate leading-tight">{topic.label}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{topic.count} প্রতিবেদন</p>
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
