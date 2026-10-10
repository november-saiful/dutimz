import Link from "next/link";

import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { PaperWordmark } from "@/components/dashboard/paper-wordmark";
import { ShareStory } from "@/components/dashboard/share-story";
import { StoryArt, StoryCard } from "@/components/dashboard/story-card";
import { bn, formatDateBn, mediaUrlFor } from "@/lib/site";
import {
  getLatestStories,
  isDemoMode,
  previewStories,
  type PreviewStory,
} from "@/lib/stories";
import { storyCategory, storyCredit, type Story } from "@/lib/supabase";

// Rendered per request so an approved story is on the front page the moment it is approved. The
// 30 second page cache this used to be only refreshed when a background regeneration ran, so a
// story could stay off the front page for hours, and a hard refresh did not help.
export const dynamic = "force-dynamic";

/** One card's worth of a story, whether it came from the archive or the preview fixture. */
type Dispatch = {
  slug: string;
  title: string;
  excerpt: string;
  section: string;
  sectionSlug: string;
  byline: string;
  bylineHref: string;
  when: string;
  publishedAt: string | null;
  image: string | null;
};

function fromStory(story: Story): Dispatch {
  const category = storyCategory(story);
  const credit = storyCredit(story);
  return {
    slug: story.slug,
    title: story.title,
    excerpt: story.excerpt,
    section: category.title_bn,
    sectionSlug: category.slug,
    byline: credit.name,
    bylineHref: credit.href,
    when: formatDateBn(story.published_at),
    publishedAt: story.published_at,
    image: story.hero_media_key ? mediaUrlFor(story.hero_media_key) : null,
  };
}

function fromPreview(story: PreviewStory): Dispatch {
  return {
    slug: story.slug,
    title: story.title,
    excerpt: story.excerpt,
    section: story.category,
    sectionSlug: story.categorySlug,
    byline: story.author,
    bylineHref: "",
    when: story.time,
    publishedAt: null,
    image: story.imageUrl ?? null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The byline and date line every card shares: section • writer • date. */
function Meta({ item }: { item: Dispatch }) {
  return (
    <div className="mt-2 flex items-center gap-[7px] text-[10.5px] tracking-[0.05em] text-muted-foreground">
      <span>{item.section}</span>
      <i className="not-italic opacity-60">•</i>
      {item.bylineHref ? (
        <Link href={item.bylineHref} className="hover:text-highlight">
          {item.byline}
        </Link>
      ) : (
        <span>{item.byline}</span>
      )}
      <i className="not-italic opacity-60">•</i>
      <time>{item.when}</time>
    </div>
  );
}

/** The front page's desk callouts. They point at the real places the site asks readers to go. */
function DeskCallout({
  kicker,
  title,
  points,
  href,
  cta,
}: {
  kicker: string;
  title: string;
  points: string[];
  href: string;
  cta: string;
}) {
  return (
    <aside className="flex min-w-0 flex-col gap-3 border border-strong bg-background p-4 transition-colors duration-300 hover:border-highlight">
      <p className="text-[10px] font-semibold tracking-[0.1em] text-highlight uppercase">
        {kicker}
      </p>
      <h3 className="font-serif text-[19px] leading-snug font-bold">{title}</h3>
      <ol className="grid gap-[7px]">
        {points.map((point, index) => (
          <li key={point} className="flex gap-[9px] text-[11px] leading-relaxed text-muted-foreground">
            <span className="min-w-3 font-bold text-foreground">{index + 1}.</span>
            {point}
          </li>
        ))}
      </ol>
      <Link
        href={href}
        className="mt-auto inline-flex w-fit items-center border border-strong px-4 py-2 text-[11.5px] font-semibold tracking-[0.03em] transition-colors duration-300 hover:border-primary hover:bg-primary hover:text-primary-foreground"
      >
        {cta}
      </Link>
    </aside>
  );
}

/** The finale's art when no lead picture exists: a flat plum field with a lilac horizon. */
function HorizonScene() {
  return (
    <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden>
      <rect width="800" height="500" fill="#5f2367" />
      <circle cx="520" cy="300" r="120" fill="#a370a0" opacity=".6" />
      <rect y="382" width="800" height="118" fill="#2a0f2e" />
      <rect y="380" width="800" height="5" fill="#a370a0" />
    </svg>
  );
}

function EmptyDesk() {
  return (
    <div className="col-span-full border border-dashed border-strong px-5 py-16 text-center">
      <h3 className="mb-2 font-serif text-2xl">এই ডেস্কে এখনো কিছু নেই</h3>
      <p className="text-xs text-muted-foreground">
        নতুন প্রতিবেদন প্রকাশিত হলে এখানে দেখানো হবে। নিজের প্রতিবেদন পাঠাতে{" "}
        <Link href="/account/write/" className="underline underline-offset-4">
          প্রতিবেদন লিখুন
        </Link>
        ।
      </p>
    </div>
  );
}

export default async function HomePage() {
  const demo = isDemoMode();
  // One read serves the whole front page: the slots, the latest list and the feed below them.
  const stories = demo ? [] : await getLatestStories(25);
  const items: Dispatch[] = demo
    ? previewStories.map(fromPreview)
    : stories.map(fromStory);

  const lead = items[0];
  const picasso = items[1];
  const latest = items.slice(0, 5);
  const battles = items[2];
  const fox = items[3];
  const egypt = items[4];
  const below = stories.slice(5);
  const freshCount = items.filter(
    (item) =>
      item.publishedAt !== null &&
      Date.now() - new Date(item.publishedAt).getTime() < DAY_MS,
  ).length;
  const finaleImage = lead?.image ?? null;

  return (
    <DutimzShell title="স্বাগতম">
      {items.length === 0 ? (
        <div className="grid grid-cols-1">
          <EmptyDesk />
        </div>
      ) : (
        <>
          {/*
            The front page is one 12-column grid, collapsing to six columns on tablets and one on
            phones. Source order leads with the newest report; `xl:order-first` puts the second
            story in the left-hand slot the design gives it.
          */}
          <section
            aria-label="প্রধান প্রতিবেদন"
            className="grid grid-cols-1 gap-[26px] md:grid-cols-6 xl:grid-cols-12"
          >
            {lead && (
              <article
                className="paper-rise box-border flex min-w-0 flex-col border border-strong bg-background p-[18px] text-center transition-colors duration-300 hover:border-highlight md:col-span-6 xl:col-span-4"
                style={{ "--d": "0.12s" } as React.CSSProperties}
              >
                <h2 className="font-serif text-[clamp(21px,2vw,27px)] leading-[1.16] font-bold">
                  <Link href={`/news/${encodeURIComponent(lead.slug)}/`} className="hover:text-highlight">
                    {lead.title}
                  </Link>
                </h2>
                <div className="mt-2 flex items-center justify-center gap-[7px] text-[10.5px] tracking-[0.05em] text-muted-foreground">
                  <span>{lead.section}</span>
                  <i className="not-italic opacity-60">•</i>
                  <span>{lead.byline}</span>
                  <i className="not-italic opacity-60">•</i>
                  <time>{lead.when}</time>
                </div>
                <Link
                  href={`/news/${encodeURIComponent(lead.slug)}/`}
                  aria-label={`পড়ুন: ${lead.title}`}
                  className="my-3.5 block aspect-[16/10] overflow-hidden border border-line"
                >
                  <StoryArt
                    slug={lead.sectionSlug}
                    imageUrl={lead.image}
                    title={lead.title}
                    className="size-full"
                  />
                </Link>
                <p className="text-[11.5px] leading-[1.7] text-muted-foreground">{lead.excerpt}</p>
              </article>
            )}

            {picasso && (
              <article
                className="paper-rise flex min-w-0 flex-col xl:order-first md:col-span-3 xl:col-span-3"
                style={{ "--d": "0.05s" } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-serif text-[19px] leading-[1.16] font-bold">
                    <Link href={`/news/${encodeURIComponent(picasso.slug)}/`} className="hover:text-highlight">
                      {picasso.title}
                    </Link>
                  </h2>
                  <ShareStory href={`/news/${encodeURIComponent(picasso.slug)}/`} label={picasso.title} />
                </div>
                <Meta item={picasso} />
                <hr className="my-3 border-0 border-t border-line" />
                <Link
                  href={`/news/${encodeURIComponent(picasso.slug)}/`}
                  aria-label={`পড়ুন: ${picasso.title}`}
                  className="mb-3 block aspect-[4/3] overflow-hidden border border-line"
                >
                  <StoryArt slug={picasso.sectionSlug} imageUrl={picasso.image} title={picasso.title} className="size-full" />
                </Link>
                <p className="text-[11.5px] leading-[1.7] text-muted-foreground">{picasso.excerpt}</p>
              </article>
            )}

            {latest.length > 0 && (
              <aside
                className="paper-rise flex min-w-0 flex-col border border-strong bg-background md:col-span-3 xl:col-span-2"
                style={{ "--d": "0.2s" } as React.CSSProperties}
              >
                <div className="flex items-center justify-between gap-2 border-b border-strong px-3.5 py-3">
                  <h3 className="font-serif text-[15px] font-bold">সর্বশেষ প্রতিবেদন</h3>
                  {freshCount > 0 && (
                    <span className="inline-flex items-center bg-primary px-2 py-[3px] text-[9.5px] font-bold tracking-[0.08em] text-primary-foreground uppercase">
                      {bn(freshCount)} নতুন
                    </span>
                  )}
                </div>
                <ol>
                  {latest.map((item, index) => (
                    <li key={item.slug} className="border-b border-line last:border-0">
                      <Link
                        href={`/news/${encodeURIComponent(item.slug)}/`}
                        className="group flex gap-3 px-3.5 py-[13px] transition-colors duration-300 hover:bg-paper-2"
                      >
                        <span className="min-w-[26px] font-serif text-[19px] leading-none font-semibold text-muted-foreground transition-colors duration-300 group-hover:text-highlight">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11.5px] leading-[1.4] font-semibold transition-colors duration-300 group-hover:text-highlight">
                            {item.title}
                          </span>
                          <span className="mt-[5px] block text-[9.5px] tracking-[0.05em] text-muted-foreground">
                            {item.when} • {item.byline}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </aside>
            )}

            {battles && (
              <article
                className="paper-rise flex min-w-0 flex-col md:col-span-3 xl:col-span-3"
                style={{ "--d": "0.26s" } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-serif text-[19px] leading-[1.16] font-bold">
                    <Link href={`/news/${encodeURIComponent(battles.slug)}/`} className="hover:text-highlight">
                      {battles.title}
                    </Link>
                  </h2>
                  <ShareStory href={`/news/${encodeURIComponent(battles.slug)}/`} label={battles.title} />
                </div>
                <Meta item={battles} />
                <hr className="my-3 border-0 border-t border-line" />
                <Link
                  href={`/news/${encodeURIComponent(battles.slug)}/`}
                  aria-label={`পড়ুন: ${battles.title}`}
                  className="mb-3 block aspect-[4/3] overflow-hidden border border-line"
                >
                  <StoryArt slug={battles.sectionSlug} imageUrl={battles.image} title={battles.title} className="size-full" />
                </Link>
                <p className="text-[11.5px] leading-[1.7] text-muted-foreground">{battles.excerpt}</p>
              </article>
            )}

            {fox && (
              <article
                className="paper-rise flex min-w-0 flex-col md:col-span-3 xl:col-span-3"
                style={{ "--d": "0.05s" } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-serif text-[19px] leading-[1.16] font-bold">
                    <Link href={`/news/${encodeURIComponent(fox.slug)}/`} className="hover:text-highlight">
                      {fox.title}
                    </Link>
                  </h2>
                  <ShareStory href={`/news/${encodeURIComponent(fox.slug)}/`} label={fox.title} />
                </div>
                <Meta item={fox} />
                <hr className="my-3 border-0 border-t border-line" />
                <Link
                  href={`/news/${encodeURIComponent(fox.slug)}/`}
                  aria-label={`পড়ুন: ${fox.title}`}
                  className="float-right mb-2 ml-3 aspect-[4/3] w-[46%] overflow-hidden border border-line"
                >
                  <StoryArt slug={fox.sectionSlug} imageUrl={fox.image} title={fox.title} className="size-full" />
                </Link>
                <p className="text-[11.5px] leading-[1.7] text-muted-foreground">{fox.excerpt}</p>
              </article>
            )}

            {egypt && (
              <article
                className="paper-rise box-border flex min-w-0 flex-col border border-strong bg-background p-[18px] transition-colors duration-300 hover:border-highlight md:col-span-6 xl:col-span-6 xl:row-span-2"
                style={{ "--d": "0.12s" } as React.CSSProperties}
              >
                <h2 className="text-center font-serif text-[clamp(24px,2.3vw,32px)] leading-[1.16] font-bold">
                  <Link href={`/news/${encodeURIComponent(egypt.slug)}/`} className="hover:text-highlight">
                    {egypt.title}
                  </Link>
                </h2>
                <div className="mt-2 flex items-center justify-center gap-[7px] text-[10.5px] tracking-[0.05em] text-muted-foreground">
                  <span>{egypt.section}</span>
                  <i className="not-italic opacity-60">•</i>
                  <span>{egypt.byline}</span>
                  <i className="not-italic opacity-60">•</i>
                  <time>{egypt.when}</time>
                </div>
                <div className="mt-3.5 grid gap-[18px] sm:grid-cols-[minmax(0,42%)_1fr]">
                  <Link
                    href={`/news/${encodeURIComponent(egypt.slug)}/`}
                    aria-label={`পড়ুন: ${egypt.title}`}
                    className="block aspect-[3/4] overflow-hidden border border-line"
                  >
                    <StoryArt slug={egypt.sectionSlug} imageUrl={egypt.image} title={egypt.title} className="size-full" />
                  </Link>
                  <p className="text-[11.5px] leading-[1.7] text-muted-foreground">{egypt.excerpt}</p>
                </div>
              </article>
            )}

            <DeskCallout
              kicker="প্রতিবেদক প্রয়োজন"
              title="আপনার গল্পটিও বলুন"
              points={[
                "ঢাকা বিশ্ববিদ্যালয়ের যেকোনো শিক্ষার্থী বা পাঠক প্রতিবেদন পাঠাতে পারেন",
                "প্রকাশের আগে সম্পাদকীয় ডেস্ক প্রতিবেদনটি যাচাই করে",
                "প্রকাশিত প্রতিবেদনের জন্য নির্ধারিত সম্মানী পাওয়া যায়",
                "প্রকাশের পরের যেকোনো সংশোধন সর্বজনীনভাবে দেখানো হয়",
              ]}
              href="/account/write/"
              cta="প্রতিবেদন পাঠান"
            />

            <DeskCallout
              kicker="স্পটলাইট"
              title="ক্যাম্পাসের সমস্যা, প্রকাশ্যে"
              points={[
                "সদস্যরা ক্যাম্পাসের সমস্যা ও প্রস্তাব নিয়ে ইস্যু খুলতে পারেন",
                "প্রতিটি ইস্যুতে সর্বোচ্চ দশটি ছবি যুক্ত করা যায়",
                "কোন বিভাগ সমাধান করেছে, তা পরিসংখ্যানে প্রকাশ পায়",
              ]}
              href="/spotlight/"
              cta="স্পটলাইটে যান"
            />
          </section>

          {/* The finale: the lead picture (or the paper's own horizon) settles once, then the name rises letter by letter. */}
          <section className="mt-2.5">
            <figure className="relative h-[clamp(240px,46vh,480px)] overflow-hidden">
              {finaleImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={finaleImage}
                  alt=""
                  className="size-full object-cover motion-safe:animate-[paper-settle_1.2s_ease-out_both]"
                />
              ) : (
                <div className="size-full motion-safe:animate-[paper-settle_1.2s_ease-out_both]">
                  <HorizonScene />
                </div>
              )}
            </figure>
            <PaperWordmark text="DUTIMZ" />
          </section>

          {below.length > 0 && (
            <section aria-label="আরও প্রতিবেদন" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {below.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </section>
          )}
        </>
      )}
    </DutimzShell>
  );
}
