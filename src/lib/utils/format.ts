import slugifyLib from "slugify";
import { READING_TIME } from "@/lib/constants/app";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** Convert Latin digits to Bangla numerals (০-৯) per Appendix D. */
export function toBanglaNumerals(value: string | number): string {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

/** Localized number formatting. */
export function formatCount(count: number, locale: "bn" | "en"): string {
  const grouped = new Intl.NumberFormat("en-US").format(count);
  return locale === "bn" ? toBanglaNumerals(grouped) : grouped;
}

const BN_MONTHS = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "৮ সেপ্টেম্বর, ২০২৬" (bn) or "8 September, 2026" (en). */
export function formatDate(
  iso: string | Date,
  locale: "bn" | "en",
): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const day = date.getDate();
  const month = (EN_MONTHS[date.getMonth()] ?? "").toLowerCase();
  const bnMonth =
    BN_MONTHS[date.getMonth()] ?? EN_MONTHS[date.getMonth()] ?? "";
  const year = date.getFullYear();
  if (locale === "bn") {
    return `${toBanglaNumerals(day)} ${bnMonth}, ${toBanglaNumerals(year)}`;
  }
  const monthName =
    EN_MONTHS.find((m) => m.toLowerCase() === month) ??
    EN_MONTHS[date.getMonth()] ??
    "";
  return `${day} ${monthName}, ${year}`;
}

/** Estimate reading minutes from plain text. */
export function estimateReadTime(body: string | null | undefined): number {
  if (!body) return 0;
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / READING_TIME.wordsPerMinute));
}

/** English-transliterated slug for SEO (Appendix D). */
export function slugify(text: string): string {
  return slugifyLib(text, { lower: true, strict: true, trim: true });
}

/** Strip HTML tags for excerpts/meta descriptions. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Basic email validation for client-side forms. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
