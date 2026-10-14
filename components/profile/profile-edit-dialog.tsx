"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGrid,
  FieldSection,
  FormMessage,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, reportError } from "@/lib/errors";
import {
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  uploadImage,
} from "@/lib/media-upload";
import { supabaseBrowser } from "@/lib/supabase";
import { bn } from "@/lib/site";

type Values = {
  display_name: string;
  username: string;
  bio: string;
  department: string;
  session: string;
  du_registration_number: string;
  residency_status: string;
  hall_name: string;
  whatsapp_number: string;
  whatsapp_na: boolean;
  payout_method: string;
  payout_number: string;
};

const EMPTY: Values = {
  display_name: "",
  username: "",
  bio: "",
  department: "",
  session: "",
  du_registration_number: "",
  residency_status: "",
  hall_name: "",
  whatsapp_number: "",
  whatsapp_na: false,
  payout_method: "",
  payout_number: "",
};

/** A member's own two pictures, as the columns hold them. */
type Images = { avatar_url: string | null; cover_url: string | null };

const NO_IMAGES: Images = { avatar_url: null, cover_url: null };

/**
 * The one place a member completes their profile — and the one place they upload
 * their own face and banner. The dashboard opens it; no other page or form edits a
 * profile, and the username is read-only because a handle is a stable public
 * address that only the desk may change.
 *
 * The two pictures save on their own, as soon as the upload lands: they are not
 * part of the form's validation (nothing can be wrong with a picture except its
 * size, which the media Worker enforces), and making a member press “তথ্য সংরক্ষণ
 * করুন” again after choosing a photo is how a banner gets lost.
 */
/**
 * One picture, with its preview and its two actions. A member's own upload replaces
 * whatever was there (the Google picture included), and “সরান” puts the column back
 * to null rather than storing an empty string — `avatar_url` is nullable by design.
 *
 * It is a top-level component on purpose: a declaration inside the dialog would be a
 * new type on every keystroke the member types, remounting the picker and dropping
 * the file input mid-choice.
 */
function ImagePicker({
  id,
  label,
  hint,
  shape,
  wide = false,
  value,
  busy,
  onPick,
  onRemove,
}: {
  id: string;
  label: string;
  hint: string;
  shape: "avatar" | "cover";
  wide?: boolean;
  value: string | null;
  busy: boolean;
  onPick: (file?: File) => void;
  onRemove: () => void;
}) {
  const frame =
    shape === "avatar"
      ? "size-20 rounded-full"
      : "h-28 w-full rounded-xl";
  return (
    <Field label={label} htmlFor={id} hint={hint} wide={wide}>
      <div className="flex items-start gap-3">
        <div
          className={`${frame} shrink-0 overflow-hidden border border-border bg-muted`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="size-full object-cover" />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <input
            id={id}
            type="file"
            accept={IMAGE_ACCEPT}
            disabled={busy}
            onChange={(event) => {
              onPick(event.target.files?.[0]);
              // Chosen twice in a row is still a choice: clear it so the same file fires again.
              event.target.value = "";
            }}
            className="max-w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !value}
              onClick={onRemove}
            >
              সরান
            </Button>
            {busy && (
              <span className="text-xs text-muted-foreground">
                সংরক্ষণ হচ্ছে…
              </span>
            )}
          </div>
        </div>
      </div>
    </Field>
  );
}

export function ProfileEditDialog({
  open,
  onOpenChange,
  onSaved,
  onImagesChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (completion: number) => void;
  /**
   * The dashboard's band and avatar should follow a new picture immediately, so
   * the saved pair is handed back rather than left to a refetch: this dialog is
   * where the write happened, and a second read could only agree with it.
   */
  onImagesChanged?: (images: Images) => void;
}) {
  const [values, setValues] = React.useState<Values>(EMPTY);
  const [images, setImages] = React.useState<Images>(NO_IMAGES);
  const [imageBusy, setImageBusy] = React.useState<keyof Images | null>(null);
  const [imageError, setImageError] = React.useState("");
  const [imageDone, setImageDone] = React.useState("");
  const [completion, setCompletion] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    setDone("");
    setLoading(true);
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          reportError("profile editor session", authError);
          if (!cancelled) setError("আপনার তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।");
          return;
        }
        if (!user) {
          if (!cancelled) setError("প্রোফাইল সম্পাদনা করতে অ্যাকাউন্টে প্রবেশ করুন।");
          return;
        }
        const [profileResult, detailsResult, completionResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("username,display_name,bio,avatar_url,cover_url")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("profile_details")
            .select("department,session,du_registration_number,residency_status,hall_name,whatsapp_number,whatsapp_na,payout_method,payout_number")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase.rpc("get_my_profile_completion"),
        ]);
        if (cancelled) return;
        for (const [context, failure] of [
          ["profile editor profile load", profileResult.error],
          ["profile editor details load", detailsResult.error],
          ["profile completion load", completionResult.error],
        ] as const) {
          if (failure) reportError(context, failure);
        }
        if (profileResult.error || detailsResult.error) {
          setError("আপনার তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।");
        }
        const profile = profileResult.data as {
          username?: string;
          display_name?: string;
          bio?: string;
          avatar_url?: string | null;
          cover_url?: string | null;
        } | null;
        const details = detailsResult.data as Record<string, unknown> | null;
        setImages({
          avatar_url: profile?.avatar_url ?? null,
          cover_url: profile?.cover_url ?? null,
        });
        setValues({
          display_name: profile?.display_name ?? "",
          username: profile?.username ?? "",
          bio: profile?.bio ?? "",
          department: String(details?.department ?? ""),
          session: String(details?.session ?? ""),
          du_registration_number: String(details?.du_registration_number ?? ""),
          residency_status: String(details?.residency_status ?? ""),
          hall_name: String(details?.hall_name ?? ""),
          whatsapp_number: String(details?.whatsapp_number ?? ""),
          whatsapp_na: Boolean(details?.whatsapp_na),
          payout_method: String(details?.payout_method ?? ""),
          payout_number: String(details?.payout_number ?? ""),
        });
        setCompletion(Number(completionResult.data ?? 0));
      } catch (err) {
        reportError("profile editor load", err);
        if (!cancelled) setImages(NO_IMAGES);
        if (!cancelled) setError("আপনার তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  /** Write one picture column — a URL, or null when the member removes it. */
  async function saveImage(column: keyof Images, url: string | null) {
    setImageError("");
    setImageDone("");
    setImageBusy(column);
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        setImageError("ছবি সংরক্ষণ করতে অ্যাকাউন্টে প্রবেশ করুন।");
        return;
      }
      // Only these two columns are written here; the handle and the role stay out
      // of this component's reach, as they are out of the form's.
      const { error: saveError } = await supabase
        .from("profiles")
        .update({ [column]: url })
        .eq("id", user.id);
      if (saveError) {
        setImageError(
          errorMessage(
            "profile image save",
            saveError,
            "ছবি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
          ),
        );
        return;
      }
      const next: Images = { ...images, [column]: url };
      setImages(next);
      setImageDone(
        column === "avatar_url"
          ? "প্রোফাইল ছবি সংরক্ষণ হয়েছে।"
          : "কভার ছবি সংরক্ষণ হয়েছে।",
      );
      onImagesChanged?.(next);
    } catch (err) {
      setImageError(
        errorMessage("profile image save", err, "ছবি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"),
      );
    } finally {
      setImageBusy(null);
    }
  }

  /** Upload the chosen file, then keep its URL on the member's own row. */
  async function pickImage(column: keyof Images, file?: File) {
    if (!file) return;
    setImageError("");
    setImageDone("");
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("ছবিটি সর্বোচ্চ ২০ মেগাবাইট হতে পারে।");
      return;
    }
    setImageBusy(column);
    try {
      const uploaded = await uploadImage(file, "profile");
      await saveImage(column, uploaded.url);
    } catch (err) {
      setImageError(
        errorMessage(
          "profile image upload",
          err,
          "ছবি আপলোড করা যায়নি। আবার চেষ্টা করুন।",
        ),
      );
      setImageBusy(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
    if (!values.display_name.trim()) {
      setError("পূর্ণ নাম আবশ্যক।");
      return;
    }
    if ((values.payout_method && !values.payout_number.trim()) || (!values.payout_method && values.payout_number.trim())) {
      setError("পেমেন্ট পদ্ধতি ও নম্বর একসঙ্গে দিন, অথবা দুটোই খালি রাখুন।");
      return;
    }
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setError(errorMessage("profile save session", authError, "আপনার তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      if (!user) {
        setError("প্রোফাইল সম্পাদনা করতে অ্যাকাউন্টে প্রবেশ করুন।");
        return;
      }
      // The username is deliberately absent: update(username) is revoked, and the
      // handle only ever changes through the audited desk RPC.
      const profileResult = await supabase
        .from("profiles")
        .update({
          display_name: values.display_name.trim(),
          bio: values.bio.trim(),
        })
        .eq("id", user.id);
      if (profileResult.error) {
        setError(errorMessage("profile save", profileResult.error, "আপনার তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      const detailsResult = await supabase.from("profile_details").upsert({
        user_id: user.id,
        department: values.department.trim() || null,
        session: values.session.trim() || null,
        du_registration_number: values.du_registration_number.trim() || null,
        residency_status: values.residency_status || null,
        hall_name: values.residency_status === "hall_resident" ? values.hall_name.trim() || null : null,
        whatsapp_number: values.whatsapp_number.trim() || null,
        whatsapp_na: values.whatsapp_na,
        payout_method: values.payout_method || null,
        payout_number: values.payout_number.trim() || null,
      });
      if (detailsResult.error) {
        setError(errorMessage("profile details save", detailsResult.error, "আপনার তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      const completionResult = await supabase.rpc("get_my_profile_completion");
      if (completionResult.error) {
        reportError("profile completion refresh", completionResult.error);
      } else {
        const next = Number(completionResult.data ?? completion);
        setCompletion(next);
        onSaved?.(next);
      }
      setDone("আপনার তথ্য সংরক্ষণ করা হয়েছে।");
    } catch (err) {
      setError(errorMessage("profile save", err, "আপনার তথ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>প্রোফাইল সম্পাদনা</DialogTitle>
          <DialogDescription>
            প্রোফাইল সম্পূর্ণ {bn(completion)}% — সব ঘর পূরণ করলে আয়ের সুবিধা চালু হবে।
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <Progress value={completion} />

            <FieldSection
              title="ছবি"
              description="প্রোফাইল ছবি আর কভার ছবি — দুটোই আপনার প্রকাশ্য পাতায় দেখা যাবে। ছবি বাছাই করলেই সংরক্ষিত হয়ে যায়।"
            >
              <FieldGrid>
                <ImagePicker
                  id="edit-avatar"
                  label="প্রোফাইল ছবি"
                  hint="বর্গাকার ছবি ভালো দেখায়। সর্বোচ্চ ২০ MB (JPEG, PNG, WebP, GIF, AVIF)।"
                  shape="avatar"
                  value={images.avatar_url}
                  busy={imageBusy === "avatar_url"}
                  onPick={(file) => void pickImage("avatar_url", file)}
                  onRemove={() => void saveImage("avatar_url", null)}
                />
                <ImagePicker
                  id="edit-cover"
                  label="কভার ছবি"
                  hint="প্রোফাইলের উপরের বড় ছবি — চওড়া ছবি সবচেয়ে ভালো মানায়।"
                  shape="cover"
                  wide
                  value={images.cover_url}
                  busy={imageBusy === "cover_url"}
                  onPick={(file) => void pickImage("cover_url", file)}
                  onRemove={() => void saveImage("cover_url", null)}
                />
              </FieldGrid>
              {imageError && <FormMessage>{imageError}</FormMessage>}
              {imageDone && <FormMessage tone="success">{imageDone}</FormMessage>}
            </FieldSection>

            <FieldSection title="পরিচিতি" description="পাঠকের কাছে আপনার নাম এভাবেই দেখানো হবে।">
              <FieldGrid>
                <Field label="পূর্ণ নাম" htmlFor="edit-name">
                  <Input id="edit-name" value={values.display_name} maxLength={80} required onChange={(e) => set("display_name", e.target.value)} />
                </Field>
                <Field label="ইউজারনেম" htmlFor="edit-username" hint="ইউজারনেম কেবল অ্যাডমিন পরিবর্তন করতে পারেন।">
                  <Input id="edit-username" value={values.username} readOnly disabled className="bg-muted" />
                </Field>
                <Field label="সংক্ষিপ্ত পরিচিতি" htmlFor="edit-bio" wide hint="সর্বোচ্চ ৩০০ অক্ষর।">
                  <Textarea id="edit-bio" value={values.bio} rows={3} maxLength={300} onChange={(e) => set("bio", e.target.value)} />
                </Field>
              </FieldGrid>
            </FieldSection>

            <FieldSection title="শিক্ষার্থী তথ্য">
              <FieldGrid>
                <Field label="বিভাগ" htmlFor="edit-department">
                  <Input id="edit-department" value={values.department} maxLength={100} onChange={(e) => set("department", e.target.value)} />
                </Field>
                <Field label="শিক্ষাবর্ষ / সেশন" htmlFor="edit-session">
                  <Input id="edit-session" value={values.session} maxLength={24} onChange={(e) => set("session", e.target.value)} />
                </Field>
                <Field label="ডু রেজিস্ট্রেশন নম্বর" htmlFor="edit-registration">
                  <Input id="edit-registration" value={values.du_registration_number} maxLength={40} onChange={(e) => set("du_registration_number", e.target.value)} />
                </Field>
                <Field label="আবাসিক অবস্থা" htmlFor="edit-residency">
                  <Select id="edit-residency" value={values.residency_status} onChange={(e) => set("residency_status", e.target.value)}>
                    <option value="">বেছে নিন</option>
                    <option value="hall_resident">হল-আবাসিক</option>
                    <option value="off_campus">ক্যাম্পাসের বাইরে</option>
                  </Select>
                </Field>
                {values.residency_status === "hall_resident" && (
                  <Field label="হলের নাম" htmlFor="edit-hall">
                    <Input id="edit-hall" value={values.hall_name} maxLength={120} onChange={(e) => set("hall_name", e.target.value)} />
                  </Field>
                )}
                <Field label="হোয়াটসঅ্যাপ নম্বর" htmlFor="edit-whatsapp" hint="শিক্ষার্থী কল্যাণে যোগাযোগের জন্য।">
                  <Input id="edit-whatsapp" value={values.whatsapp_number} maxLength={24} onChange={(e) => set("whatsapp_number", e.target.value)} />
                </Field>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    id="edit-whatsapp-na"
                    type="checkbox"
                    checked={values.whatsapp_na}
                    onChange={(e) => set("whatsapp_na", e.target.checked)}
                  />
                  <Label htmlFor="edit-whatsapp-na">হোয়াটসঅ্যাপ নম্বর দিতে চাই না</Label>
                </div>
              </FieldGrid>
            </FieldSection>

            <FieldSection title="পেমেন্ট" description="আয় উত্তোলনের জন্য পেমেন্টের তথ্য প্রয়োজন।">
              <FieldGrid>
                <Field label="পেমেন্ট পদ্ধতি" htmlFor="edit-payout-method">
                  <Select id="edit-payout-method" value={values.payout_method} onChange={(e) => set("payout_method", e.target.value)}>
                    <option value="">বেছে নিন</option>
                    <option value="bkash">বিকাশ</option>
                    <option value="nagad">নগদ</option>
                  </Select>
                </Field>
                <Field label="পেমেন্ট নম্বর" htmlFor="edit-payout-number">
                  <Input id="edit-payout-number" value={values.payout_number} maxLength={24} onChange={(e) => set("payout_number", e.target.value)} />
                </Field>
              </FieldGrid>
            </FieldSection>

            {error && <FormMessage>{error}</FormMessage>}
            {done && <FormMessage tone="success">{done}</FormMessage>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                বন্ধ করুন
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "সংরক্ষণ হচ্ছে…" : "তথ্য সংরক্ষণ করুন"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
