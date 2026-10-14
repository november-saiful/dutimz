import {
  Award,
  Backpack,
  Building2,
  Clock,
  Heart,
  LayoutGrid,
  Medal,
  Newspaper,
  Palette,
  Quote,
  Sparkles,
  Star,
  Tag,
  ThumbsUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";

/*
 * The desk flag: the section's own name with the section's own mark beside it.
 *
 * The ported design marked a section with a coloured rectangle — a bar that
 * said nothing and sat the same on "সর্বশেষ খবর" as on "ক্রীড়া". A drawn icon
 * says which desk this is at a glance, in the site's own colour rather than a
 * decorative block, and it is a real element (focusable-free, aria-hidden) that
 * a reader on a slow connection sees even if a font never arrives.
 *
 * The mark follows the label, so a desk keeps one mark wherever it appears:
 * the front page's bands, the article's aside and the empty-state head all read
 * from this one table. An unknown label — a desk an editor adds to the database
 * tomorrow — takes the generic tag rather than going bare.
 */
const FLAG_ICONS: Record<string, LucideIcon> = {
  // The front page's slots.
  "প্রধান প্রতিবেদন": Star,
  "সপ্তাহের সেরা": Award,
  "মাসের সেরা": Trophy,
  প্রস্তাবিত: ThumbsUp,
  "পাঠকের পছন্দ": Heart,
  "সর্বশেষ খবর": Clock,
  "আরও খবর": Newspaper,
  "আপনার জন্য আরও": Sparkles,
  // The desks themselves.
  "সব খবর": LayoutGrid,
  ক্যাম্পাস: Building2,
  "শিক্ষার্থী জীবন": Backpack,
  সংস্কৃতি: Palette,
  মতামত: Quote,
  ক্রীড়া: Medal,
};

/** A desk this table has never heard of is still a desk: it gets the tag. */
const FALLBACK_ICON = Tag;

/**
 * A desk's own mark, for anywhere the label is not the whole element: the top
 * bar's menu draws it beside the label's own text rather than as the `Flag`
 * lockup, and reads the same table so a desk wears one mark everywhere.
 */
export function flagIconFor(label: string): LucideIcon {
  return FLAG_ICONS[label.trim()] ?? FALLBACK_ICON;
}

export function Flag({ label, className }: { label: string; className?: string }) {
  const Icon = flagIconFor(label);
  return (
    <span className={className ? `flag ${className}` : "flag"}>
      <Icon className="flag-icon" size={17} strokeWidth={2.1} aria-hidden />
      {label}
    </span>
  );
}
