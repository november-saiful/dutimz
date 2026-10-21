"use client";

import Link from "next/link";
import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Field,
  FieldGrid,
  FieldSection,
  FormMessage,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/ui/rich-text-editor";
import {
  QuestionnaireFields,
  visibleFields,
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
import { mediaMarkdownFor } from "@/lib/richtext";
import { supabaseBrowser } from "@/lib/supabase";
import { CATEGORIES, INTERVIEW_SECTIONS, SITE_URL } from "@/lib/site";

const PUBLISHING_ROLES = ["reporter", "moderator", "admin"];

/**
 * The writer's unsent work, kept in this browser only. Gallery blobs cannot
 * survive a reload (their object URLs die with the page), so the draft holds
 * the text and the questionnaire answers; photos are re-attached next visit.
 */
const DRAFT_KEY = "dutimz-write-draft";

type WriteDraft = {
  title: string;
  category: string;
  interviewKind: string;
  body: string;
  answers: Record<string, unknown>;
  /** The questionnaire version the answers were given against. */
  qv: string | null;
};

function readDraft(): WriteDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WriteDraft>;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      category: typeof parsed.category === "string" ? parsed.category : "",
      interviewKind: typeof parsed.interviewKind === "string" ? parsed.interviewKind : "",
      body: typeof parsed.body === "string" ? parsed.body : "",
      answers:
        parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers)
          ? (parsed.answers as Record<string, unknown>)
          : {},
      qv: typeof parsed.qv === "string" ? parsed.qv : null,
    };
  } catch {
    return null;
  }
}

function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/** The path of a stored absolute article URL, for a router link. */
function previewPathFor(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
}

export function WriterForm() {
  const { toast } = useToast();
  const [signedIn, setSignedIn] = React.useState<boolean | null>(null);
  // undefined while the role is being read; null when the reader has none (or a
  // plain reader), which is what decides whether the form is shown at all.
  const [role, setRole] = React.useState<string | null | undefined>(undefined);
  // The article's real link, filled in from the row `submit_article` returns. Before submission
  // there is no slug to show — the server allocates it — so the field stays a plain hint.
  const [createdUrl, setCreatedUrl] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState(
    "জুনিয়র রিপোর্টারের প্রতিবেদন অনুমোদনের অপেক্ষায় থাকবে।",
  );
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState("");
  const [questionnaire, setQuestionnaire] =
    React.useState<QuestionnaireVersion | null>(null);
  // The draft is read once, up front, so a reload restores the writer's words
  // before the first paint rather than flashing an empty form.
  const [initialDraft] = React.useState<WriteDraft | null>(() =>
    typeof window === "undefined" ? null : readDraft(),
  );
  const [title, setTitle] = React.useState(initialDraft?.title ?? "");
  const [categorySlug, setCategorySlug] = React.useState(initialDraft?.category ?? "");
  // The interview desk's second step: virtual vs in-person. Chosen only when the desk is
  // `interview` — the select itself only renders then — and cleared when the desk changes.
  const [interviewKind, setInterviewKind] = React.useState(initialDraft?.interviewKind ?? "");
  const [draftDismissed, setDraftDismissed] = React.useState(false);
  const [answers, setAnswers] = React.useState<Record<string, unknown>>(
    initialDraft?.answers ?? {},
  );
  const [gallery, setGallery] = React.useState<GalleryItem[]>([]);
  // "on" keeps the RPC contract: the group still submits `is_anonymous=on`.
  const [anonymous, setAnonymous] = React.useState("off");
  // The body is Markdown now, and the editor is controlled, so the text lives in state as well.
  // It is named for the draft rather than for the column because the submit path still reads the
  // value out of FormData under `name="body"`, exactly as the textarea's did.
  const [bodyDraft, setBodyDraft] = React.useState(initialDraft?.body ?? "");
  const editorRef = React.useRef<RichTextEditorHandle>(null);

  // Answers given against a retired questionnaire version are dropped the
  // moment the active one arrives: the server would reject them as belonging
  // to questions that no longer apply.
  React.useEffect(() => {
    if (!questionnaire || !initialDraft) return;
    if (initialDraft.qv !== questionnaire.id) setAnswers({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionnaire]);

  // Autosave, debounced: every keystroke schedules a write, and the write
  // carries the questionnaire version so a stale draft can be recognised.
  React.useEffect(() => {
    const frame = window.setTimeout(() => {
      try {
        if (!title && !categorySlug && !interviewKind && !bodyDraft && Object.keys(answers).length === 0) {
          window.localStorage.removeItem(DRAFT_KEY);
          return;
        }
        const draft: WriteDraft = {
          title,
          category: categorySlug,
          interviewKind,
          body: bodyDraft,
          answers,
          qv: questionnaire?.id ?? initialDraft?.qv ?? null,
        };
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // A full or blocked store must never break the form.
      }
    }, 600);
    return () => window.clearTimeout(frame);
  }, [title, categorySlug, interviewKind, bodyDraft, answers, questionnaire, initialDraft]);

  function clearDraft() {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // See above.
    }
    setTitle("");
    setCategorySlug("");
    setInterviewKind("");
    setBodyDraft("");
    setAnswers({});
  }

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

  // Every attempt reports its outcome the same way — inline next to the button, and as a toast
  // that stays visible even after the form resets.
  function fail(message: string, description?: string) {
    setError(message);
    toast({ tone: "error", title: message, description });
  }

  async function copyCreatedLink() {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      toast({ tone: "success", title: "লিংক কপি হয়েছে।" });
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      reportError("copy article link", err);
      toast({ tone: "error", title: "লিংক কপি করা যায়নি।" });
    }
  }

  /**
   * The editor's picture button. The file input lives in the uploader below the text, so this takes
   * the writer to it instead of opening a dialog with nothing to upload into.
   */
  function focusGallery() {
    const input = document.getElementById("write-gallery");
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
    (input as HTMLInputElement | null)?.focus();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const body = String(data.get("body") ?? "").trim();
    const categorySlug = String(data.get("category_slug") ?? "");
    const interviewKindValue = String(data.get("interview_kind") ?? "");
    if (!title || !body || !categorySlug) {
      fail("শিরোনাম, প্রতিবেদন ও বিভাগ আবশ্যক।");
      return;
    }
    if (categorySlug === "interview" && !interviewKindValue) {
      fail("সাক্ষাৎকারের ধরন (ভার্চুয়াল / ইন-পার্সন) নির্বাচন করুন।");
      return;
    }
    if (body.length < 100) {
      fail("পূর্ণ প্রতিবেদন কমপক্ষে ১০০ অক্ষরের হতে হবে।");
      return;
    }
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        fail(errorMessage("writer session", authError, "প্রতিবেদন জমা দেওয়া যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      if (!user) {
        rememberReturnPath();
        const { error: oauthError } = await signInWithGoogle();
        if (oauthError) {
          fail(errorMessage("writer sign-in", oauthError, "প্রবেশ করা যায়নি। আবার চেষ্টা করুন।"));
        }
        return;
      }
      // Clients hold no direct write grant on articles: the SECURITY DEFINER
      // RPC allocates the slug, validates the questionnaire, records the
      // revision, and sets pending/published by reporter tier.
      if (!questionnaire) {
        fail("প্রশ্নমালা এখনো প্রস্তুত নয়। পাতা রিফ্রেশ করে আবার চেষ্টা করুন।");
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
        p_interview_kind: categorySlug === "interview" ? interviewKindValue : null,
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
        fail(
          errorMessage(
            "article submission",
            result.error,
            "প্রতিবেদন জমা দেওয়া যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      // `submit_article` allocates the slug server-side; the row it returns is the only place
      // the real address exists. Showing anything else before now is what produced a wrong URL.
      const createdSlug =
        typeof (result.data as { slug?: unknown } | null)?.slug === "string"
          ? ((result.data as { slug: string }).slug)
          : "";
      form.reset();
      setTitle("");
      setCategorySlug("");
      setInterviewKind("");
      setBodyDraft("");
      setAnswers({});
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // See above.
      }
      setAnonymous("off");
      for (const item of gallery) URL.revokeObjectURL(item.objectUrl);
      setGallery([]);
      setCopied(false);
      setCreatedUrl(
        createdSlug ? `${SITE_URL}/news/${encodeURIComponent(createdSlug)}/` : "",
      );
      setDone("আপনার প্রতিবেদন পর্যালোচনার জন্য পাঠানো হয়েছে।");
      setStatus("প্রতিবেদন পাঠানো হয়েছে।");
      toast({
        tone: "success",
        title: "প্রতিবেদন পাঠানো হয়েছে।",
        description: "সম্পাদকীয় ডেস্ক পর্যালোচনার পর জানানো হবে।",
      });
    } catch (err) {
      fail(errorMessage("article submission", err, "প্রতিবেদন জমা দেওয়া যায়নি। আবার চেষ্টা করুন।"));
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

  const hadDraft = Boolean(
    initialDraft &&
      (initialDraft.title ||
        initialDraft.category ||
        initialDraft.interviewKind ||
        initialDraft.body ||
        Object.keys(initialDraft.answers).length > 0),
  );
  // How far through the required questions the writer is, over the fields
  // actually visible with the current answers — the honest denominator.
  const requiredFields = questionnaire
    ? visibleFields(questionnaire.schema, answers).filter((field) => field.required)
    : [];
  const answeredRequired = requiredFields.filter((field) =>
    isAnswered(answers[field.id]),
  ).length;
  const requiredProgress = requiredFields.length
    ? Math.round((answeredRequired / requiredFields.length) * 100)
    : 100;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {hadDraft && !draftDismissed && !done && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2"
          role="status"
        >
          <p className="text-sm text-muted-foreground">
            আগের খসড়া ফিরিয়ে আনা হয়েছে। ছবি থাকলে আবার যুক্ত করুন।
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearDraft();
              setDraftDismissed(true);
            }}
          >
            খসড়া মুছুন
          </Button>
        </div>
      )}
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
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={180}
                  required
                  placeholder="আপনার প্রতিবেদনের শিরোনাম"
                />
              </Field>
              <Field label="বিভাগ" htmlFor="write-category">
                <Select
                  id="write-category"
                  name="category_slug"
                  value={categorySlug}
                  onChange={(event) => {
                    setCategorySlug(event.target.value);
                    if (event.target.value !== "interview") setInterviewKind("");
                  }}
                  required
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
              {categorySlug === "interview" && (
                <Field label="সাক্ষাৎকারের ধরন" htmlFor="write-interview-kind">
                  <Select
                    id="write-interview-kind"
                    name="interview_kind"
                    value={interviewKind}
                    onChange={(event) => setInterviewKind(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      ধরন বেছে নিন
                    </option>
                    {INTERVIEW_SECTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field
                label="প্রতিবেদনের ঠিকানা"
                hint="জমা দেওয়ার পর প্রকৃত ইংরেজি ঠিকানা তৈরি হয়; তখনই লিংক কপি করা যাবে।"
              >
                <p className="flex h-10 min-w-0 items-center overflow-hidden rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                  <span className="truncate">
                    {createdUrl || "জমা দেওয়ার পর তৈরি হবে"}
                  </span>
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
                <RichTextEditor
                  ref={editorRef}
                  id="write-body"
                  name="body"
                  value={bodyDraft}
                  onChange={setBodyDraft}
                  rows={12}
                  minLength={100}
                  maxLength={30000}
                  required
                  placeholder="যাচাই করা তথ্য ও প্রাসঙ্গিক সূত্রসহ প্রতিবেদন লিখুন…"
                  onRequestImage={focusGallery}
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
              {requiredFields.length > 0 && (
                <div className="flex items-center gap-3">
                  <Progress
                    value={requiredProgress}
                    aria-label={`আবশ্যক প্রশ্নের অগ্রগতি: ${answeredRequired} / ${requiredFields.length}`}
                    className="h-2 flex-1"
                  />
                  <p className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
                    আবশ্যক {new Intl.NumberFormat("bn-BD").format(answeredRequired)} /{" "}
                    {new Intl.NumberFormat("bn-BD").format(requiredFields.length)}
                  </p>
                </div>
              )}
              <QuestionnaireFields
                questionnaire={questionnaire}
                answers={answers}
                onChange={setAnswers}
              />
            </FieldSection>
          )}

          <GalleryUploader
            items={gallery}
            onChange={setGallery}
            onInsert={(item) =>
              editorRef.current?.insertAtCaret(
                mediaMarkdownFor(item.id, item.name, "article"),
              )
            }
          />

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
          {createdUrl && (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
              <p className="text-sm font-medium">প্রতিবেদনের লিংক</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 break-all rounded bg-background px-2 py-1 text-xs">
                  {createdUrl}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyCreatedLink()}
                >
                  {copied ? "কপি হয়েছে" : "লিংক কপি করুন"}
                </Button>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link href={previewPathFor(createdUrl)}>
                    প্রিভিউ দেখুন →
                  </Link>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                প্রকাশের আগে এই লিংকটি শুধু আপনি ও সম্পাদকীয় ডেস্ক খুলতে পারবেন।
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
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
