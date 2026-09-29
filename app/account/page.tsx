import type { Metadata } from "next";

import { AccountDashboard } from "@/components/account/account-dashboard";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "আমার অ্যাকাউন্ট",
  description: "আপনার DUTIMZ প্রোফাইল ও অ্যাকাউন্টের সারসংক্ষেপ।",
  alternates: { canonical: "/account/" },
};

export default function AccountPage() {
  return (
    <DutimzShell title="আমার অ্যাকাউন্ট" crumbs={[{ label: "অ্যাকাউন্ট" }]}>
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            ব্যক্তিগত পরিসর
          </p>
          <CardTitle className="text-2xl">আমার অ্যাকাউন্ট</CardTitle>
          <CardDescription>
            প্রোফাইল, সংরক্ষিত খবর ও লেখালেখির সবকিছু এক জায়গায়।
          </CardDescription>
        </CardHeader>
      </Card>
      <AccountDashboard />
    </DutimzShell>
  );
}
