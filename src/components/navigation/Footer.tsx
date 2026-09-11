import Link from "next/link";
import type { Category } from "@/types";
import { translate } from "@/lib/i18n/dictionary";
import { SITE_NAME_BN } from "@/lib/constants/brand";
import { SITE, DEFAULT_LOCALE } from "@/lib/constants/app";

export function Footer({ categories }: { categories: Category[] }) {
  const locale = DEFAULT_LOCALE;
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const year = new Date().getFullYear();

  return (
    <footer className="no-print mt-16 border-t border-white/20 bg-white/40 backdrop-blur-glass dark:bg-black/40">
      <div className="container grid gap-8 py-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="text-lg font-bold">{SITE_NAME_BN}</p>
          <p className="mt-2 max-w-md text-sm opacity-70">{SITE.description}</p>
        </div>

        <div>
          <p className="text-sm font-bold">{t("footer.categories")}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {categories.slice(0, 6).map((cat) => (
              <li key={cat.id}>
                <Link href={`/category/${cat.slug}`} className="hover:underline">
                  {locale === "bn" ? cat.name_bn : cat.name_en}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-bold">{t("footer.follow")}</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><a href="#" className="hover:underline">Facebook</a></li>
            <li><a href="#" className="hover:underline">X / Twitter</a></li>
            <li><a href="#" className="hover:underline">YouTube</a></li>
            <li><Link href="/rss.xml" className="hover:underline">RSS</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/20 py-4 text-center text-xs opacity-60">
        © {year} {SITE_NAME_BN} (DUTIMZ). {t("footer.rights")}
      </div>
    </footer>
  );
}
