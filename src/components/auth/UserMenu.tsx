"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocaleStore } from "@/stores/locale";
import { RoleBadge } from "@/components/auth/RoleBadge";

export interface SessionUser {
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
  role: string;
}

const COPY = {
  bn: {
    profile: "প্রোফাইল",
    signout: "লগআউট",
    openMenu: "ইউজার মেনু",
    reporterDesk: "প্রতিবেদক ডেস্ক",
    moderatorDesk: "পর্যালোচনা কিউ",
  },
  en: {
    profile: "Profile",
    signout: "Log out",
    openMenu: "User menu",
    reporterDesk: "Reporter desk",
    moderatorDesk: "Review queue",
  },
} as const;

const EDITOR_ROLES = ["reporter", "moderator", "admin"];
const MODERATOR_ROLES = ["moderator", "admin"];

/** Avatar + dropdown for signed-in users (rendered inside GlassNavigation). */
export function UserMenu({ user }: { user: SessionUser }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t.openMenu}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/40 transition hover:opacity-80"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            width={36}
            height={36}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-sm font-bold text-white"
            style={{ background: "var(--md-sys-color-primary)" }}
          >
            {(user.displayName ?? user.email).charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="glass-card absolute end-0 top-11 z-50 w-56 p-3 text-start"
        >
          <p className="truncate text-sm font-bold">{user.displayName ?? user.email}</p>
          <p className="truncate text-xs opacity-60" dir="ltr">
            {user.email}
          </p>
          <div className="mt-2">
            <RoleBadge role={user.role} locale={locale} />
          </div>

          <div className="mt-3 flex flex-col gap-1 border-t border-white/20 pt-3">
            {EDITOR_ROLES.includes(user.role) && (
              <Link
                href="/reporter"
                role="menuitem"
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                {t.reporterDesk}
              </Link>
            )}
            {MODERATOR_ROLES.includes(user.role) && (
              <Link
                href="/moderator"
                role="menuitem"
                className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                {t.moderatorDesk}
              </Link>
            )}
            <Link
              href="/profile"
              role="menuitem"
              className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              {t.profile}
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await fetch("/auth/signout", { method: "POST" });
                window.location.href = "/";
              }}
              className="rounded-lg px-3 py-2 text-start text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
            >
              {t.signout}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
