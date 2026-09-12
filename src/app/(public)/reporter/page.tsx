export const runtime = "edge";

import type { Metadata } from "next";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth/server";
import { AUTH } from "@/lib/auth/config";
import { StatusBadge } from "@/components/reporter/StatusBadge";
import { ReporterQueue } from "@/components/reporter/ReporterQueue";
import { getActiveCategories } from "@/lib/data/queries";

export const metadata: Metadata = {
  title: "Reporter desk",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Reporter desk (Phase 3): the reporter's own stories across every workflow
 * state, with counts per state. Server shell + interactive queue client.
 */
export default async function ReporterPage() {
  const { user, profile } = await getAuthContext();

  // Defense in depth: middleware guards /reporter, but without Supabase env
  // (mock mode) anyone can open the desk against the mock store.
  if (!user || !profile) {
    // Allow mock-mode exploration; real deployments redirect.
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return (
        <div className="container mt-12 max-w-xl">
          <div className="glass-card p-8 text-center">
            <h1 className="text-xl font-bold">লগইন প্রয়োজন / Login required</h1>
            <Link href={AUTH.loginPath} className="mt-4 inline-block underline">
              {AUTH.loginPath}
            </Link>
          </div>
        </div>
      );
    }
  }

  const categories = await getActiveCategories();
  const role = (profile?.role ?? "reporter") as "reporter" | "moderator" | "admin";

  return (
    <div className="container mt-8 max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">প্রতিবেদক ডেস্ক / Reporter desk</h1>
          <p className="text-sm opacity-60">
            খসড়া, পর্যালোচনা ও প্রকাশনা — সব এক জায়গায়। Drafts, review and publishing in one place.
          </p>
        </div>
        <Link
          href="/reporter/contents/new"
          className="rounded-full px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          style={{ background: "var(--md-sys-color-primary)" }}
        >
          + নতুন লেখা / New story
        </Link>
      </div>

      <ReporterQueue
        role={role}
        categories={categories.map((c) => ({ id: c.id, name_bn: c.name_bn, name_en: c.name_en }))}
      />
    </div>
  );
}
