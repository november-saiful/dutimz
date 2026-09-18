export const runtime = "edge";

import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "Admin — Settings",
  robots: { index: false },
};

export default function AdminPage() {
  return (
    <div className="container mt-6 max-w-5xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">অ্যাডমিন প্যানেল / Admin Panel</h1>
        <p className="text-sm opacity-60">
          সাইট সেটিংস, ব্যবহারকারী ও কন্টেন্ট পরিচালনা। / Manage site settings, users and content.
        </p>
      </div>
      <AdminShell />
    </div>
  );
}
