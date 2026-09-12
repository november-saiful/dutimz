export const runtime = "edge";

import dynamic from "next/dynamic";
import { BreakingNewsTicker } from "@/components/glass/BreakingNewsTicker";
import { getBreakingContents } from "@/lib/data/queries";
import { getLocaleServer } from "@/lib/i18n/server";
import { organizationSchema, webSiteSchema } from "@/lib/seo/structuredData";

// Phase 6: Dynamic imports for heavy client components — reduces initial JS bundle
const HomeSections = dynamic(
  () => import("@/components/content/HomeSections").then((m) => m.HomeSections),
  { ssr: true, loading: () => <div className="container mt-10 h-96 animate-pulse rounded-xl" style={{ background: "var(--glass-bg)" }} /> },
);

export default async function HomePage() {
  const locale = await getLocaleServer();
  const breaking = await getBreakingContents(5);

  return (
    <>
      {/* Phase 6: Structured data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema()) }}
      />

      {breaking.length > 0 && <BreakingNewsTicker items={breaking} locale={locale} />}
      <HomeSections />
    </>
  );
}
