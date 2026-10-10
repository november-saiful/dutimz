"use client";

import * as React from "react";

/**
 * The footer's subscription box. There is no newsletter service behind the
 * site yet, so submitting opens a pre-filled mail to the desk — a real,
 * working action rather than a form that silently swallows the address.
 */
export function SubscribeForm() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    const subject = encodeURIComponent("সাবস্ক্রিপশনের অনুরোধ");
    const body = encodeURIComponent(`আমার ইমেইল: ${address}`);
    window.location.href = `mailto:hello@dutimz.com?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <form className="sub-form" onSubmit={submit}>
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="আপনার ইমেইল"
        aria-label="ইমেইল"
        required
      />
      <button type="submit" className="go" aria-label="সাবস্ক্রাইব করুন">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
      {sent && (
        <span role="status" className="sr-only">
          ইমেইল অ্যাপে সাবস্ক্রিপশনের বার্তা খোলা হয়েছে।
        </span>
      )}
    </form>
  );
}
