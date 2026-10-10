"use client";

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { reportError } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase";
import { bn } from "@/lib/site";

/**
 * One question in the aggregate. `get_public_article_questionnaire_stats` returns `{ fields: [...] }`,
 * and a count is `null` wherever the database suppressed it for privacy (fewer than five published
 * answers in a group). A suppressed value is shown as suppressed, never as zero.
 */
type StatChoice = { label: string; count: number | null; suppressed: boolean };
type StatField = {
  id: string;
  label: string;
  type: "single" | "multi" | "people" | "number";
  choices?: StatChoice[];
  count?: number | null;
  submissions?: number | null;
  suppressed?: boolean;
  version?: number;
};

const SUPPRESSED_NOTE =
  "গোপনীয়তার জন্য পাঁচটির কম জমার দল দেখানো হয় না, তাই এই অংশের সংখ্যা গোপন রাখা হয়েছে।";

export function PublicStats() {
  const [fields, setFields] = React.useState<StatField[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabaseBrowser().rpc(
          "get_public_article_questionnaire_stats",
        );
        if (cancelled) return;
        if (error) {
          reportError("public statistics", error);
          setFailed(true);
          return;
        }
        const payload = data as { fields?: StatField[] } | null;
        setFields(payload?.fields ?? []);
      } catch (err) {
        reportError("public statistics", err);
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

  if (!fields) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          পরিসংখ্যান লোড হচ্ছে…
        </CardContent>
      </Card>
    );
  }

  if (!fields.length) {
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
      {fields.map((field, index) => (
        <StatCard key={`${field.version ?? 1}-${field.id}-${index}`} field={field} />
      ))}
    </div>
  );
}

function StatCard({ field }: { field: StatField }) {
  const submissions = field.submissions ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{field.label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {field.choices ? (
          <>
            <ul className="flex flex-col gap-3">
              {field.choices.map((choice) => {
                const percent =
                  choice.count !== null && submissions
                    ? Math.round((choice.count / submissions) * 100)
                    : null;
                return (
                  <li key={choice.label} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span>{choice.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {choice.count === null ? "গোপন" : bn(choice.count)}
                      </span>
                    </div>
                    {percent !== null && (
                      <Progress value={percent} aria-label={`${choice.label}: ${bn(percent)}%`} />
                    )}
                  </li>
                );
              })}
            </ul>
            {submissions !== null && (
              <p className="text-xs text-muted-foreground tabular-nums">
                মোট {bn(submissions)}টি জমার ভিত্তিতে
              </p>
            )}
            {field.suppressed && <p className="text-xs text-muted-foreground">{SUPPRESSED_NOTE}</p>}
          </>
        ) : (
          <>
            <p className="text-2xl font-semibold tabular-nums">
              {field.count === null || field.count === undefined
                ? "গোপন"
                : field.type === "people"
                  ? `${bn(field.count)} জন`
                  : bn(field.count)}
            </p>
            {field.suppressed && <p className="text-xs text-muted-foreground">{SUPPRESSED_NOTE}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
