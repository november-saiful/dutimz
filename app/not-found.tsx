import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DutimzShell } from "@/components/dashboard/dutimz-shell";

export default function NotFound() {
  return (
    <DutimzShell title="পাওয়া যায়নি">
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader>
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-xl font-bold">
            ঢা
          </div>
          <CardTitle>প্রতিবেদনটি পাওয়া যায়নি</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">
            লিংকটি ভুল হতে পারে অথবা প্রতিবেদনটি প্রকাশিত নেই।
          </p>
          <Button asChild>
            <Link href="/">মূলপাতায় ফিরুন →</Link>
          </Button>
        </CardContent>
      </Card>
    </DutimzShell>
  );
}
