"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useLocaleStore } from "@/stores/locale";

interface Props {
  profile: Profile;
}

const COPY = {
  bn: {
    heading: "প্রোফাইল সম্পাদনা",
    username: "ইউজারনেম",
    displayName: "প্রদর্শনী নাম",
    bio: "নিজের সম্পর্কে",
    bioPlaceholder: "২-৩ লাইনে নিজেকে পরিচয় করান…",
    avatarUrl: "অ্যাভাটার URL",
    save: "সংরক্ষণ করুন",
    saving: "সংরক্ষণ হচ্ছে…",
    success: "প্রোফাইল সংরক্ষিত হয়েছে।",
    error: "সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।",
    usernameHint: "শুধু ছোট হাতের অক্ষর, সংখ্যা ও হাইফেন।",
  },
  en: {
    heading: "Edit profile",
    username: "Username",
    displayName: "Display name",
    bio: "Bio",
    bioPlaceholder: "Introduce yourself in 2-3 lines…",
    avatarUrl: "Avatar URL",
    save: "Save",
    saving: "Saving…",
    success: "Profile saved.",
    error: "Could not save. Please try again.",
    usernameHint: "Lowercase letters, numbers and hyphens only.",
  },
} as const;

const USERNAME_RE = /^[a-z0-9-]{3,30}$/;

export function ProfileForm({ profile }: Props) {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];

  const [username, setUsername] = useState(profile.username ?? "");
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const usernameValid = USERNAME_RE.test(username);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usernameValid) return;

    setStatus("saving");
    setMessage(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        username,
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (error) {
      setStatus("error");
      setMessage(t.error);
      return;
    }

    setStatus("success");
    setMessage(t.success);
    router.refresh();
  }

  const inputClass =
    "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <h2 className="text-lg font-bold">{t.heading}</h2>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pf-username" className="text-xs font-bold opacity-70">
            {t.username}
          </label>
          <input
            id="pf-username"
            type="text"
            dir="ltr"
            required
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase());
              setStatus("idle");
            }}
            className={inputClass}
            aria-invalid={!usernameValid}
            aria-describedby="pf-username-hint"
          />
          <p
            id="pf-username-hint"
            className="text-xs opacity-50"
            style={!usernameValid ? { color: "var(--color-error, #ea4335)" } : undefined}
          >
            {t.usernameHint}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="pf-display-name" className="text-xs font-bold opacity-70">
            {t.displayName}
          </label>
          <input
            id="pf-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-bio" className="text-xs font-bold opacity-70">
          {t.bio}
        </label>
        <textarea
          id="pf-bio"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={t.bioPlaceholder}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-avatar-url" className="text-xs font-bold opacity-70">
          {t.avatarUrl}
        </label>
        <input
          id="pf-avatar-url"
          type="url"
          dir="ltr"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={status === "saving" || !usernameValid}
          className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--md-sys-color-primary)" }}
        >
          {status === "saving" ? t.saving : t.save}
        </button>
        {message && (
          <p
            role="status"
            className="text-sm"
            style={
              status === "error"
                ? { color: "var(--color-error, #ea4335)" }
                : { color: "var(--md-sys-color-secondary)" }
            }
          >
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
