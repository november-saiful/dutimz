// NEXT_PUBLIC_* values are inlined into the bundle when the build runs, and a build
// environment that carries them as *empty* strings (CI exporting an unset repository
// variable) is inlined as "" — which neither `??` nor a Worker `vars` binding can undo.
// Empty therefore has to mean "unset", or the media host silently becomes "" and every
// image URL degrades to a relative /media/... path the portal cannot serve.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://dutimz.com"
).replace(/\/$/, "");

export const MEDIA_URL = (
  process.env.NEXT_PUBLIC_MEDIA_URL || "https://media.dutimz.com"
).replace(/\/$/, "");

export const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE !== "false" &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL;

export type Category = { label: string; slug: string };

export const CATEGORIES: Category[] = [
  { label: "সব খবর", slug: "all" },
  { label: "ক্যাম্পাস", slug: "campus" },
  { label: "শিক্ষার্থী জীবন", slug: "student-life" },
  { label: "সংস্কৃতি", slug: "culture" },
  { label: "মতামত", slug: "opinion" },
  { label: "ক্রীড়া", slug: "sports" },
];

export const CATEGORY_NAMES: Record<string, string> = Object.fromEntries(
  CATEGORIES.filter((c) => c.slug !== "all").map((c) => [c.slug, c.label]),
);

export function mediaUrlFor(mediaId: string): string {
  return `${MEDIA_URL}/media/${encodeURIComponent(mediaId)}`;
}

/** Spotlight photos live in their own bucket and are served from their own path. */
export function spotlightMediaUrlFor(mediaId: string): string {
  return `${MEDIA_URL}/spotlight/media/${encodeURIComponent(mediaId)}`;
}

/**
 * What a member's role is called on their own page and share card — the eyebrow
 * above their name reads "DUTIMZ Reporter", "DUTIMZ Admin". English, because it
 * is one masthead line beside the site's own wordmark; the Bengali name for the
 * same role already serves the dashboard, where the label describes an account
 * rather than introducing a person to a reader.
 *
 * `reader` is every signed-in member with no newsroom job, and their page says
 * "Member" rather than naming a rank they do not hold. An unknown or missing
 * role falls back to the same word.
 */
const ROLE_TITLES: Record<string, string> = {
  reader: "Member",
  reporter: "Reporter",
  moderator: "Moderator",
  admin: "Admin",
};

export function roleTitle(role: string | null | undefined): string {
  return ROLE_TITLES[(role ?? "").trim().toLowerCase()] ?? "Member";
}

export function slugArtClass(slug: string): string {
  if (slug.includes("culture") || slug.includes("opinion"))
    return "art-culture";
  if (slug.includes("student")) return "art-student";
  return "art-campus";
}

const bnDigits = new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 0 });

export function bn(n: number | null | undefined): string {
  return bnDigits.format(Number(n ?? 0));
}

export function bnMoney(amount: number): string {
  return `৳${bn(amount)}`;
}

export function relativeTimeBn(value: string | null | undefined): string {
  if (!value) return "সম্প্রতি";
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "এইমাত্র";
  if (hours < 24) return `${bn(hours)} ঘণ্টা আগে`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${bn(days)} দিন আগে`;
  return new Date(value).toLocaleDateString("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateBn(value: string): string {
  return new Date(value).toLocaleDateString("bn-BD", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
