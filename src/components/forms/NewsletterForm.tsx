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
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), locale }),
      });
      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
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
        className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition-colors hover:opacity-80"
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
