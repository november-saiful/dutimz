import type { Metadata } from "next";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "403 — Access denied",
  robots: { index: false },
};

/** Rendered (via middleware rewrite) when a signed-in user lacks the role. */
export default async function ForbiddenPage() {
  const { profile } = await getAuthContext();
  return (
    <div className="container mt-24 max-w-lg text-center">
      <div className="glass-card p-10">
        <p className="text-5xl font-bold" aria-hidden="true">
          🔒
        </p>
        <h1 className="mt-4 text-2xl font-bold">403 — প্রবেশাধিকার নেই / Access denied</h1>
        <p className="mt-3 text-sm opacity-70">
          {profile
            ? `আপনার রোল ("${profile.role}") এই পেজের জন্য যথেষ্ট নয়। / Your role ("${profile.role}") is not sufficient for this page.`
            : "এই পেজটি দেখতে আপনার অনুমতি নেই। / You do not have permission to view this page."}
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full px-6 py-2.5 text-sm font-bold text-white"
          style={{ background: "var(--md-sys-color-primary)" }}
        >
          হোমে ফিরুন / Back to home
        </Link>
      </div>
    </div>
  );
}
