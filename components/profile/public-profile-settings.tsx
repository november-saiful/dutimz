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
import { FormMessage } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { errorMessage, reportError } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase";

type Visibility = {
  bio: boolean;
  department: boolean;
  session: boolean;
  hall_name: boolean;
  residency_status: boolean;
  published_stories: boolean;
};

const DEFAULTS: Visibility = {
  bio: true,
  department: false,
  session: false,
  hall_name: false,
  residency_status: false,
  published_stories: true,
};

/** The optional fields a member may show or hide. Identity is not in this list. */
const FIELDS: { key: keyof Visibility; label: string; description: string }[] = [
  { key: "bio", label: "সংক্ষিপ্ত পরিচিতি", description: "আপনার লেখা ছোট পরিচিতি।" },
  { key: "department", label: "বিভাগ", description: "আপনার বিভাগ বা প্রোগ্রাম।" },
  { key: "session", label: "শিক্ষাবর্ষ / সেশন", description: "আপনার সেশন।" },
  { key: "hall_name", label: "হলের নাম", description: "আবাসিক হলে থাকলে হলের নাম।" },
  { key: "residency_status", label: "আবাসিক অবস্থা", description: "হল-আবাসিক বা ক্যাম্পাসের বাইরে।" },
  { key: "published_stories", label: "প্রকাশিত প্রতিবেদন", description: "আপনার প্রকাশিত লেখার তালিকা।" },
];

export function PublicProfileSettings({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [values, setValues] = React.useState<Visibility>(DEFAULTS);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
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
        const { data, error: loadError } = await supabaseBrowser().rpc("get_my_profile_visibility");
        if (cancelled) return;
        if (loadError) {
          reportError("profile visibility load", loadError);
          setError("সেটিংস লোড করা যায়নি। আবার চেষ্টা করুন।");
          return;
        }
        const row = (data ?? {}) as Partial<Visibility>;
        setValues({
          bio: row.bio ?? DEFAULTS.bio,
          department: row.department ?? DEFAULTS.department,
          session: row.session ?? DEFAULTS.session,
          hall_name: row.hall_name ?? DEFAULTS.hall_name,
          residency_status: row.residency_status ?? DEFAULTS.residency_status,
          published_stories: row.published_stories ?? DEFAULTS.published_stories,
        });
      } catch (err) {
        reportError("profile visibility load", err);
        if (!cancelled) setError("সেটিংস লোড করা যায়নি। আবার চেষ্টা করুন।");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function save() {
    setBusy(true);
    setError("");
    setDone("");
    try {
      const { error: saveError } = await supabaseBrowser().rpc("set_my_profile_visibility", {
        p_visibility: values,
      });
      if (saveError) {
        setError(errorMessage("profile visibility save", saveError, "সেটিংস সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
        return;
      }
      setDone("আপনার পছন্দ সংরক্ষণ করা হয়েছে।");
    } catch (err) {
      setError(errorMessage("profile visibility save", err, "সেটিংস সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>পাবলিক প্রোফাইল ব্যবস্থাপনা</DialogTitle>
          <DialogDescription>
            কোন তথ্য সবার জন্য প্রকাশিত হবে তা বেছে নিন।
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              নাম, ইউজারনেম ও প্রোফাইল ছবি সবসময় পাবলিক প্রোফাইলে দেখা যাবে।
            </p>
            {FIELDS.map((field) => (
              <div key={field.key} className="flex items-start gap-3">
                <input
                  id={`visibility-${field.key}`}
                  type="checkbox"
                  className="mt-1"
                  checked={values[field.key]}
                  onChange={(e) => setValues((current) => ({ ...current, [field.key]: e.target.checked }))}
                />
                <div className="grid gap-0.5">
                  <Label htmlFor={`visibility-${field.key}`}>{field.label}</Label>
                  <p className="text-xs text-muted-foreground">{field.description}</p>
                </div>
              </div>
            ))}
            {error && <FormMessage>{error}</FormMessage>}
            {done && <FormMessage tone="success">{done}</FormMessage>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                বন্ধ করুন
              </Button>
              <Button type="button" onClick={() => void save()} disabled={busy}>
                {busy ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
