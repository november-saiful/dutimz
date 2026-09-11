import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/constants/app";

const LOCALE_COOKIE = "dutimz-locale";

/** Resolve locale on the server: cookie first, else default (bn). */
export async function getLocaleServer(): Promise<Locale> {
  const cookieStore = cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  if (value && (LOCALES as readonly string[]).includes(value)) {
    return value as Locale;
  }
  return DEFAULT_LOCALE;
}

export { LOCALE_COOKIE };
