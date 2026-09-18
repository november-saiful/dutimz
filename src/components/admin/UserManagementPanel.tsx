"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocaleStore } from "@/stores/locale";
import type { Profile } from "@/types";
import { TableSkeleton } from "@/components/admin/AdminSkeleton";

const COPY = {
  bn: {
    title: "ব্যবহারকারী পরিচালনা",
    searchPlaceholder: "ইউজারনেম, ইমেইল বা নাম খুঁজুন…",
    filterAll: "সব",
    visitor: "ভিজিটর",
    reporter: "প্রতিবেদক",
    moderator: "সম্পাদক",
    admin: "অ্যাডমিন",
    verified: "যাচাইকৃত",
    unverified: "অনির্ধারিত",
    joined: "যোগদান",
    role: "ভূমিকা",
    actions: "কার্যক্রম",
    changeRole: "ভূমিকা পরিবর্তন",
    toggleVerified: "যাচাইকরণ টগল",
    confirmRole: "ভূমিকা পরিবর্তন করবেন?",
    users: "ব্যবহারকারী",
    total: "মোট",
    page: "পৃষ্ঠা",
    prev: "আগের",
    next: "পরের",
    success: "আপডেট হয়েছে!",
    error: "আপডেট করা যায়নি।",
  },
  en: {
    title: "User Management",
    searchPlaceholder: "Search username, email, or name…",
    filterAll: "All",
    visitor: "Visitor",
    reporter: "Reporter",
    moderator: "Moderator",
    admin: "Admin",
    verified: "Verified",
    unverified: "Unverified",
    joined: "Joined",
    role: "Role",
    actions: "Actions",
    changeRole: "Change role",
    toggleVerified: "Toggle verified",
    confirmRole: "Change role?",
    users: "Users",
    total: "Total",
    page: "Page",
    prev: "Previous",
    next: "Next",
    success: "Updated!",
    error: "Update failed.",
  },
} as const;

const ROLES = ["visitor", "reporter", "moderator", "admin"] as const;
const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900";

export function UserManagementPanel() {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const [users, setUsers] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (roleFilter) params.set("role", roleFilter);
    params.set("page", String(page));
    try {
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, role: newRole }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("success");
      fetchUsers();
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  async function handleToggleVerified(userId: string, current: boolean) {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, is_verified: !current }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("success");
      fetchUsers();
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "#5f2367",
      moderator: "#a370a0",
      reporter: "#34a853",
      visitor: "#888",
    };
    return (
      <span
        className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white"
        style={{ background: colors[role] ?? "#888" }}
      >
        {t[role as keyof typeof t] ?? role}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-6 space-y-4" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
        <h3 className="text-sm font-bold">{t.title}</h3>

        {/* Search + filter */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t.searchPlaceholder}
            className={inputClass + " sm:w-64"}
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => { setRoleFilter(""); setPage(1); }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${!roleFilter ? "text-white" : "opacity-50 hover:opacity-100"}`}
              style={!roleFilter ? { background: "var(--md-sys-color-primary)" } : undefined}
            >
              {t.filterAll}
            </button>
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { setRoleFilter(r); setPage(1); }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${roleFilter === r ? "text-white" : "opacity-50 hover:opacity-100"}`}
                style={roleFilter === r ? { background: "var(--md-sys-color-primary)" } : undefined}
              >
                {t[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Error state */}
        {loadError && !loading && (
          <div className="rounded-lg p-4 text-center space-y-2" style={{ background: "rgba(234,67,53,0.05)" }}>
            <p className="text-xs" style={{ color: "var(--color-error, #ea4335)" }}>{loadError}</p>
            <button type="button" onClick={fetchUsers} className="text-xs font-bold" style={{ color: "var(--md-sys-color-primary)" }}>Retry</button>
          </div>
        )}

        {/* User list */}
        <div className="overflow-x-auto">
          {loading && (
            <div className="space-y-2 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-3" style={{ borderBottom: "1px solid var(--glass-border)" }}>
                  <div className="skeleton h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5"><div className="skeleton h-3.5 w-3/4" /><div className="skeleton h-2.5 w-1/3" /></div>
                  <div className="skeleton h-5 w-16 rounded-full shrink-0" />
                  <div className="skeleton h-6 w-20 rounded-lg shrink-0" />
                </div>
              ))}
            </div>
          )}
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b opacity-50" style={{ borderColor: "var(--glass-border)" }}>
                <th className="pb-2 font-medium">{t.users}</th>
                <th className="pb-2 font-medium hidden sm:table-cell">Email</th>
                <th className="pb-2 font-medium">{t.role}</th>
                <th className="pb-2 font-medium hidden md:table-cell">{t.joined}</th>
                <th className="pb-2 font-medium text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b" style={{ borderColor: "var(--glass-border)" }}>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "var(--md-sys-color-primary)" }}>
                        {(user.display_name ?? user.username).charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[160px]">{user.display_name ?? user.username}</p>
                        <p className="text-[10px] opacity-50">@{user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-xs opacity-60 hidden sm:table-cell truncate max-w-[200px]" dir="ltr">{user.email}</td>
                  <td className="py-3">{roleBadge(user.role)}</td>
                  <td className="py-3 text-xs opacity-50 hidden md:table-cell">
                    {new Date(user.created_at).toLocaleDateString(locale === "bn" ? "bn-BD" : "en-US")}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* Role selector */}
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{t[r]}</option>
                        ))}
                      </select>
                      {/* Verified toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleVerified(user.id, user.is_verified)}
                        className={`rounded-full px-2 py-1 text-[10px] font-bold transition ${
                          user.is_verified ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
                        }`}
                      >
                        {user.is_verified ? t.verified : t.unverified}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm opacity-50">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs opacity-60">
          <span>{t.total}: {total}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg px-3 py-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
            >
              {t.prev}
            </button>
            <span>{t.page} {page}/{totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg px-3 py-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
            >
              {t.next}
            </button>
          </div>
        </div>
      </div>

      {/* Status toast */}
      {status !== "idle" && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg"
          style={{ background: status === "success" ? "#34a853" : "#ea4335" }}
        >
          {status === "success" ? t.success : t.error}
        </div>
      )}
    </div>
  );
}
