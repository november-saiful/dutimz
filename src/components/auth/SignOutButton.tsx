"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignOutButton({ label = "লগআউট / Log out" }: { label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    await fetch("/auth/signout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={busy}
      className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-bold transition hover:bg-black/5 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-white/10"
    >
      {busy ? "…" : label}
    </button>
  );
}
