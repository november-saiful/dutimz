import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { DeskJump } from "@/components/dashboard/desk-jump";
import { StoryArt } from "@/components/dashboard/story-card";
import { storyUrl, type StoryItem } from "@/components/dashboard/story-blocks";
import { RelativeTime } from "@/components/ui/relative-time";
import { bn } from "@/lib/site";

/**
 * The wide front page, printed the way the attached newspaper is: a lead story
 * split between text and picture, a desk band with tab links, two briefs, the
 * reader's own vote split, and a desk index in the foot of the column. The
 * sidebar carries one long read, two small cards, a byline rail and a picture
 * story. Every slot is filled from the same newest-first `StoryItem` list the
 * phone deck prints, wrapped around when the desk is short — nothing is
 * invented. The reference's read times, election totals and photo credits have
 * no data behind them here, so links, vote counts and live desk names take
 * their place.
 *
 * The phone keeps its own picture-led home below the breakpoint; both editions
 * ship in the cached HTML and CSS picks one.
 */

function at(items: StoryItem[], index: number): StoryItem {
  return items[index % items.length];
}

function Meta({ item }: { item: StoryItem }) {
  return (
    <p className="np-meta">
      <RelativeTime value={item.publishedAt} fallback={item.when} />
    </p>
  );
}

function TitleLink({ item, className }: { item: StoryItem; className?: string }) {
  return (
    <Link href={storyUrl(item)} className={className}>
      {item.title}
    </Link>
  );
}

function initialFor(byline: string): string {
  return byline.trim().charAt(0) || "ঢ";
}

/** One of the two vote blocks: the reader's real split on a story. */
function VoteBlock({ item }: { item: StoryItem }) {
  const up = item.upvotes;
  const down = item.downvotes;
  const total = up + down;
  const upShare = total ? Math.round((up / total) * 100) : 0;
  const downShare = total ? 100 - upShare : 0;

  return (
    <article className="np-vote">
      <Link href={storyUrl(item)} className="np-vote-head">
        <span className="np-vote-kicker">{item.section}</span>
        <span className="np-vote-title">{item.title}</span>
      </Link>
      <div className="np-vote-nums">
        <span className="np-big np-up">{bn(up)}</span>
        <span>পক্ষে</span>
        <span className="np-vote-spacer" />
        <span>বিপক্ষে</span>
        <span className="np-big np-down">{bn(down)}</span>
      </div>
      <div className={total ? "np-track" : "np-track np-track-empty"} aria-hidden>
        {total > 0 && <span className="np-fill-up" style={{ width: `${upShare}%` }} />}
        {total > 0 && <span className="np-fill-down" style={{ width: `${downShare}%` }} />}
      </div>
      <div className="np-vote-foot">
        <span>{total ? `${bn(total)} ভোট` : "এখনো কোনো ভোট পড়েনি"}</span>
        <span>{total ? `${bn(upShare)}% পক্ষে` : ""}</span>
      </div>
    </article>
  );
}

export function WebHome({
  items,
  sections,
}: {
  items: StoryItem[];
  sections: { slug: string; label: string }[];
}) {
  if (!items.length) return null;

  const lead = at(items, 0);
  const second = at(items, 1);
  const bandLead = at(items, 2);
  const bullets = [3, 4, 5].map((slot) => at(items, slot));
  const subStories = [6, 7].map((slot) => at(items, slot));
  const bandPicture = at(items, 8);
  const shorts = [9, 10].map((slot) => at(items, slot));
  const feature = at(items, 11);
  const minis = [12, 13].map((slot) => at(items, slot));
  const picture = at(items, 18);

  // The desks as tab links, capped so the row stays one line at the narrow end
  // of the breakpoint. The band's own desk wears the filled chip.
  const desks = sections.filter((section) => section.slug !== "all");
  const tabs = desks.slice(0, 6);
  const deskIndex = desks.slice(0, 4).map((desk) => ({
    desk,
    item: items.find((entry) => entry.sectionSlug === desk.slug),
  }));

  const voted = [...items]
    .sort((a, b) => b.upvotes + b.downvotes - (a.upvotes + a.downvotes))
    .slice(0, 2);

  // The byline rail: one story per writer, in the order the front page prints
  // them, so a name never appears twice and the rail is a real index of the
  // desk's authors rather than a fixed list.
  const writers: StoryItem[] = [];
  const seenWriters = new Set<string>();
  for (const item of items) {
    if (seenWriters.has(item.byline)) continue;
    seenWriters.add(item.byline);
    writers.push(item);
    if (writers.length === 3) break;
  }

  return (
    <div className="web-home">
      <main className="np-main print-container">
        <div className="np-left">
          <section className="np-lead" aria-label="প্রধান প্রতিবেদন">
            <div className="np-lead-text">
              <h1 className="np-lead-title">
                <TitleLink item={lead} />
              </h1>
              <p className="np-lead-desc">{lead.excerpt}</p>
              <p className="np-meta">
                {lead.bylineHref ? (
                  <Link href={lead.bylineHref} className="np-byline">
                    {lead.byline}
                  </Link>
                ) : (
                  <span className="np-byline">{lead.byline}</span>
                )}
                <span aria-hidden> · </span>
                <RelativeTime value={lead.publishedAt} fallback={lead.when} />
              </p>
              <div className="np-divider" aria-hidden />
              <h2 className="np-second-title">
                <TitleLink item={second} />
              </h2>
              <Meta item={second} />
            </div>
            {/*
              The text and the picture are separate links to the same report:
              the headline stays selectable and the picture still takes the
              reader to the story.
            */}
            <Link href={storyUrl(lead)} className="np-figure-link np-lead-figure">
              <StoryArt
                imageUrl={lead.image}
                title={lead.title}
                className="np-figure"
                sizes="(max-width: 1180px) 42vw, 540px"
              />
            </Link>
          </section>

          <section className="np-block" aria-label="নিউজরুম">
            <nav className="np-tabs" aria-label="বিভাগ">
              {tabs.map((section) => {
                const current = section.slug === bandLead.sectionSlug;
                return (
                  <Link
                    key={section.slug}
                    href={`/category/${section.slug}/`}
                    className={current ? "np-tab np-tab-active" : "np-tab"}
                    aria-current={current ? "page" : undefined}
                  >
                    {section.label}
                  </Link>
                );
              })}
            </nav>

            <div className="np-split">
              <div className="np-band-text">
                <h2 className="np-band-title">
                  <TitleLink item={bandLead} />
                </h2>
                <ul className="np-bullets">
                  {bullets.map((item, index) => (
                    <li key={`${item.slug}-${index}`}>
                      <Link href={storyUrl(item)}>{item.title}</Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/category/${bandLead.sectionSlug}/`}
                  className="np-more"
                >
                  আরও আপডেট
                  <ArrowRight size={12} strokeWidth={2.4} aria-hidden />
                </Link>

                <div className="np-substories">
                  {subStories.map((item, index) => (
                    <div key={`${item.slug}-${index}`} className="np-substory">
                      <h3>
                        <TitleLink item={item} />
                      </h3>
                      <Meta item={item} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="np-band-image">
                <Link href={storyUrl(bandPicture)} className="np-figure-link">
                  <StoryArt
                    imageUrl={bandPicture.image}
                    title={bandPicture.title}
                    className="np-figure np-portrait"
                    sizes="(max-width: 1180px) 30vw, 380px"
                  />
                </Link>
                <h3>
                  <TitleLink item={bandPicture} />
                </h3>
                <p>{bandPicture.excerpt}</p>
                <Meta item={bandPicture} />
              </div>
            </div>
          </section>

          <div className="np-pair">
            {shorts.map((item, index) => (
              <article key={`${item.slug}-${index}`} className="np-small">
                <Link href={storyUrl(item)} className="np-small-fig">
                  <StoryArt
                    imageUrl={item.image}
                    title={item.title}
                    className="np-figure"
                    sizes="100px"
                  />
                </Link>
                <div className="np-small-text">
                  <h3>
                    <TitleLink item={item} />
                  </h3>
                  <Meta item={item} />
                </div>
              </article>
            ))}
          </div>

          <section className="np-votes" aria-label="পাঠকের রায়">
            <h2 className="np-band-label">পাঠকের রায়</h2>
            <div className="np-vote-grid">
              {voted.map((item) => (
                <VoteBlock key={item.id} item={item} />
              ))}
            </div>
          </section>

          <section className="np-desks" aria-label="বিভাগ">
            <div>
              <h2 className="np-band-label">বিভাগ</h2>
              <div className="np-desk-grid">
                {deskIndex.map(({ desk, item }) => (
                  <article key={desk.slug} className="np-desk">
                    <Link href={`/category/${desk.slug}/`} className="np-desk-label">
                      {desk.label}
                    </Link>
                    {item ? (
                      <>
                        <h3 className="np-desk-title">
                          <TitleLink item={item} />
                        </h3>
                        <Meta item={item} />
                      </>
                    ) : (
                      <p className="np-desk-empty">এই বিভাগে এখনো প্রতিবেদন নেই।</p>
                    )}
                  </article>
                ))}
              </div>
            </div>
            <div className="np-desks-side">
              <h2 className="np-band-label">সব বিভাগ</h2>
              <DeskJump sections={sections} />
            </div>
          </section>
        </div>

        <aside className="np-side">
          <article className="np-side-feature">
            <Link href={storyUrl(feature)} className="np-figure-link">
              <StoryArt
                imageUrl={feature.image}
                title={feature.title}
                className="np-figure np-side-figure"
                sizes="(max-width: 1180px) 30vw, 400px"
              />
            </Link>
            <h3>
              <TitleLink item={feature} />
            </h3>
            <p>{feature.excerpt}</p>
            <Meta item={feature} />
          </article>

          <div className="np-minis">
            {minis.map((item, index) => (
              <article key={`${item.slug}-${index}`} className="np-mini">
                <Link href={storyUrl(item)} className="np-mini-fig">
                  <StoryArt
                    imageUrl={item.image}
                    title={item.title}
                    className="np-figure"
                    sizes="180px"
                  />
                </Link>
                <h4>
                  <TitleLink item={item} />
                </h4>
                <Meta item={item} />
              </article>
            ))}
          </div>

          <section className="np-writers" aria-label="লেখক">
            <header className="np-writers-head">
              <h2>লেখক</h2>
              <Link href="/about/">
                সব লেখক
                <ArrowRight size={12} strokeWidth={2.4} aria-hidden />
              </Link>
            </header>
            {writers.map((item) => {
              const who = (
                <>
                  <span className="np-writer-text">
                    <span className="np-writer-name">{item.byline}</span>
                    <span className="np-writer-story">{item.title}</span>
                  </span>
                  <span className="np-avatar" aria-hidden>
                    {initialFor(item.byline)}
                  </span>
                </>
              );
              return item.bylineHref ? (
                <Link key={item.byline} href={item.bylineHref} className="np-writer">
                  {who}
                </Link>
              ) : (
                <Link key={item.byline} href={storyUrl(item)} className="np-writer">
                  {who}
                </Link>
              );
            })}
          </section>

          <article className="np-picture">
            <Link href={storyUrl(picture)} className="np-figure-link">
              <StoryArt
                imageUrl={picture.image}
                title={picture.title}
                className="np-figure np-square"
                sizes="(max-width: 1180px) 30vw, 400px"
              />
            </Link>
            <h3>
              <TitleLink item={picture} />
            </h3>
            <Meta item={picture} />
          </article>
        </aside>
      </main>
    </div>
  );
}
