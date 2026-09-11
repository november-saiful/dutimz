"use client";

import { useState, type FormEvent } from "react";
import { translate } from "@/lib/i18n/dictionary";
import { useLocaleStore } from "@/stores/locale";
import { isValidEmail } from "@/lib/utils/format";

export function NewsletterForm() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setStatus("error");
      return;
    }
    // Phase 4 will POST to /api/newsletter/subscribe.
    setStatus("success");
    setEmail("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
      <label htmlFor="newsletter-email" className="sr-only">
        {t("newsletter.emailPlaceholder")}
      </label>
      <input
        id="newsletter-email"
        type="email"
        dir="ltr"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setStatus("idle");
        }}
        placeholder={t("newsletter.emailPlaceholder")}
        className="flex-1 rounded-full border border-white/40 bg-white/60 px-4 py-2.5 text-sm outline-none placeholder:opacity-50 focus:border-primary dark:bg-black/40"
      />
      <button
        type="submit"
        className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition-colors hover:opacity-90"
        style={{ background: "var(--md-sys-color-primary)" }}
      >
        {t("newsletter.subscribe")}
      </button>
      {status === "success" && (
        <p role="status" className="text-sm" style={{ color: "var(--md-sys-color-secondary)" }}>
          {t("newsletter.success")}
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-error)" }}>
          {t("newsletter.invalidEmail")}
        </p>
      )}
    </form>
  );
}
