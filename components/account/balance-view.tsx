"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<"bkash" | "nagad" | "">("");
  const [payoutNumber, setPayoutNumber] = React.useState("");
  const [withdrawError, setWithdrawError] = React.useState("");
  const [withdrawDone, setWithdrawDone] = React.useState("");
  const [withdrawBusy, setWithdrawBusy] = React.useState(false);

  async function requestWithdrawal(event: React.FormEvent) {
    event.preventDefault();
    setWithdrawError("");
    setWithdrawDone("");
    const amountTk = Number(amount);
    if (!Number.isInteger(amountTk) || amountTk < 3000) {
      setWithdrawError("সর্বনিম্ন উত্তোলন ৳৩,০০০।");
      return;
    }
    if (method !== "bkash" && method !== "nagad") {
      setWithdrawError("বিকাশ বা নগদ নির্বাচন করুন।");
      return;
    }
    if (!payoutNumber.trim()) {
      setWithdrawError("পেমেন্ট নম্বর দিন (প্রোফাইলে সংরক্ষিত নম্বরের সঙ্গে মিলতে হবে)।");
      return;
    }
    setWithdrawBusy(true);
    try {
      const supabase = supabaseBrowser();
      const result = await supabase.rpc("request_withdrawal", {
        p_amount_tk: amountTk,
        p_method: method,
        p_payout_number: payoutNumber.trim(),
      });
      if (result.error) {
        setWithdrawError(result.error.message);
        return;
      }
      setAmount("");
      setPayoutNumber("");
      setWithdrawDone("উত্তোলনের অনুরোধ পাঠানো হয়েছে। নিষ্পত্তি হলে জানানো হবে।");
    } finally {
      setWithdrawBusy(false);
    }
  }

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
          <CardTitle>উত্তোলনের অনুরোধ</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={requestWithdrawal} className="grid gap-3 sm:grid-cols-4">
            <div className="grid gap-1">
              <Label htmlFor="withdraw-amount">টাকার পরিমাণ</Label>
              <Input
                id="withdraw-amount"
                type="number"
                min={3000}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="৩০০০"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="withdraw-method">পদ্ধতি</Label>
              <select
                id="withdraw-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as "bkash" | "nagad" | "")}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">বেছে নিন</option>
                <option value="bkash">বিকাশ</option>
                <option value="nagad">নগদ</option>
              </select>
            </div>
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="withdraw-number">পেমেন্ট নম্বর</Label>
              <Input
                id="withdraw-number"
                value={payoutNumber}
                onChange={(e) => setPayoutNumber(e.target.value)}
                maxLength={24}
                placeholder="প্রোফাইলে সংরক্ষিত নম্বর"
              />
            </div>
            <div className="sm:col-span-4">
              <Button type="submit" disabled={withdrawBusy}>
                {withdrawBusy ? "পাঠানো হচ্ছে…" : "উত্তোলনের অনুরোধ পাঠান →"}
              </Button>
            </div>
          </form>
          {withdrawError && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {withdrawError}
            </p>
          )}
          {withdrawDone && (
            <p className="mt-2 text-sm text-green-700" role="status">
              {withdrawDone}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            প্রথম উত্তোলনে অন্তত ৩৫টি প্রকাশিত প্রতিবেদন ও ১০০% সম্পূর্ণ
            প্রোফাইল প্রয়োজন।
          </p>
        </CardContent>
      </Card>
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
