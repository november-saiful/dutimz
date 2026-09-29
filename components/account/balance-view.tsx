"use client";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { one, supabaseBrowser } from "@/lib/supabase";
import { bn, bnMoney, formatDateBn } from "@/lib/site";

type LedgerEntry = {
  id: string;
  amount_tk: number;
  entry_type: string;
  reason: string | null;
  created_at: string;
  articles: { title: string } | { title: string }[] | null;
  withdrawals: { method: string; status: string } | null;
};

export function BalanceView() {
  const [state, setState] = React.useState<"loading" | "ready" | "denied">(
    "loading",
  );
  const [available, setAvailable] = React.useState(0);
  const [held, setHeld] = React.useState(0);
  const [reserved, setReserved] = React.useState(0);
  const [entries, setEntries] = React.useState<LedgerEntry[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          setState("denied");
          return;
        }
        const [walletResult, ledgerResult] = await Promise.all([
          supabase.rpc("get_my_wallet"),
          supabase
            .from("earnings_ledger")
            .select(
              "id,amount_tk,entry_type,reason,created_at,articles(title),withdrawals(method,status)",
            )
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(60),
        ]);
        if (cancelled) return;
        const wallet = walletResult.data as {
          available?: number;
          held?: number;
          reserved?: number;
        } | null;
        setAvailable(Number(wallet?.available ?? 0));
        setHeld(Number(wallet?.held ?? 0));
        setReserved(Number(wallet?.reserved ?? 0));
        setEntries((ledgerResult.data as unknown as LedgerEntry[]) ?? []);
        setState("ready");
      } catch {
        if (!cancelled) setState("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (state === "denied") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          আয়ের তথ্য দেখতে অ্যাকাউন্টে প্রবেশ করুন।
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "উত্তোলনযোগ্য", value: available },
          { label: "আটকে আছে", value: held },
          { label: "সংরক্ষিত", value: reserved },
        ].map((row) => (
          <Card key={row.label}>
            <CardHeader>
              <p className="text-xs font-medium text-muted-foreground">
                {row.label}
              </p>
              <CardTitle className="text-2xl tabular-nums">
                {bnMoney(row.value)}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>লেনদেনের ইতিহাস</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground">
              এখনো কোনো লেনদেন নেই।
            </p>
          )}
          {entries.map((entry) => {
            const title = one(entry.articles)?.title;
            const label =
              title ??
              (entry.entry_type === "withdrawal_reserve"
                ? "উত্তোলন অনুরোধ"
                : entry.reason ?? "অ্যাকাউন্ট লেনদেন");
            const amount = Number(entry.amount_tk);
            return (
              <article
                key={entry.id}
                className="flex items-center gap-3 border-b py-2 last:border-0"
              >
                <span aria-hidden>{amount >= 0 ? "↗" : "↙"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.reason ?? ""} · {formatDateBn(entry.created_at)}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold tabular-nums ${amount < 0 ? "text-destructive" : ""}`}
                >
                  {amount > 0 ? "+" : ""}
                  {bnMoney(amount).replace("৳", "৳")}
                </span>
              </article>
            );
          })}
          <p className="text-xs text-muted-foreground">
            মোট {bn(entries.length)}টি লেনদেন দেখানো হচ্ছে।
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
