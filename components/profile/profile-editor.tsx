"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabaseBrowser } from "@/lib/supabase";
import { bn } from "@/lib/site";

export function ProfileEditor() {
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  const [values, setValues] = React.useState({
    display_name: "",
    username: "",
    bio: "",
    department: "",
    session: "",
  });
  const [completion, setCompletion] = React.useState(0);
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
        if (!user) {
          if (!cancelled) setSignedIn(false);
          return;
        }
        if (!cancelled) setSignedIn(true);
        const [profileResult, detailsResult, completionResult] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("username,display_name,bio")
              .eq("id", user.id)
              .maybeSingle(),
            supabase
              .from("profile_details")
              .select("department,session")
              .eq("user_id", user.id)
              .maybeSingle(),
            supabase.rpc("get_my_profile_completion"),
          ]);
        if (cancelled) return;
        const profile = profileResult.data as {
          username?: string;
          display_name?: string;
          bio?: string;
        } | null;
        const details = detailsResult.data as {
          department?: string;
          session?: string;
        } | null;
        setValues({
          display_name: profile?.display_name ?? "",
          username: profile?.username ?? "",
          bio: profile?.bio ?? "",
          department: String(details?.department ?? ""),
          session: String(details?.session ?? ""),
        });
        setCompletion(Number(completionResult.data ?? 0));
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
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
      const profileResult = await supabase.from("profiles").upsert({
        id: user.id,
        display_name: values.display_name.trim(),
        username: values.username.trim(),
        bio: values.bio.trim() || null,
      });
      if (profileResult.error) {
        setError(profileResult.error.message);
        return;
      }
      const detailsResult = await supabase.from("profile_details").upsert({
        user_id: user.id,
        department: values.department.trim() || null,
        session: values.session.trim() || null,
      });
      if (detailsResult.error) {
        setError(detailsResult.error.message);
        return;
      }
      const completionResult = await supabase.rpc(
        "get_my_profile_completion",
      );
      setCompletion(Number(completionResult.data ?? completion));
      setDone("আপনার তথ্য সংরক্ষণ করা হয়েছে।");
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
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          প্রোফাইল সম্পাদনা করতে অ্যাকাউন্টে প্রবেশ করুন।
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            প্রোফাইল সম্পূর্ণ {bn(completion)}%
          </CardTitle>
          <Progress value={completion} />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="profile-name">পূর্ণ নাম</Label>
            <Input
              id="profile-name"
              value={values.display_name}
              onChange={(e) =>
                setValues({ ...values, display_name: e.target.value })
              }
              maxLength={80}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-username">ইউজারনেম</Label>
            <Input
              id="profile-username"
              value={values.username}
              onChange={(e) =>
                setValues({ ...values, username: e.target.value })
              }
              maxLength={24}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-bio">সংক্ষিপ্ত পরিচিতি</Label>
            <textarea
              id="profile-bio"
              value={values.bio}
              onChange={(e) => setValues({ ...values, bio: e.target.value })}
              rows={3}
              maxLength={500}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="profile-dept">বিভাগ</Label>
              <Input
                id="profile-dept"
                value={values.department}
                onChange={(e) =>
                  setValues({ ...values, department: e.target.value })
                }
                maxLength={100}
                placeholder="যেমন: গণযোগাযোগ ও সাংবাদিকতা"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-session">শিক্ষাবর্ষ / সেশন</Label>
              <Input
                id="profile-session"
                value={values.session}
                onChange={(e) =>
                  setValues({ ...values, session: e.target.value })
                }
                maxLength={24}
                placeholder="যেমন: ২০২২–২৩"
              />
            </div>
          </div>
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
          <Button type="submit" disabled={busy} className="self-start">
            {busy ? "সংরক্ষণ হচ্ছে…" : "তথ্য সংরক্ষণ করুন →"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
