"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseBrowser } from "@/lib/supabase";
import { bn, formatDateBn } from "@/lib/site";

type Member = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  reporter_tier: string | null;
  completion_percent: number;
  created_at: string;
  total_count: number;
};

type Withdrawal = {
  id: string;
  user_id: string;
  amount_tk: number;
  method: string;
  status: string;
  created_at: string;
  profiles: { username: string; display_name: string } | null;
};

export function AdminDashboard() {
  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [tab, setTab] = React.useState<"members" | "finance" | "roles">(
    "members",
  );
  const [query, setQuery] = React.useState("");
  const [members, setMembers] = React.useState<Member[]>([]);
  const [total, setTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [withdrawals, setWithdrawals] = React.useState<Withdrawal[]>([]);
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [roleUserId, setRoleUserId] = React.useState("");
  const [roleName, setRoleName] = React.useState("reporter");
  const [tier, setTier] = React.useState("general");
  const [roleReason, setRoleReason] = React.useState("");
  const [adjustUserId, setAdjustUserId] = React.useState("");
  const [adjustAmount, setAdjustAmount] = React.useState("");
  const [adjustReason, setAdjustReason] = React.useState("");
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  const pageSize = 20;

  const loadMembers = React.useCallback(
    async (nextOffset: number, nextQuery: string) => {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase.rpc("admin_member_records", {
        p_query: nextQuery.trim() || null,
        p_limit: pageSize,
        p_offset: nextOffset,
      });
      if (error) {
        setError(error.message);
        return;
      }
      const rows = (data as Member[] | null) ?? [];
      setMembers(rows);
      setTotal(Number(rows[0]?.total_count ?? 0));
      setOffset(nextOffset);
    },
    [],
  );

  const loadWithdrawals = React.useCallback(async () => {
    const supabase = supabaseBrowser();
    const { data, error } = await supabase
      .from("withdrawals")
      .select(
        "id,user_id,amount_tk,method,status,created_at,profiles:profiles!withdrawals_user_id_fkey(username,display_name)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(60);
    if (error) {
      setError(error.message);
      return;
    }
    setWithdrawals((data as unknown as Withdrawal[]) ?? []);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setAllowed(false);
          return;
        }
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if ((data as { role?: string } | null)?.role !== "admin") {
          setAllowed(false);
          return;
        }
        setAllowed(true);
        await loadMembers(0, "");
        await loadWithdrawals();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "লোড করা যায়নি।");
          setAllowed(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMembers, loadWithdrawals]);

  async function reviewWithdrawal(id: string, decision: "approve" | "reject") {
    const reason = (reasons[id] ?? "").trim();
    if (reason.length < 3) {
      setError("সিদ্ধান্তের কারণ লিখুন (অন্তত ৩ অক্ষর)।");
      return;
    }
    setBusy(id);
    setError("");
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.rpc("review_withdrawal", {
        p_withdrawal_id: id,
        p_decision: decision,
        p_reason: reason,
      });
      if (error) {
        setError(error.message);
        return;
      }
      setNotice("উত্তোলনের সিদ্ধান্ত নথিভুক্ত হয়েছে।");
      await loadWithdrawals();
    } finally {
      setBusy(null);
    }
  }

  async function assignRole(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!roleUserId.trim() || roleReason.trim().length < 3) {
      setError("সদস্যের আইডি ও কারণ (অন্তত ৩ অক্ষর) আবশ্যক।");
      return;
    }
    setBusy("role");
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.rpc("assign_user_role", {
        p_user_id: roleUserId.trim(),
        p_role: roleName,
        p_tier: roleName === "reporter" ? tier : null,
        p_reason: roleReason.trim(),
      });
      if (error) {
        setError(error.message);
        return;
      }
      setNotice("ভূমিকা হালনাগাদ হয়েছে।");
      setRoleUserId("");
      setRoleReason("");
      await loadMembers(offset, query);
    } finally {
      setBusy(null);
    }
  }

  async function adjustBalance(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const amountTk = Number(adjustAmount);
    if (!adjustUserId.trim() || !Number.isInteger(amountTk) || adjustReason.trim().length < 3) {
      setError("সদস্যের আইডি, পূর্ণসংখ্যা পরিমাণ ও কারণ আবশ্যক।");
      return;
    }
    setBusy("adjust");
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.rpc("admin_adjust_balance", {
        p_user_id: adjustUserId.trim(),
        p_amount_tk: amountTk,
        p_reason: adjustReason.trim(),
      });
      if (error) {
        setError(error.message);
        return;
      }
      setNotice("জমা অর্থ সমন্বয় করা হয়েছে।");
      setAdjustUserId("");
      setAdjustAmount("");
      setAdjustReason("");
    } finally {
      setBusy(null);
    }
  }

  if (allowed === null) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          অনুমতি যাচাই করা হচ্ছে…
        </CardContent>
      </Card>
    );
  }

  if (!allowed) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          এই প্রশাসনিক ড্যাশবোর্ড কেবল অ্যাডমিনদের জন্য।
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm text-green-700" role="status">
          {notice}
        </p>
      )}
      <div className="flex gap-2" role="tablist" aria-label="প্রশাসনিক বিভাগ">
        {(
          [
            ["members", "সদস্য"],
            ["finance", "অর্থ"],
            ["roles", "ভূমিকা"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? "default" : "outline"}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "members" && (
        <Card>
          <CardHeader>
            <CardTitle>সদস্য তালিকা (মোট {bn(total)}জন)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void loadMembers(0, query);
              }}
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="নাম বা ইউজারনেম খুঁজুন…"
              />
              <Button type="submit">খুঁজুন</Button>
            </form>
            {members.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center gap-2 border-b py-2 text-sm last:border-0"
              >
                <strong>{member.display_name || `@${member.username}`}</strong>
                <span className="text-muted-foreground">@{member.username}</span>
                <span className="text-muted-foreground">· {member.role}</span>
                {member.reporter_tier && (
                  <span className="text-muted-foreground">
                    · {member.reporter_tier}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {bn(member.completion_percent)}% ·{" "}
                  {formatDateBn(member.created_at)}
                </span>
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => void loadMembers(Math.max(0, offset - pageSize), query)}
              >
                ← আগের
              </Button>
              <Button
                variant="outline"
                disabled={offset + pageSize >= total}
                onClick={() => void loadMembers(offset + pageSize, query)}
              >
                পরের →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "finance" && (
        <Card>
          <CardHeader>
            <CardTitle>
              অপেক্ষমাণ উত্তোলন ({bn(withdrawals.length)}টি)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {withdrawals.length === 0 && (
              <p className="text-sm text-muted-foreground">
                নিষ্পত্তির অপেক্ষায় কোনো অনুরোধ নেই।
              </p>
            )}
            {withdrawals.map((withdrawal) => (
              <div key={withdrawal.id} className="rounded-md border p-4">
                <p className="text-sm font-medium">
                  {withdrawal.profiles?.display_name ??
                    `@${withdrawal.profiles?.username ?? "সদস্য"}`}{" "}
                  · {bn(withdrawal.amount_tk)} টাকা ·{" "}
                  {withdrawal.method === "nagad" ? "নগদ" : "বিকাশ"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateBn(withdrawal.created_at)}
                </p>
                <div className="mt-2 grid gap-2">
                  <Label htmlFor={`wreason-${withdrawal.id}`}>
                    সিদ্ধান্তের কারণ (আবশ্যক)
                  </Label>
                  <textarea
                    id={`wreason-${withdrawal.id}`}
                    value={reasons[withdrawal.id] ?? ""}
                    onChange={(e) =>
                      setReasons({ ...reasons, [withdrawal.id]: e.target.value })
                    }
                    rows={2}
                    minLength={3}
                    maxLength={500}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy === withdrawal.id}
                      onClick={() => void reviewWithdrawal(withdrawal.id, "approve")}
                    >
                      পরিশোধ
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy === withdrawal.id}
                      onClick={() => void reviewWithdrawal(withdrawal.id, "reject")}
                    >
                      প্রত্যাখ্যান
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "roles" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>ভূমিকা নির্ধারণ</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={assignRole} className="grid gap-2">
                <Label htmlFor="role-user">সদস্যের আইডি (UUID)</Label>
                <Input
                  id="role-user"
                  value={roleUserId}
                  onChange={(e) => setRoleUserId(e.target.value)}
                  placeholder="সদস্য তালিকা থেকে আইডি নিন"
                />
                <Label htmlFor="role-name">ভূমিকা</Label>
                <select
                  id="role-name"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="reader">রিডার</option>
                  <option value="reporter">রিপোর্টার</option>
                  <option value="moderator">মডারেটর</option>
                  <option value="admin">অ্যাডমিন</option>
                </select>
                {roleName === "reporter" && (
                  <>
                    <Label htmlFor="role-tier">রিপোর্টার স্তর</Label>
                    <select
                      id="role-tier"
                      value={tier}
                      onChange={(e) => setTier(e.target.value)}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="junior">জুনিয়র</option>
                      <option value="general">জেনারেল</option>
                      <option value="executive">এক্সিকিউটিভ</option>
                    </select>
                  </>
                )}
                <Label htmlFor="role-reason">কারণ (আবশ্যক)</Label>
                <textarea
                  id="role-reason"
                  value={roleReason}
                  onChange={(e) => setRoleReason(e.target.value)}
                  rows={2}
                  minLength={3}
                  maxLength={500}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <Button type="submit" disabled={busy === "role"}>
                  ভূমিকা সংরক্ষণ করুন
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>জমা অর্থ সমন্বয়</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={adjustBalance} className="grid gap-2">
                <Label htmlFor="adjust-user">সদস্যের আইডি (UUID)</Label>
                <Input
                  id="adjust-user"
                  value={adjustUserId}
                  onChange={(e) => setAdjustUserId(e.target.value)}
                />
                <Label htmlFor="adjust-amount">পরিমাণ (টাকা, ঋণাত্মক হতে পারে)</Label>
                <Input
                  id="adjust-amount"
                  type="number"
                  step={1}
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                />
                <Label htmlFor="adjust-reason">কারণ (আবশ্যক)</Label>
                <textarea
                  id="adjust-reason"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  rows={2}
                  minLength={3}
                  maxLength={500}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <Button type="submit" disabled={busy === "adjust"}>
                  সমন্বয় সংরক্ষণ করুন
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
