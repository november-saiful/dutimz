import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_LOCALE, type Locale } from "@/lib/constants/app";

interface LocaleStore {
  locale: Locale;
  setLocale: (locale?: Locale) => void;
}

/**
 * Bangla-only locale store. The locale is always "bn" — the store persists
 * for backward-compat with existing localStorage data but switching is
 * disabled.
 */
export const useLocaleStore = create<LocaleStore>()(
  persist(
    () => ({
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
    }),
    { name: "dutimz-locale" },
  ),
);
