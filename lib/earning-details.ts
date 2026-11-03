import { bn } from "./site";

/*
  The earning formula's own vocabulary, shared by the member's balance page and the desk's wallet
  dialog. `details` is the jsonb the award trigger and the view settlement write into the ledger;
  this module turns it into the one-line Bengali breakdown a reader or an administrator reads.
*/

export type EarningDetails = {
  version?: number;
  base?: number;
  crime?: number;
  words?: { count?: number; bonus?: number } | null;
  hero?: number;
  gallery?: { count?: number; bonus?: number } | null;
  interview?: { kind?: string | null; bonus?: number } | null;
  questionnaire?: number;
  total?: number;
  views?: number;
  rate_per_view?: number;
  article_title?: string;
  deleted_article_id?: string;
  deleted_article_title?: string;
};

export const LEDGER_LABELS: Record<string, string> = {
  article_earning_held: "প্রতিবেদনের আয় (আটকে)",
  article_earning_available: "প্রতিবেদনের আয় (উত্তোলনযোগ্য)",
  view_earning_held: "ভিউ আয় (আটকে)",
  view_earning_available: "ভিউ আয় (উত্তোলনযোগ্য)",
  bonus_earning_held: "বোনাস (আটকে)",
  bonus_earning_available: "বোনাস (উত্তোলনযোগ্য)",
  penalty: "জরিমানা",
  profile_release: "প্রোফাইল সম্পূর্ণ হওয়ায় আয় ছাড়",
  withdrawal_reserve: "উত্তোলনের জন্য সংরক্ষিত",
  withdrawal_refund: "উত্তোলন বাতিল — অর্থ ফেরত",
  manual_adjustment: "কর্তৃপক্ষের সমন্বয়",
  article_deletion_clawback: "মুছে ফেলা প্রতিবেদনের আয় ফেরত নেওয়া",
};

/**
 * The human-readable line under a ledger entry: which formula pieces added up to the amount, or
 * how many views the batch counted. Returns null when the entry carries no breakdown.
 */
export function earningBreakdown(
  entryType: string,
  details: EarningDetails | null | undefined,
): string | null {
  if (!details) return null;
  if (entryType === "article_deletion_clawback") {
    const title = details.deleted_article_title ?? details.article_title;
    return title ? `প্রতিবেদন: ${title}` : null;
  }
  if (entryType === "penalty") {
    return typeof details.deleted_article_title === "string"
      ? `প্রতিবেদন: ${details.deleted_article_title}`
      : null;
  }
  if (entryType === "view_earning_available" || entryType === "view_earning_held") {
    if (typeof details.views !== "number") return null;
    const rate =
      typeof details.rate_per_view === "number"
        ? ` × ৳${details.rate_per_view}`
        : "";
    return `${bn(details.views)}টি ভিউ${rate}`;
  }
  if (
    entryType === "article_earning_available" ||
    entryType === "article_earning_held"
  ) {
    const parts: string[] = [];
    if (typeof details.deleted_article_title === "string")
      parts.push(`প্রতিবেদন: ${details.deleted_article_title}`);
    if (typeof details.base === "number") parts.push(`ভিত্তি ৳${details.base}`);
    if (typeof details.crime === "number" && details.crime > 0)
      parts.push(`অপরাধ +৳${details.crime}`);
    if (
      details.words &&
      typeof details.words.count === "number" &&
      typeof details.words.bonus === "number" &&
      details.words.bonus > 0
    ) {
      parts.push(`শব্দ ${bn(details.words.count)}টি +৳${details.words.bonus}`);
    }
    if (typeof details.hero === "number" && details.hero > 0)
      parts.push(`প্রচ্ছদ +৳${details.hero}`);
    if (
      details.gallery &&
      typeof details.gallery.count === "number" &&
      typeof details.gallery.bonus === "number" &&
      details.gallery.bonus > 0
    ) {
      parts.push(`গ্যালারি ${bn(details.gallery.count)}টি +৳${details.gallery.bonus}`);
    }
    if (details.interview && typeof details.interview.bonus === "number" && details.interview.bonus > 0)
      parts.push(`সাক্ষাৎকার +৳${details.interview.bonus}`);
    if (typeof details.questionnaire === "number" && details.questionnaire > 0)
      parts.push(`প্রশ্নমালা +৳${details.questionnaire}`);
    return parts.length ? parts.join(" · ") : null;
  }
  return null;
}
