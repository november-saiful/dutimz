"use client";

import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldGrid,
  FieldSection,
  FormMessage,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  QuestionnaireFields,
  type QuestionnaireVersion,
} from "@/components/account/questionnaire-fields";
import {
  GalleryUploader,
  type GalleryItem,
} from "@/components/account/gallery-uploader";
import { ReporterApplication } from "@/components/account/reporter-application";
import { SignInButton } from "@/components/auth/sign-in-button";
import { rememberReturnPath, signInWithGoogle } from "@/lib/auth-client";
import { errorMessage, reportError } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase";
import { CATEGORIES } from "@/lib/site";

const PUBLISHING_ROLES = ["reporter", "moderator", "admin"];

export function WriterForm() {
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  // undefined while the role is being read; null when the reader has none (or a
  // plain reader), which is what decides whether the form is shown at all.
  const [role, setRole] = React.useState<string | null | undefined>(undefined);
  const [slugPreview, setSlugPreview] = React.useState("/news/…");
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState(
    "জুনিয়র রিপোর্টারের প্রতিবেদন অনুমোদনের অপেক্ষায় থাকবে।",
  );
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState("");
  const [questionnaire, setQuestionnaire] =
    React.useState<QuestionnaireVersion | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [gallery, setGallery] = React.useState<GalleryItem[]>([]);
  // "on" keeps the RPC contract: the group still submits `is_anonymous=on`.
  const [anonymous, setAnonymous] = React.useState("off");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          reportError("writer session", authError);
          if (!cancelled) setSignedIn(false);
          return;
        }
        if (cancelled) return;
        setSignedIn(Boolean(user));
        if (!user) return;
        const { data: roleRow, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (roleError) reportError("writer role", roleError);
        if (cancelled) return;
        setRole((roleRow as { role?: string } | null)?.role ?? null);
        const { data, error } = await supabase.rpc(
          "get_active_article_questionnaire",
        );
        if (error) {
          reportError("active article questionnaire", error);
          return;
        }
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (row && typeof row === "object") {
          setQuestionnaire(row as QuestionnaireVersion);
        }
      } catch (err) {
        reportError("writer form load", err);
        if (!cancelled) {
          setSignedIn(false);
          setRole(null);
        }
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
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const body = String(data.get("body") ?? "").trim();
    const categorySlug = String(data.get("category_slug") ?? "");
    if (!title || !body || !categorySlug) {
      setError("শিরোনাম, প্রতিবেদন ও বিভাগ আবশ্যক।");
      return;
    }
    if (body.length < 100) {
      setError("পূর্ণ প্রতিবেদন কমপক্ষে ১০০ অক্ষরের হতে হবে।");
      return;
    }
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setError(errorMessage("writer session", authError, "প্রতিবেদন জমা দেওয়া যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      if (!user) {
        rememberReturnPath();
        const { error: oauthError } = await signInWithGoogle();
        if (oauthError) {
          setError(errorMessage("writer sign-in", oauthError, "প্রবেশ করা যায়নি। আবার চেষ্টা করুন।"));
        }
        return;
      }
      // Clients hold no direct write grant on articles: the SECURITY DEFINER
      // RPC allocates the slug, validates the questionnaire, records the
      // revision, and sets pending/published by reporter tier.
      if (!questionnaire) {
        setError("প্রশ্নমালা এখনো প্রস্তুত নয়। পাতা রিফ্রেশ করে আবার চেষ্টা করুন।");
        return;
      }
      const mediaIds = gallery.map((item) => item.id);
      // The short description is derived server-side from the body, so there is nothing to
      // type — but `p_excerpt` still has to be *sent*.
      //
      // PostgREST matches a function by the argument names in the request, and it can only
      // leave out an argument that has a default. `p_excerpt` is declared before the body,
      // and PostgreSQL requires every parameter after a defaulted one to have a default too,
      // so it cannot carry one without making the body optional as well. Omitting it
      // therefore matched no candidate at all and every submission answered 404 "Could not
      // find the function" — a valid-looking report that never reached the database.
      const result = await supabase.rpc("submit_article", {
        p_category_slug: categorySlug,
        p_title: title,
        p_excerpt: null,
        p_body: body,
        p_media_keys: mediaIds.length ? mediaIds : null,
        p_hero_media_key: mediaIds[0] ?? null,
        p_questionnaire_answers: answers,
        p_questionnaire_version_id: questionnaire.id,
        p_is_anonymous: data.get("is_anonymous") === "on",
      });
      if (result.error) {
        setError(
          errorMessage(
            "article submission",
            result.error,
            "প্রতিবেদন জমা দেওয়া যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      form.reset();
      setSlugPreview("/news/…");
      setAnswers({});
      setAnonymous("off");
      for (const item of gallery) URL.revokeObjectURL(item.objectUrl);
      setGallery([]);
      setDone("আপনার প্রতিবেদন পর্যালোচনার জন্য পাঠানো হয়েছে।");
      setStatus("প্রতিবেদন পাঠানো হয়েছে।");
    } catch (err) {
      setError(errorMessage("article submission", err, "প্রতিবেদন জমা দেওয়া যায়নি। আবার চেষ্টা করুন।"));
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
          <SignInButton />
        </CardContent>
      </Card>
    );
  }

  if (role === undefined) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          অনুমতি যাচাই করা হচ্ছে…
        </CardContent>
      </Card>
    );
  }

  if (!PUBLISHING_ROLES.includes(role ?? "")) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>প্রতিবেদন জমা দিতে রিপোর্টার অনুমতি প্রয়োজন</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              সম্পাদকীয় দল আপনার আবেদন পর্যালোচনা করে রিপোর্টার স্তর নির্ধারণ করলে
              আপনি প্রতিবেদন লিখতে ও ছবি যুক্ত করতে পারবেন।
            </p>
          </CardContent>
        </Card>
        <ReporterApplication />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <FieldSection
            title="প্রতিবেদনের পরিচয়"
            description="শিরোনাম, বিভাগ ও সংক্ষিপ্ত পরিচিতি পাঠকের প্রথম পরিচয়।"
          >
            <FieldGrid>
              <Field
                label="প্রতিবেদনের শিরোনাম"
                htmlFor="write-title"
                wide
              >
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
              </Field>
              <Field label="বিভাগ" htmlFor="write-category">
                <Select
                  id="write-category"
                  name="category_slug"
                  required
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
                </Select>
              </Field>
              <Field
                label="প্রতিবেদনের ঠিকানা"
                hint="শিরোনাম থেকে ইংরেজি ঠিকানা স্বয়ংক্রিয়ভাবে তৈরি হবে।"
              >
                <p className="flex h-10 min-w-0 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                  {slugPreview}
                </p>
              </Field>
            </FieldGrid>
          </FieldSection>

          <FieldSection
            title="পূর্ণ প্রতিবেদন"
            description="প্রতিবেদন জমা দিতে রিপোর্টার অনুমতি প্রয়োজন — জুনিয়র রিপোর্টারের লেখা অনুমোদনের অপেক্ষায় থাকে। ছবি আপলোড শুধু image/* ধরনের জন্য (সর্বোচ্চ ১০টি)।"
          >
            <FieldGrid>
              <Field
                label="প্রতিবেদনের মূল লেখা"
                htmlFor="write-body"
                wide
                hint="কমপক্ষে ১০০ অক্ষর। ব্যক্তিগত আক্রমণ, গুজব বা অনুমতিহীন ব্যক্তিগত তথ্য প্রকাশ করবেন না।"
              >
                <Textarea
                  id="write-body"
                  name="body"
                  rows={12}
                  minLength={100}
                  maxLength={30000}
                  required
                  placeholder="যাচাই করা তথ্য ও প্রাসঙ্গিক সূত্রসহ প্রতিবেদন লিখুন…"
                />
              </Field>
            </FieldGrid>
          </FieldSection>

          {questionnaire && (
            <FieldSection
              aria-live="polite"
              title="ঘটনা ও কার্যক্রমের বিবরণ"
              description="যা জানা নেই তা ফাঁকা রাখুন। ভুক্তভোগী ও অভিযুক্তের পরিচিতি কেবল প্রশাসনিক পর্যালোচনার জন্য; জনসমক্ষে শুধু পরিচয়বিহীন সামগ্রিক পরিসংখ্যান দেখানো হবে।"
            >
              <QuestionnaireFields
                questionnaire={questionnaire}
                answers={answers}
                onChange={setAnswers}
              />
            </FieldSection>
          )}

          <GalleryUploader items={gallery} onChange={setGallery} />

          <FieldSection title="প্রকাশের পরিচয়">
            <RadioGroup
              name="is_anonymous"
              value={anonymous}
              onValueChange={setAnonymous}
              options={[
                {
                  value: "off",
                  label: "নিজের নামে",
                  description: "প্রোফাইল ও বাইলাইন প্রতিবেদনের সঙ্গে প্রকাশিত হবে।",
                },
                {
                  value: "on",
                  label: "নাম প্রকাশে অনিচ্ছুক",
                  description:
                    "প্রকাশিত প্রতিবেদনে আপনার নাম বা প্রোফাইল লিংক কোথাও দেখানো হবে না।",
                },
              ]}
            />
          </FieldSection>

          {error && <FormMessage>{error}</FormMessage>}
          {done && <FormMessage tone="success">{done}</FormMessage>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "পাঠানো হচ্ছে…" : "প্রতিবেদন পাঠান →"}
            </Button>
            <span className="text-xs text-muted-foreground">{status}</span>
          </div>
        </CardContent>
      </Card>
      <ReporterApplication />
    </form>
  );
}
