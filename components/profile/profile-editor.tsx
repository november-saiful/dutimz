"use client";

import * as React from "react";

import { SignInButton } from "@/components/auth/sign-in-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldGrid,
  FieldSection,
  FormMessage,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, isUniqueViolation, reportError } from "@/lib/errors";
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
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          reportError("profile editor session", authError);
          if (!cancelled) setSignedIn(false);
          return;
        }
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
        let loadError = "";
        if (profileResult.error) {
          reportError("profile editor profile load", profileResult.error);
          loadError = "আপনার প্রোফাইল লোড করা যায়নি। আবার চেষ্টা করুন।";
        }
        if (detailsResult.error) {
          reportError("profile editor details load", detailsResult.error);
          loadError = "প্রোফাইলের অতিরিক্ত তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।";
        }
        if (completionResult.error) {
          reportError("profile completion load", completionResult.error);
          loadError = "প্রোফাইলের অগ্রগতি লোড করা যায়নি। আবার চেষ্টা করুন।";
        }
        if (loadError) setError(loadError);
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
      } catch (err) {
        reportError("profile editor load", err);
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
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setError(errorMessage("profile save session", authError, "আপনার তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
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
        // The only unique key a reader can collide with here is their username.
        reportError("profile save", profileResult.error);
        setError(
          isUniqueViolation(profileResult.error)
            ? "এই ইউজারনেমটি ইতিমধ্যে ব্যবহৃত। অন্য একটি বেছে নিন।"
            : errorMessage(
                "profile save",
                profileResult.error,
                "আপনার তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
              ),
        );
        return;
      }
      const detailsResult = await supabase.from("profile_details").upsert({
        user_id: user.id,
        department: values.department.trim() || null,
        session: values.session.trim() || null,
      });
      if (detailsResult.error) {
        setError(
          errorMessage(
            "profile details save",
            detailsResult.error,
            "আপনার তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      const completionResult = await supabase.rpc(
        "get_my_profile_completion",
      );
      if (completionResult.error) {
        reportError("profile completion refresh", completionResult.error);
      } else {
        setCompletion(Number(completionResult.data ?? completion));
      }
      setDone("আপনার তথ্য সংরক্ষণ করা হয়েছে।");
    } catch (err) {
      setError(errorMessage("profile save", err, "আপনার তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
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
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
          <p>প্রোফাইল সম্পাদনা করতে অ্যাকাউন্টে প্রবেশ করুন।</p>
          <SignInButton />
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
          <FieldSection
            title="পরিচিতি"
            description="পাঠকের কাছে আপনার নাম ও লেখক-পরিচয় এভাবেই দেখানো হবে।"
          >
            <FieldGrid>
              <Field label="পূর্ণ নাম" htmlFor="profile-name">
                <Input
                  id="profile-name"
                  value={values.display_name}
                  onChange={(e) =>
                    setValues({ ...values, display_name: e.target.value })
                  }
                  maxLength={80}
                  required
                />
              </Field>
              <Field
                label="ইউজারনেম"
                htmlFor="profile-username"
                hint="প্রোফাইল লিংকে এই নামটিই থাকবে।"
              >
                <Input
                  id="profile-username"
                  value={values.username}
                  onChange={(e) =>
                    setValues({ ...values, username: e.target.value })
                  }
                  maxLength={24}
                />
              </Field>
              <Field
                label="বিভাগ"
                htmlFor="profile-dept"
                hint="যেমন: গণযোগাযোগ ও সাংবাদিকতা"
              >
                <Input
                  id="profile-dept"
                  value={values.department}
                  onChange={(e) =>
                    setValues({ ...values, department: e.target.value })
                  }
                  maxLength={100}
                  placeholder="যেমন: গণযোগাযোগ ও সাংবাদিকতা"
                />
              </Field>
              <Field
                label="শিক্ষাবর্ষ / সেশন"
                htmlFor="profile-session"
                hint="যেমন: ২০২২–২৩"
              >
                <Input
                  id="profile-session"
                  value={values.session}
                  onChange={(e) =>
                    setValues({ ...values, session: e.target.value })
                  }
                  maxLength={24}
                  placeholder="যেমন: ২০২২–২৩"
                />
              </Field>
              <Field
                label="সংক্ষিপ্ত পরিচিতি"
                htmlFor="profile-bio"
                wide
              >
                <Textarea
                  id="profile-bio"
                  value={values.bio}
                  onChange={(e) =>
                    setValues({ ...values, bio: e.target.value })
                  }
                  rows={3}
                  maxLength={500}
                />
              </Field>
            </FieldGrid>
          </FieldSection>
          {error && <FormMessage>{error}</FormMessage>}
          {done && <FormMessage tone="success">{done}</FormMessage>}
          <Button type="submit" disabled={busy} className="self-start">
            {busy ? "সংরক্ষণ হচ্ছে…" : "তথ্য সংরক্ষণ করুন →"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
