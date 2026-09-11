import { BreakingNewsTicker } from "@/components/glass/BreakingNewsTicker";
import { HomeSections } from "@/components/content/HomeSections";
import { getBreakingContents } from "@/lib/data/queries";
import { getLocaleServer } from "@/lib/i18n/server";

export const revalidate = 60;

export default async function HomePage() {
  const [breaking, locale] = await Promise.all([
    getBreakingContents(8),
    getLocaleServer(),
  ]);

  return (
    <>
      <BreakingNewsTicker items={breaking} locale={locale} />
      <HomeSections />
    </>
  );
}
