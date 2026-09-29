import type { Metadata } from "next";

import { RoleGate } from "@/components/account/role-gate";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";

export const metadata: Metadata = {
  title: "প্রশাসনিক নিয়ন্ত্রণ",
  description: "ব্যবহারকারী ও অর্থপরিশোধ পরিচালনা করুন।",
  alternates: { canonical: "/account/admin/" },
};

export default function AdminPage() {
  return (
    <DutimzShell title="প্রশাসনিক নিয়ন্ত্রণ" crumbs={[{ label: "অ্যাডমিন" }]}>
      <RoleGate
        roles={["admin"]}
        title="প্রশাসনিক নিয়ন্ত্রণ"
        description="এই পাতা কেবল অ্যাডমিনদের জন্য।"
      />
    </DutimzShell>
  );
}
