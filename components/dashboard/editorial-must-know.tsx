import Link from "next/link";
import { Sparkles, Compass, Flame, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StoryArt } from "@/components/dashboard/story-card";
import { mediaUrlFor, relativeTimeBn } from "@/lib/site";
import { storyCategory, storyCredit, type Story } from "@/lib/supabase";
import type { PreviewStory } from "@/lib/stories";

interface EditorialMustKnowProps {
  stories: (Story | PreviewStory)[];
}

export function EditorialMustKnow({ stories }: EditorialMustKnowProps) {
  if (!stories.length) return null;

  // Format today's date in Bengali
  const todayBn = new Date().toLocaleDateString("bn-BD", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-[#121417] text-white p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />

      {/* Header section matching mockup */}
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <Sparkles className="size-4" />
            </span>
            <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
              আজকের বিশেষ নির্বাচন
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-serif">
            Must you know today
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 mt-1 capitalize">{todayBn}</p>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
          <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 font-medium text-gray-300">
            <Flame className="size-3.5 text-orange-400" />
            আলোচিত
          </span>
          <span className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 font-medium text-gray-300">
            <TrendingUp className="size-3.5 text-emerald-400" />
            তাজা খবর
          </span>
        </div>
      </div>

      {/* Horizontal Story Card Scroll Row matching mockup */}
      <div className="relative z-10 -mx-5 px-5 sm:-mx-7 sm:px-7 flex gap-4 overflow-x-auto no-scrollbar pb-2 pt-1 snap-x snap-mandatory">
        {stories.slice(0, 5).map((story, idx) => {
          const preview = "categorySlug" in story;
          const section = preview ? story.category : storyCategory(story).title_bn;
          const slug = preview ? story.categorySlug : storyCategory(story).slug;
          const url = `/news/${story.slug}/`;
          const authorName = preview ? story.author : storyCredit(story).name;
          const timeLabel = preview ? story.time : relativeTimeBn(story.published_at);
          const heroUrl = preview
            ? story.imageUrl
            : story.hero_media_key
              ? mediaUrlFor(story.hero_media_key)
              : null;

          return (
            <article
              key={story.slug}
              className="group relative flex w-[280px] sm:w-[320px] shrink-0 flex-col overflow-hidden rounded-[22px] bg-[#1a1e23] border border-white/10 transition-all hover:border-emerald-500/40 hover:bg-[#20252b] snap-start"
            >
              {/* Image Frame with Live Chip */}
              <Link href={url} className="relative aspect-16/10 w-full overflow-hidden block">
                <StoryArt
                  slug={slug}
                  imageUrl={heroUrl}
                  title={story.title}
                  className="size-full transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                
                {/* Live Badge matching mockup */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-md backdrop-blur-sm">
                  <span className="size-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </div>

                <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-xs text-white/90">
                  <span className="font-semibold text-emerald-400 bg-emerald-950/70 rounded-full px-2 py-0.5 text-[11px] backdrop-blur-sm border border-emerald-500/30">
                    {section}
                  </span>
                </div>
              </Link>

              {/* Text content */}
              <div className="flex flex-1 flex-col justify-between p-4">
                <h3 className="line-clamp-2 text-base sm:text-lg font-bold text-white font-serif leading-snug group-hover:text-emerald-300 transition-colors">
                  <Link href={url}>{story.title}</Link>
                </h3>

                <p className="line-clamp-2 text-xs text-gray-400 mt-2 mb-4 leading-relaxed">
                  {story.excerpt}
                </p>

                {/* Author and metadata footer */}
                <div className="flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-gray-400">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-white/10 text-white font-semibold text-[10px]">
                      {authorName.slice(0, 1)}
                    </span>
                    <span className="font-medium text-gray-300 truncate max-w-[120px]">
                      {authorName}
                    </span>
                  </div>
                  <span className="text-gray-400 shrink-0">{timeLabel}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
