"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useLocaleStore } from "@/stores/locale";
import { useThemeStore, type ThemeMode } from "@/stores/theme";
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
    darkMode: "ডার্ক মোড",
  },
  en: {
    profile: "Profile",
    signout: "Sign out",
    openMenu: "User menu",
    reporterDesk: "Reporter desk",
    moderatorDesk: "Review queue",
    darkMode: "Dark mode",
  },
} as const;

const EDITOR_ROLES = ["reporter", "moderator", "admin"];
const MODERATOR_ROLES = ["moderator", "admin"];

/** Apply the theme mode to the DOM. */
function applyTheme(mode: ThemeMode) {
  if (typeof window === "undefined") return;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

/** Avatar + Untitled-UI-style dropdown for signed-in users (desktop). */
export function UserMenu({ user }: { user: SessionUser }) {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Theme
  const { mode, setMode } = useThemeStore();
  const isDark = mode === "dark";

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const toggleDark = useCallback(() => {
    setMode(isDark ? "light" : "dark");
  }, [isDark, setMode]);

  // Close on outside click / Escape
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

  const displayName = user.displayName ?? user.email;

  // ── Icons (inline SVGs, consistent with project conventions) ──
  const UserIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    </svg>
  );
  const NewspaperIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" />
    </svg>
  );
  const ShieldIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
  const MoonIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
  const SunIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  );
  const LogoutIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 22H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h5" /><polyline points="17 16 21 12 17 8" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );

  const menuItemClass =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring";

  return (
    <div ref={rootRef} className="relative">
      {/* ── Avatar trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t.openMenu}
        className="group relative inline-flex cursor-pointer rounded-full outline-offset-2 outline-focus-ring transition hover:opacity-80 focus-visible:outline-2"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            width={36}
            height={36}
            referrerPolicy="no-referrer"
            className="h-9 w-9 rounded-full object-cover ring-2 ring-white/40 dark:ring-white/10"
          />
        ) : (
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white ring-2 ring-white/40 dark:ring-white/10"
            style={{ background: "var(--md-sys-color-primary)" }}
          >
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        {/* Online indicator dot */}
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#1a1f2e] bg-green-500" />
      </button>

      {/* ── Dropdown popover ── */}
      {open && (
        <div
          role="menu"
          className="glass-card absolute end-0 top-12 z-50 w-64 overflow-hidden p-0 text-start"
          style={{ animation: "dropdownFadeIn 0.2s ease-out" }}
        >
          {/* Header: avatar + name + email + role */}
          <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3 dark:border-white/10">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                width={40}
                height={40}
                referrerPolicy="no-referrer"
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                style={{ background: "var(--md-sys-color-primary)" }}
              >
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">{displayName}</p>
              <p className="truncate text-xs opacity-60" dir="ltr">{user.email}</p>
              <div className="mt-1">
                <RoleBadge role={user.role} locale={locale} />
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="flex flex-col gap-0.5 p-2">
            <Link
              href="/profile"
              role="menuitem"
              className={menuItemClass}
              onClick={() => setOpen(false)}
            >
              {UserIcon}
              <span>{t.profile}</span>
            </Link>

            {EDITOR_ROLES.includes(user.role) && (
              <Link
                href="/reporter"
                role="menuitem"
                className={menuItemClass}
                onClick={() => setOpen(false)}
              >
                {NewspaperIcon}
                <span>{t.reporterDesk}</span>
              </Link>
            )}

            {MODERATOR_ROLES.includes(user.role) && (
              <Link
                href="/moderator"
                role="menuitem"
                className={menuItemClass}
                onClick={() => setOpen(false)}
              >
                {ShieldIcon}
                <span>{t.moderatorDesk}</span>
              </Link>
            )}

            {/* Theme toggle */}
            <button
              type="button"
              role="menuitem"
              onClick={toggleDark}
              className={menuItemClass}
            >
              {isDark ? SunIcon : MoonIcon}
              <span className="flex-1 text-start">{t.darkMode}</span>
              {/* Toggle switch indicator */}
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  isDark ? "bg-[var(--md-sys-color-primary)]" : "bg-black/15 dark:bg-white/20"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                    isDark ? "translate-x-[18px]" : "translate-x-[3px]"
                  }`}
                />
              </span>
            </button>
          </div>

          {/* Footer: Sign out */}
          <div className="border-t border-black/5 px-2 py-2 dark:border-white/10">
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                await fetch("/auth/signout", { method: "POST" });
                window.location.href = "/";
              }}
              className="flex w-full items-center gap-3 rounded-lg border border-black/8 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-red-50 hover:text-red-600 dark:border-white/10 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              {LogoutIcon}
              <span>{t.signout}</span>
            </button>
          </div>
        </div>
      )}

      {/* Keyframe for dropdown entrance */}
      <style>{`
        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
