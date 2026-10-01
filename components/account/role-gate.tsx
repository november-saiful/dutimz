"use client";

import Link from "next/link";
import * as React from "react";

import { SignInButton } from "@/components/auth/sign-in-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reportError } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase";

export function RoleGate({
  roles,
  title,
  description,
}: {
  roles: string[];
  title: string;
  description: string;
}) {
  const [state, setState] = React.useState<"loading" | "allowed" | "denied">(
    "loading",
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          reportError("role gate session", authError);
          if (!cancelled) setState("denied");
          return;
        }
        if (!user) {
          if (!cancelled) setState("denied");
          return;
        }
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) {
          reportError("role gate lookup", error);
          if (!cancelled) setState("denied");
          return;
        }
        if (!cancelled)
          setState(
            roles.includes((data as { role?: string } | null)?.role ?? "")
              ? "allowed"
              : "denied",
          );
      } catch (err) {
        reportError("role gate", err);
        if (!cancelled) setState("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roles]);

  if (state === "loading") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          অনুমতি যাচাই করা হচ্ছে…
        </CardContent>
      </Card>
    );
  }

  if (state === "denied") {
    return (
      <Card className="mx-auto max-w-md text-center">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">{description}</p>
          <SignInButton />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>{description}</p>
        <p className="mt-2">
          এই ডেস্কের সম্পূর্ণ কর্মপ্রবাহ (পর্যালোচনা সারি, সিদ্ধান্তের কারণ,
          নিরীক্ষা লগ) পরবর্তী ধাপে এখানে যুক্ত হবে। তথ্য একই Supabase
          টেবিল/RPC থেকে আসবে।
        </p>
      </CardContent>
    </Card>
  );
}
