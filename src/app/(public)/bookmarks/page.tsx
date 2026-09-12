import type { Metadata } from "next";
import { BookmarkGrid } from "@/components/content/BookmarkGrid";

export const metadata: Metadata = {
  title: "Bookmarks",
  robots: { index: false },
};

export default async function BookmarksPage() {
  return (
    <div className="container mt-10 max-w-3xl">
      <BookmarkGrid />
    </div>
  );
}
