import type { Metadata } from "next";

import { AccountDashboard } from "@/components/account/account-dashboard";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";

export const metadata: Metadata = {
  title: "আমার অ্যাকাউন্ট",
  description: "আপনার DUTIMZ প্রোফাইল ও অ্যাকাউন্টের সারসংক্ষেপ।",
  alternates: { canonical: "/account/" },
};

/*
  The dashboard is the member's own profile page — the same band, identity, meta
  row and strip as `/u/<handle>/`, with their tools beside their reporting — so
  it draws itself under `bare` too, and the two pages cannot drift into two
  different designs.
*/
export default function AccountPage() {
  return (
    <DutimzShell bare>
      <AccountDashboard />
    </DutimzShell>
  );
}
