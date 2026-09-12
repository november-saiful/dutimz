export const runtime = "edge";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsDetailBody } from "@/components/content/NewsDetailBody";
import { getContentBySlug, getRelatedContents } from "@/lib/data/queries";
import { getLocaleServer } from "@/lib/i18n/server";
import { SITE } from "@/lib/constants/app";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const content = await getContentBySlug(params.slug);
  if (!content) return { title: "Not found" };
  const title = content.meta_title ?? (content.title_en ?? content.title_bn);
  const description =
    content.meta_description ??
    (content.excerpt_en ?? content.excerpt_bn ?? undefined);
  return {
    title,
    description,
    alternates: { canonical: `/documentaries/${content.slug}` },
    openGraph: {
      title,
      description,
      type: "video.other",
      images: content.thumbnail_url ? [content.thumbnail_url] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DocumentaryDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const content = await getContentBySlug(params.slug);
  if (!content || content.content_type !== "documentary") notFound();
  const locale = await getLocaleServer();
  const related = await getRelatedContents(content, 6);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: locale === "bn" ? content.title_bn : (content.title_en ?? content.title_bn),
    description: content.excerpt_en ?? content.excerpt_bn ?? undefined,
    thumbnailUrl: content.thumbnail_url ? [content.thumbnail_url] : undefined,
    uploadDate: content.published_at ?? content.created_at,
    embedUrl: content.video_url ?? undefined,
    publisher: { "@type": "Organization", name: SITE.name },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NewsDetailBody content={content} related={related} locale={locale} showVideoEmbed />
    </>
  );
}
