import type { Locale } from "@/lib/constants/app";

/** DUTIMZ = ঢাকা ইউনিভার্সিটি টাইম্‌জ (Dhaka University Times). */
export const SITE_NAME_BN = "ঢাকা ইউনিভার্সিটি টাইম্‌জ";

export function siteName(locale: Locale): string {
  return locale === "bn" ? SITE_NAME_BN : "DUTIMZ";
}
