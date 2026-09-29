"use client";

import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseBrowser } from "@/lib/supabase";
import { CATEGORIES } from "@/lib/site";

export function WriterForm() {
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  const [slugPreview, setSlugPreview] = React.useState("/news/…");
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState(
    "জুনিয়র রিপোর্টারের প্রতিবেদন অনুমোদনের অপেক্ষায় থাকবে।",
  );
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) setSignedIn(Boolean(user));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const excerpt = String(data.get("excerpt") ?? "").trim();
    const body = String(data.get("body") ?? "").trim();
    const categorySlug = String(data.get("category_slug") ?? "");
    if (!title || !excerpt || !body || !categorySlug) {
      setError("শিরোনাম, পরিচিতি, প্রতিবেদন ও বিভাগ আবশ্যক।");
      return;
    }
    if (body.length < 100) {
      setError("পূর্ণ প্রতিবেদন কমপক্ষে ১০০ অক্ষরের হতে হবে।");
      return;
    }
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.assign("/auth/sign-in");
        return;
      }
      // Clients hold no direct write grant on articles: the SECURITY DEFINER
      // RPC allocates the slug, validates the questionnaire, records the
      // revision, and sets pending/published by reporter tier.
      const { data: questionnaire } = await supabase.rpc(
        "get_active_article_questionnaire",
      );
      const questionnaireVersion = (
        questionnaire as { id?: string; version_id?: string } | null
      )?.id;
      void questionnaireVersion;
      const result = await supabase.rpc("submit_article", {
        p_category_slug: categorySlug,
        p_title: title,
        p_excerpt: excerpt,
        p_body: body,
        p_is_anonymous: data.get("is_anonymous") === "on",
      });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      form.reset();
      setSlugPreview("/news/…");
      setDone("আপনার প্রতিবেদন পর্যালোচনার জন্য পাঠানো হয়েছে।");
      setStatus("প্রতিবেদন পাঠানো হয়েছে।");
    } finally {
      setBusy(false);
    }
  }

  if (signedIn === null) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          লোড হচ্ছে…
        </CardContent>
      </Card>
    );
  }

  if (!signedIn) {
    return (
      <Card className="text-center">
        <CardHeader>
          <CardTitle>প্রতিবেদন পাঠাতে আগে অ্যাকাউন্টে প্রবেশ করুন</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">
            প্রতিবেদন আপনার অ্যাকাউন্টের সঙ্গেই যুক্ত থাকে—প্রকাশকের পরিচয়,
            পারিশ্রমিক ও সম্পাদকীয় যোগাযোগ সবই অ্যাকাউন্ট থেকে নির্ধারিত হয়।
          </p>
          <Button asChild>
            <Link href="/auth/sign-in">গুগল দিয়ে প্রবেশ করুন →</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="grid gap-2">
            <Label htmlFor="write-title">প্রতিবেদনের শিরোনাম</Label>
            <Input
              id="write-title"
              name="title"
              maxLength={180}
              required
              placeholder="আপনার প্রতিবেদনের শিরোনাম"
              onChange={(event) =>
                setSlugPreview(
                  `/news/${event.target.value.trim().slice(0, 24) || "…"}/`,
                )
              }
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="write-category">বিভাগ</Label>
              <select
                id="write-category"
                name="category_slug"
                required
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  বিভাগ বেছে নিন
                </option>
                {CATEGORIES.filter((c) => c.slug !== "all").map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>প্রতিবেদনের ঠিকানা</Label>
              <p className="h-10 rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
                {slugPreview}
              </p>
              <p className="text-xs text-muted-foreground">
                শিরোনাম থেকে ইংরেজি ঠিকানা স্বয়ংক্রিয়ভাবে তৈরি হবে।
              </p>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="write-excerpt">সংক্ষিপ্ত পরিচিতি</Label>
            <textarea
              id="write-excerpt"
              name="excerpt"
              rows={3}
              maxLength={280}
              required
              placeholder="প্রতিবেদনটি কী নিয়ে—২৮০ অক্ষরের মধ্যে"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="write-body">পূর্ণ প্রতিবেদন</Label>
            <textarea
              id="write-body"
              name="body"
              rows={12}
              minLength={100}
              maxLength={30000}
              required
              placeholder="যাচাই করা তথ্য ও প্রাসঙ্গিক সূত্রসহ প্রতিবেদন লিখুন…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              কমপক্ষে ১০০ অক্ষর। ব্যক্তিগত আক্রমণ, গুজব বা অনুমতিহীন ব্যক্তিগত
              তথ্য প্রকাশ করবেন না।
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="is_anonymous" className="mt-1" />
            <span>
              <strong>নাম প্রকাশে অনিচ্ছুক</strong>
              <span className="block text-xs text-muted-foreground">
                প্রকাশিত প্রতিবেদনে আপনার নাম বা প্রোফাইল লিংক কোথাও দেখানো হবে
                না।
              </span>
            </span>
          </label>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className="text-sm text-green-700" role="status">
              {done}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "পাঠানো হচ্ছে…" : "প্রতিবেদন পাঠান →"}
            </Button>
            <span className="text-xs text-muted-foreground">{status}</span>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
