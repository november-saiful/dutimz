"use client";

import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { reportError } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase";
import { formatDateBn } from "@/lib/site";

type Correction = {
  article_id: string;
  slug: string;
  title: string;
  revision: number;
  reason: string;
  editor_label: string;
  headline_changed: boolean;
  body_changed: boolean;
  edited_at: string;
};

export function CorrectionsList() {
  const [rows, setRows] = React.useState<Correction[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase.rpc("list_corrections", {
          p_limit: 50,
        });
        if (cancelled) return;
        if (error) {
          reportError("corrections list", error);
          setFailed(true);
          return;
        }
        setRows((data as Correction[] | null) ?? []);
      } catch (err) {
        reportError("corrections list", err);
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
          সংশোধনের তালিকা এখন লোড করা যাচ্ছে না।
        </CardContent>
      </Card>
    );
  }

  if (!rows) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          সংশোধনের নথি লোড হচ্ছে…
        </CardContent>
      </Card>
    );
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            ✓
          </span>
          <strong>নথিভুক্ত কোনো সংশোধন নেই</strong>
          <p className="text-sm text-muted-foreground">
            প্রকাশিত প্রতিবেদনে সম্পাদনা হলে তার কারণ এখানে দেখা যাবে।
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <Card key={`${row.article_id}-${row.revision}`}>
          <CardContent className="flex flex-col gap-2 pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">সংশোধন {row.revision}</Badge>
              {row.headline_changed && <Badge>শিরোনাম</Badge>}
              {row.body_changed && <Badge variant="outline">মূল লেখা</Badge>}
              <time className="ml-auto text-xs text-muted-foreground">
                {formatDateBn(row.edited_at)}
              </time>
            </div>
            <Link
              href={`/news/${encodeURIComponent(row.slug)}/`}
              className="font-medium hover:underline"
            >
              {row.title}
            </Link>
            <p className="text-sm text-muted-foreground">{row.reason}</p>
            <p className="text-xs text-muted-foreground">
              সম্পাদনা: {row.editor_label}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
