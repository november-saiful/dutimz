import type { Metadata } from "next";
import { ContentEditor } from "@/components/reporter/ContentEditor";
import { getActiveCategories } from "@/lib/data/queries";
import { getAuthContext } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "New story",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function NewContentPage() {
  const { profile } = await getAuthContext();
  const categories = await getActiveCategories();
  const role = (profile?.role ?? "reporter") as "reporter" | "moderator" | "admin";

  return (
    <div className="container mt-8 max-w-4xl">
      <ContentEditor categories={categories} role={role} initialContent={null} />
    </div>
  );
}
