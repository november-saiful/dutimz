"use client";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabaseBrowser } from "@/lib/supabase";
import { bn } from "@/lib/site";

type StatRow = {
  key: string;
  label?: string;
  count?: number;
  total?: number;
};

export function PublicStats() {
  const [rows, setRows] = React.useState<StatRow[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase.rpc(
          "get_public_article_questionnaire_stats",
        );
        if (cancelled) return;
        if (error) {
          setFailed(true);
          return;
        }
        setRows((data as StatRow[] | null) ?? []);
      } catch {
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
          পরিসংখ্যান এখন লোড করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।
        </CardContent>
      </Card>
    );
  }

  if (!rows) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          পরিসংখ্যান লোড হচ্ছে…
        </CardContent>
      </Card>
    );
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          এখনো প্রকাশিত প্রতিবেদনের সমষ্টিগত তথ্য নেই।
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {rows.map((row, index) => {
        const total = Number(row.total ?? row.count ?? 0);
        const count = Number(row.count ?? 0);
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <Card key={row.key ?? index}>
            <CardHeader>
              <CardTitle className="text-base">
                {row.label ?? row.key}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-2xl font-semibold tabular-nums">
                {bn(count)}
              </p>
              <Progress value={percent} aria-label={`${row.label} অগ্রগতি`} />
              <p className="text-xs text-muted-foreground tabular-nums">
                {bn(percent)}% — মোট {bn(total)}টির মধ্যে
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
