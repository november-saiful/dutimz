import type { Metadata } from "next";

import { BalanceView } from "@/components/account/balance-view";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "আয় ও উত্তোলন",
  description: "আপনার DUTIMZ আয়, জমা অর্থ ও উত্তোলনের ইতিহাস।",
  alternates: { canonical: "/account/balance/" },
};

export default function BalancePage() {
  return (
    <DutimzShell title="আয় ও উত্তোলন" crumbs={[{ label: "আয়" }]}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">আয় ও উত্তোলন</CardTitle>
          <CardDescription>
            সর্বনিম্ন উত্তোলন ৳৩,০০০। প্রোফাইল ১০০% সম্পূর্ণ না হওয়া পর্যন্ত
            আয় আটকে থাকবে।
          </CardDescription>
        </CardHeader>
      </Card>
      <BalanceView />
    </DutimzShell>
  );
}
