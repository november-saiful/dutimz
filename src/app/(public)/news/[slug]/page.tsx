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
    (content.excerpt_en ?? content.excerpt_bn ?? SITE.description);
  const ogImage = content.og_image_url ?? content.thumbnail_url ?? undefined;

  return {
    title,
    description,
    alternates: { canonical: `/news/${content.slug}` },
    openGraph: {
      title,
      description,
      type: "article",
      images: ogImage ? [{ url: ogImage }] : undefined,
      publishedTime: content.published_at ?? undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function NewsDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const locale = await getLocaleServer();
  const content = await getContentBySlug(params.slug);
  if (!content || content.content_type !== "news") notFound();

  const related = await getRelatedContents(content, 6);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: locale === "bn" ? content.title_bn : (content.title_en ?? content.title_bn),
    description: content.excerpt_en ?? content.excerpt_bn ?? undefined,
    image: content.thumbnail_url ? [content.thumbnail_url] : undefined,
    datePublished: content.published_at ?? undefined,
    dateModified: content.updated_at,
    author: content.author
      ? {
          "@type": "Person",
          name: content.author.display_name ?? content.author.username,
        }
      : undefined,
    publisher: { "@type": "Organization", name: SITE.name },
    mainEntityOfPage: `${SITE.url}/news/${content.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NewsDetailBody content={content} related={related} locale={locale} />
    </>
  );
}
