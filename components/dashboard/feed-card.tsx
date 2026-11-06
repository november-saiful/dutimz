import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";

import { StoryArt } from "@/components/dashboard/story-card";
import { storyUrl, type StoryItem } from "@/components/dashboard/story-blocks";
import { FeedViewCount } from "@/components/dashboard/view-count";
import { bn } from "@/lib/site";

/**
 * A story as the mockup's feed row wants it: the picture on the left, then the
 * section and time, a two-line headline, one line of the story's own short
 * description, its byline, and the reader's real up/down split at the foot of
 * the card, with how many readers have opened it.
 *
 * Every figure is the archive's: the split comes from `get_feed_vote_summary`
 * and the view total from `get_feed_view_summary` — seeded into the cached page,
 * then refreshed by the card itself so the number is current on every open.
 * Nothing is invented to fill the mockup's percentage badge.
 */
export function FeedCard({ item }: { item: StoryItem }) {
  return (
    <Link href={storyUrl(item)} className="news-card">
      <span className="news-thumb">
        <StoryArt
          imageUrl={item.image}
          title={item.title}
          className="news-art"
          sizes="(max-width: 860px) 90px, 132px"
        />
      </span>
      <span className="news-body">
        <span className="news-meta">
          <span>{item.section}</span>
          <i aria-hidden>•</i>
          <span>{item.when}</span>
        </span>
        <h3 className="news-title clamp2">{item.title}</h3>
        <span className="news-snippet">{item.excerpt}</span>
        <span className="news-author">লিখেছেন {item.byline}</span>
        <span className="news-foot">
          <span className="news-votes">
            <span>
              <ArrowUp size={13} strokeWidth={2.6} aria-hidden />
              {bn(item.upvotes)}
            </span>
            <span className="down">
              <ArrowDown size={13} strokeWidth={2.6} aria-hidden />
              {bn(item.downvotes)}
            </span>
          </span>
          <FeedViewCount articleId={item.id} initial={item.views} />
        </span>
      </span>
    </Link>
  );
}
