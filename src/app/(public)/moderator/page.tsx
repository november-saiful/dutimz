export const runtime = "edge";

import type { Metadata } from "next";
import { getAuthContext } from "@/lib/auth/server";
import { ModerationQueue } from "@/components/reporter/ModerationQueue";

export const metadata: Metadata = {
  title: "Review queue",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Moderator desk (Phase 3): stories pending review plus recently
 * rejected/published items, with approve / reject / request-changes actions.
 */
export default async function ModeratorPage() {
  const { profile } = await getAuthContext();
  const role = (profile?.role ?? "moderator") as "moderator" | "admin";

  return (
    <div className="container mt-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">পর্যালোচনা কিউ / Review queue</h1>
        <p className="text-sm opacity-60">
          জমা পড়া লেখাগুলো যাচাই করে অনুমোদন, প্রত্যাখ্যান বা সংশোধনের জন্য ফেরত পাঠান।
        </p>
      </div>
      <ModerationQueue role={role} />
    </div>
  );
}
