"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormMessage } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { supabaseBrowser } from "@/lib/supabase";

export function ReporterApplication() {
  const [visible, setVisible] = React.useState(false);
  const [motivation, setMotivation] = React.useState("");
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled && (data as { role?: string } | null)?.role === "reader")
          setVisible(true);
      } catch {
        /* readers-only section stays hidden on failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setDone("");
    if (!motivation.trim()) {
      setError("লেখার অভিজ্ঞতা ও আগ্রহ লিখুন।");
      return;
    }
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const result = await supabase.rpc("apply_reporter", {
        p_motivation: motivation.trim(),
      });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setMotivation("");
      setDone("আপনার আবেদন সম্পাদকীয় দলের কাছে পাঠানো হয়েছে।");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium text-muted-foreground">
          এখনো রিপোর্টার নন?
        </p>
        <CardTitle className="text-xl">রিপোর্টার হিসেবে আবেদন করুন</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          সম্পাদকীয় দল আপনার আবেদন পর্যালোচনা করে উপযুক্ত রিপোর্টার স্তর
          নির্ধারণ করবে। স্তর অনুমোদনের পর পারিশ্রমিক কার্যকর হবে।
        </p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label="লেখার অভিজ্ঞতা ও আগ্রহ"
            htmlFor="reporter-motivation"
            hint="কী ধরনের প্রতিবেদন করতে চান, আর আগের কাজ থাকলে সংক্ষেপে লিখুন।"
          >
            <Textarea
              id="reporter-motivation"
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              rows={4}
              maxLength={1500}
              required
              placeholder="আপনি কী ধরনের প্রতিবেদন করতে চান? আগের কাজ থাকলে সংক্ষেপে লিখুন।"
            />
          </Field>
          {error && <FormMessage>{error}</FormMessage>}
          {done && <FormMessage tone="success">{done}</FormMessage>}
          <Button type="submit" variant="outline" disabled={busy} className="self-start">
            {busy ? "পাঠানো হচ্ছে…" : "আবেদন পাঠান →"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
