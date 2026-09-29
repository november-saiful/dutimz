export { mediaUrlFor, relativeTimeBn, slugArtClass } from "@/lib/site";

export type PreviewStoryLike = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  categorySlug: string;
  author: string;
  time: string;
  imageUrl?: string;
};
