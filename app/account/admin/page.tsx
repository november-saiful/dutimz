import type { Metadata } from "next";

import { AdminDashboard } from "@/components/account/admin-dashboard";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";

export const metadata: Metadata = {
  title: "প্রশাসনিক নিয়ন্ত্রণ",
  description: "ব্যবহারকারী ও অর্থপরিশোধ পরিচালনা করুন।",
  alternates: { canonical: "/account/admin/" },
};

export default function AdminPage() {
  return (
    <DutimzShell title="প্রশাসনিক নিয়ন্ত্রণ" crumbs={[{ label: "অ্যাডমিন" }]}>
      <AdminDashboard />
    </DutimzShell>
  );
}
