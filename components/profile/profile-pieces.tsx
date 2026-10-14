import Link from "next/link";
import * as React from "react";
import type { LucideIcon } from "lucide-react";

/*
  The pieces of the editorial profile page — the band, the identity over its
  foot, the strip of numbers, a report row, the narrow column's blocks.
 *
 * Both profile pages are built from these: `/u/<handle>/` for any member and
  `/account/` for the member themselves. They are the same page in the reference
  design's shape, so they must not be two hand-rolled copies of it that drift —
  one band, one meta row, one row layout, one place a class name can be got wrong
  (`pf-`, and the stylesheet in `app/globals.css` explains why the prefix).
 *
 * Nothing here reaches for data. Every piece takes what it draws, which keeps the
 * fixtures, the browser queries and the server reads interchangeable.
 */

/** The band that opens the page: brand gradient, drifting blooms, one label. */
export function ProfileBand({
  tag,
  cover,
}: {
  tag: string;
  /**
   * The member's own cover photo, when they have set one. It sits *under* the
   * purple wash rather than replacing it, so every band — with a photo, with a
   * half-loaded photo, or with none — is the same editorial object.
   */
  cover?: string | null;
}) {
  return (
    <div className={`pf-band${cover ? " has-cover" : ""}`}>
      {cover ? <img className="pf-band-cover" src={cover} alt="" /> : null}
      <span className="pf-band-scrim" aria-hidden />
      <span className="pf-blob b1" aria-hidden />
      <span className="pf-blob b2" aria-hidden />
      <span className="pf-blob b3" aria-hidden />
      <span className="pf-band-tag">{tag}</span>
    </div>
  );
}

/** The small letterspaced line above the name, with its own blinking dot. */
export function ProfileKicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="pf-kicker">
      <i aria-hidden />
      {children}
    </span>
  );
}

/** Facts as one hairline row: an icon and a word each, never a card. */
export function ProfileMeta({
  items,
}: {
  items: { icon: LucideIcon; text: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="pf-meta">
      {items.map(({ icon: Icon, text }) => (
        <span className="pf-meta-item" key={text}>
          <Icon aria-hidden />
          {text}
        </span>
      ))}
    </div>
  );
}

/** The strip of real numbers. Plain text, because every one of them is a fact. */
export function ProfileStats({
  stats,
}: {
  stats: { value: string; label: string }[];
}) {
  return (
    <div className="pf-stats">
      {stats.map((stat) => (
        <div className="pf-stat" key={stat.label}>
          <span className="pf-stat-num">{stat.value}</span>
          <span className="pf-stat-label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

/** A section's editorial rule: title left, its own summary right. */
export function ProfileSectionHead({
  id,
  title,
  sub,
}: {
  id?: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="pf-sec">
      <h2 className="pf-sec-title" id={id}>
        {title}
      </h2>
      {sub ? <span className="pf-sec-sub">{sub}</span> : null}
    </div>
  );
}

/**
 * One report as a row: picture, section, headline, a line of the text, its facts.
 *
 * The headline is the link, not the row, because the dashboard's rows carry a
 * button of their own — a button inside an anchor is neither valid nor
 * reachable. `href` names the story's own address and the row picks its layout
 * from whether it has one.
 */
export function ProfileEntry({
  href,
  art,
  category,
  title,
  excerpt,
  meta,
  actions,
  wide = false,
}: {
  href?: string | null;
  /** The story's own picture, or nothing for a row that has none. */
  art?: React.ReactNode;
  category?: string | null;
  title: string;
  excerpt?: string | null;
  /** Dates, statuses, read counts — the row's own facts, in order. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** A row with no picture takes the full width instead of an empty column. */
  wide?: boolean;
}) {
  const inner = (
    <>
      {art ? (
        <span className="pf-thumb">{art}</span>
      ) : null}
      <div className="pf-entry-body">
        {category ? <span className="pf-cat">{category}</span> : null}
        {href ? (
          <Link className="pf-title" href={href}>
            {title}
          </Link>
        ) : (
          <span className="pf-title">{title}</span>
        )}
        {excerpt ? <p className="pf-excerpt">{excerpt}</p> : null}
        {meta ? <div className="pf-entry-meta">{meta}</div> : null}
        {actions ? <div className="pf-entry-actions">{actions}</div> : null}
      </div>
    </>
  );

  return (
    <article className="pf-entry">
      <div
        className={`${href ? "pf-entry-link" : "pf-entry-static"}${
          wide ? " pf-no-art" : ""
        }`}
      >
        {inner}
      </div>
    </article>
  );
}

/** A separator between two facts inside a row's meta line. */
export function EntryDot() {
  return <span className="dot" aria-hidden />;
}

/** One block of the narrow column, under its own heavy rule. */
export function ProfileSideBlock({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pf-side-block">
      <h2 className="pf-side-label">
        <Icon aria-hidden />
        {label}
      </h2>
      {children}
    </section>
  );
}

/** The dark block that closes the column: one ask, one way to answer it. */
export function ProfileTip({
  kicker,
  title,
  body,
  action,
}: {
  kicker: string;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <section className="pf-tip">
      <span className="pf-tip-kicker">{kicker}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </section>
  );
}
