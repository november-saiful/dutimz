import { NewsletterForm } from "@/components/forms/NewsletterForm";
import { SectionHeading } from "@/components/content/SectionHeading";
import { translate } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/constants/app";

export function NewsletterCTA({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <section className="container my-12">
      <div className="glass-card flex flex-col items-center gap-4 p-8 text-center md:p-12">
        <SectionHeading title={t("section.newsletter")} />
        <p className="max-w-lg text-sm opacity-70">{t("section.newsletterBody")}</p>
        <NewsletterForm />
      </div>
    </section>
  );
}
