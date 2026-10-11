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
  { label: "বিশ্ববিদ্যালয়", slug: "university" },
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

export function slugArtClass(slug: string): string {
  if (slug.includes("culture") || slug.includes("opinion"))
    return "art-culture";
  if (slug.includes("university")) return "art-library";
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
