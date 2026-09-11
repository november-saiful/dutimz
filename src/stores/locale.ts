import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LOCALE, type Locale } from "@/lib/constants/app";

interface LocaleStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/**
 * No "use client": this module is imported by both server and client code.
 * On the server it is inert (default locale); on the client it persists.
 * Phase 5+ will move to /bn/ /en/ URL-prefixed routes per feature #29.
 */
export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => set({ locale }),
    }),
    { name: "dutimz-locale" },
  ),
);
