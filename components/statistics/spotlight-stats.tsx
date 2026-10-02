"use client";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { reportError } from "@/lib/errors";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase";
import { bn } from "@/lib/site";

type WindowCount = { total: number; solved: number; invalid: number };

type SpotlightStats = {
  totals: {
    issues: number;
    open: number;
    in_progress: number;
    solved: number;
    invalid: number;
  };
  false_count: number;
  windows: {
    week: WindowCount;
    month: WindowCount;
    year: WindowCount;
    all: WindowCount;
  };
};

type SolverRow = {
  solver_kind: string;
  solver_name: string | null;
  solved_count: number;
};

const SOLVER_LABELS: Record<string, string> = {
  authority: "প্রশাসন",
  student_wing: "শিক্ষার্থী উইং",
  volunteers: "স্বেচ্ছাসেবক",
  dean_office: "ডিন অফিস",
  hall_authority: "হল প্রশাসন",
  faculty_department: "শিক্ষক / বিভাগ",
  other: "অন্যান্য",
};

const WINDOWS: { key: keyof SpotlightStats["windows"]; label: string }[] = [
  { key: "week", label: "এই সপ্তাহ" },
  { key: "month", label: "এই মাস" },
  { key: "year", label: "এই বছর" },
  { key: "all", label: "সর্বকালের" },
];

function asCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function SpotlightStats() {
  const [stats, setStats] = React.useState<SpotlightStats | null>(null);
  const [solvers, setSolvers] = React.useState<SolverRow[]>([]);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const [statsResult, solversResult] = await Promise.all([
          supabase.rpc("get_public_spotlight_stats"),
          supabase.rpc("get_public_spotlight_solvers", { p_limit: 20 }),
        ]);
        if (cancelled) return;
        if (statsResult.error || solversResult.error) {
          reportError("spotlight statistics", statsResult.error ?? solversResult.error);
          setFailed(true);
          return;
        }
        setStats((statsResult.data as unknown as SpotlightStats | null) ?? null);
        setSolvers((solversResult.data as unknown as SolverRow[] | null) ?? []);
      } catch (err) {
        reportError("spotlight statistics", err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          স্পটলাইটের পরিসংখ্যান এখন লোড করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          স্পটলাইটের পরিসংখ্যান লোড হচ্ছে…
        </CardContent>
      </Card>
    );
  }

  const totals = stats.totals;
  const falseCount = asCount(stats.false_count ?? totals.invalid);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {WINDOWS.map((window) => {
          const counts = stats.windows[window.key] ?? {
            total: 0,
            solved: 0,
            invalid: 0,
          };
          const total = asCount(counts.total);
          const solved = asCount(counts.solved);
          const percent = total > 0 ? Math.round((solved / total) * 100) : 0;
          return (
            <Card key={window.key}>
              <CardHeader>
                <p className="text-xs font-medium text-muted-foreground">
                  {window.label}
                </p>
                <CardTitle className="text-2xl tabular-nums">
                  {bn(solved)} / {bn(total)}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Progress value={percent} aria-label={`${window.label} সমাধানের হার`} />
                <p className="text-xs tabular-nums text-muted-foreground">
                  {bn(percent)}% সমাধান হয়েছে · {bn(asCount(counts.invalid))}টি ভিত্তিহীন
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <p className="text-xs font-medium text-muted-foreground">
              ভিত্তিহীন / অপ্রাসঙ্গিক
            </p>
            <CardTitle className="text-3xl tabular-nums">{bn(falseCount)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              যেসব ইস্যু যাচাই করে ভিত্তিহীন বা অপ্রাসঙ্গিক বলা হয়েছে।
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">কে কত সমাধান করেছে</CardTitle>
          </CardHeader>
          <CardContent>
            {solvers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                এখনো কোনো ইস্যু সমাধান হিসেবে চিহ্নিত হয়নি।
              </p>
            ) : (
              <Table aria-label="সমাধানকারীর তালিকা">
                <TableHeader>
                  <TableRow>
                    <TableHead>সমাধানকারী</TableHead>
                    <TableHead className="text-right">সমাধান</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {solvers.map((row, index) => (
                    <TableRow key={`${row.solver_kind}-${row.solver_name ?? index}`}>
                      <TableCell>
                        {SOLVER_LABELS[row.solver_kind] ?? row.solver_kind}
                        {row.solver_name ? ` · ${row.solver_name}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {bn(asCount(row.solved_count))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "মোট ইস্যু", value: totals.issues },
          { label: "খোলা", value: totals.open },
          { label: "কাজ চলছে", value: totals.in_progress },
          { label: "সমাধান হয়েছে", value: totals.solved },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-xl font-semibold tabular-nums">
              {bn(asCount(item.value))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
