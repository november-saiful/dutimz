import type { Metadata } from "next";

import { SignInButton } from "@/components/auth/sign-in-button";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "প্রবেশ করুন",
  description: "গুগল অ্যাকাউন্ট দিয়ে DUTIMZ-এ প্রবেশ করুন।",
  alternates: { canonical: "/auth/sign-in/" },
};

export default function SignInPage() {
  return (
    <DutimzShell title="প্রবেশ করুন" crumbs={[{ label: "প্রবেশ" }]}>
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dutimz-text-logo.svg"
            alt="DUTIMZ"
            width={160}
            height={46}
            className="h-11 w-auto"
          />
          <p className="text-xs font-medium text-muted-foreground">
            আপনার ক্যাম্পাস, আপনার কণ্ঠ
          </p>
          <CardTitle className="text-2xl">DUTIMZ-এ স্বাগতম।</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            প্রতিবেদনে মন্তব্য করুন, খবর সংরক্ষণ করুন, আর ঢাকা
            বিশ্ববিদ্যালয়ের গল্পের সঙ্গে থাকুন।
          </p>
          <SignInButton />
          <p className="text-xs text-muted-foreground">
            প্রবেশ করলে আপনি আমাদের{" "}
            <a href="/guidelines/" className="underline">
              সম্পাদকীয় নীতিমালা
            </a>{" "}
            ও কমিউনিটি নিয়মে সম্মত হচ্ছেন। অন্য কোনো লগইন পদ্ধতি চালু নেই।
          </p>
        </CardContent>
      </Card>
    </DutimzShell>
  );
}
