export const runtime = "edge";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewsDetailBody } from "@/components/content/NewsDetailBody";
import { getContentBySlug, getRelatedContents } from "@/lib/data/queries";
import { getLocaleServer } from "@/lib/i18n/server";

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
    alternates: { canonical: `/articles/${content.slug}` },
    openGraph: {
      title,
      description,
      type: "article",
      images: content.thumbnail_url ? [content.thumbnail_url] : undefined,
      publishedTime: content.published_at ?? undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ArticleDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const content = await getContentBySlug(params.slug);
  if (!content || content.content_type !== "article") notFound();
  const related = await getRelatedContents(content, 6);
  return <NewsDetailBody content={content} related={related} />;
}
