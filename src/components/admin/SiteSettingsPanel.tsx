"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useLocaleStore } from "@/stores/locale";
import type { SiteSettings } from "@/lib/data/adminMock";
import { SettingsSkeleton } from "@/components/admin/AdminSkeleton";

const COPY = {
  bn: {
    title: "সাইট সেটিংস",
    siteName: "সাইটের নাম",
    siteTagline: "ট্যাগলাইন",
    logoUrl: "লোগো URL",
    faviconUrl: "ফেভিকন URL",
    primaryColor: "প্রাথমিক রঙ",
    secondaryColor: "সেকেন্ডারি রঙ",
    accentColor: "অ্যাকসেন্ট রঙ",
    socialLinks: "সোশ্যাল লিংক",
    seoDefaults: "SEO ডিফল্ট",
    analyticsId: "Analytics ID",
    maintenanceMode: "মেইনটেন্যান্স মোড",
    maintenanceHint: "সকল ভিজিটরদের মেইনটেন্যান্স নোটিশ দেখাবে",
    save: "সংরক্ষণ করুন",
    saving: "সংরক্ষণ হচ্ছে…",
    saved: "সংরক্ষিত হয়েছে!",
    error: "সংরক্ষণ করা যায়নি।",
    facebook: "Facebook",
    twitter: "Twitter / X",
    youtube: "YouTube",
    instagram: "Instagram",
    metaTitle: "ডিফল্ট Meta Title",
    metaDescription: "ডিফল্ট Meta Description",
    colorPreview: "রঙের পূর্বরূপ",
  },
  en: {
    title: "Site Settings",
    siteName: "Site name",
    siteTagline: "Tagline",
    logoUrl: "Logo URL",
    faviconUrl: "Favicon URL",
    primaryColor: "Primary color",
    secondaryColor: "Secondary color",
    accentColor: "Accent color",
    socialLinks: "Social links",
    seoDefaults: "SEO defaults",
    analyticsId: "Analytics ID",
    maintenanceMode: "Maintenance mode",
    maintenanceHint: "Shows a maintenance notice to all visitors",
    save: "Save changes",
    saving: "Saving…",
    saved: "Saved!",
    error: "Could not save.",
    facebook: "Facebook",
    twitter: "Twitter / X",
    youtube: "YouTube",
    instagram: "Instagram",
    metaTitle: "Default Meta Title",
    metaDescription: "Default Meta Description",
    colorPreview: "Color preview",
  },
} as const;

const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none placeholder:text-neutral-400 focus:border-[var(--md-sys-color-primary)] dark:border-neutral-700 dark:bg-neutral-900";

const labelClass = "text-xs font-bold opacity-70";

export function SiteSettingsPanel() {
  const locale = useLocaleStore((s) => s.locale);
  const t = COPY[locale === "en" ? "en" : "bn"];
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setSettings(d.settings);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  if (loading) return <SettingsSkeleton />;

  if (loadError) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
        <p className="text-sm mb-3" style={{ color: "var(--color-error, #ea4335)" }}>{loadError}</p>
        <button type="button" onClick={fetchSettings} className="rounded-full px-5 py-2 text-xs font-bold text-white" style={{ background: "var(--md-sys-color-primary)" }}>Retry</button>
      </div>
    );
  }

  if (!settings) return <SettingsSkeleton />;

  function update<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setStatus("idle");
  }

  function updateSocial(key: string, value: string) {
    setSettings((prev) =>
      prev ? { ...prev, social_links: { ...prev.social_links, [key]: value } } : prev,
    );
    setStatus("idle");
  }

  function updateSeo(key: string, value: string) {
    setSettings((prev) =>
      prev ? { ...prev, seo_defaults: { ...prev.seo_defaults, [key]: value } } : prev,
    );
    setStatus("idle");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSettings(data.settings);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-6 space-y-8"
      style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
    >
      {/* Basic info */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold">{t.siteName}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t.siteName}</label>
            <input
              type="text"
              value={settings.site_name}
              onChange={(e) => update("site_name", e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t.siteTagline}</label>
            <input
              type="text"
              value={settings.site_tagline ?? ""}
              onChange={(e) => update("site_tagline", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t.logoUrl}</label>
            <input
              type="url"
              dir="ltr"
              value={settings.logo_url ?? ""}
              onChange={(e) => update("logo_url", e.target.value || null)}
              className={inputClass}
              placeholder="https://…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t.faviconUrl}</label>
            <input
              type="url"
              dir="ltr"
              value={settings.favicon_url ?? ""}
              onChange={(e) => update("favicon_url", e.target.value || null)}
              className={inputClass}
              placeholder="https://…"
            />
          </div>
        </div>
      </section>

      {/* Colors */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold">{t.colorPreview}</h3>
        <div className="grid gap-4 grid-cols-3">
          {([
            ["primary_color", t.primaryColor],
            ["secondary_color", t.secondaryColor],
            ["accent_color", t.accentColor],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label className={labelClass}>{label}</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={settings[key]}
                  onChange={(e) => update(key, e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded-lg border-0 p-0"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={settings[key]}
                  onChange={(e) => update(key, e.target.value)}
                  className={inputClass + " flex-1"}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Social links */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold">{t.socialLinks}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["facebook", "twitter", "youtube", "instagram"] as const).map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label className={labelClass}>{t[key]}</label>
              <input
                type="url"
                dir="ltr"
                value={settings.social_links[key] ?? ""}
                onChange={(e) => updateSocial(key, e.target.value)}
                className={inputClass}
                placeholder="https://…"
              />
            </div>
          ))}
        </div>
      </section>

      {/* SEO */}
      <section className="space-y-4">
        <h3 className="text-sm font-bold">{t.seoDefaults}</h3>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t.metaTitle}</label>
            <input
              type="text"
              value={settings.seo_defaults.meta_title ?? ""}
              onChange={(e) => updateSeo("meta_title", e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t.metaDescription}</label>
            <textarea
              rows={2}
              value={settings.seo_defaults.meta_description ?? ""}
              onChange={(e) => updateSeo("meta_description", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* Analytics + Maintenance */}
      <section className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>{t.analyticsId}</label>
          <input
            type="text"
            dir="ltr"
            value={settings.analytics_id ?? ""}
            onChange={(e) => update("analytics_id", e.target.value || null)}
            className={inputClass}
            placeholder="G-XXXXXXXXXX"
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => update("maintenance_mode", !settings.maintenance_mode)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              settings.maintenance_mode
                ? "bg-[var(--color-error, #ea4335)]"
                : "bg-black/15 dark:bg-white/20"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                settings.maintenance_mode ? "translate-x-[22px]" : "translate-x-[4px]"
              }`}
            />
          </button>
          <div>
            <span className="text-sm font-medium">{t.maintenanceMode}</span>
            <p className="text-xs opacity-50">{t.maintenanceHint}</p>
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-80 disabled:opacity-50"
          style={{ background: "var(--md-sys-color-primary)" }}
        >
          {status === "saving" ? t.saving : t.save}
        </button>
        {status === "saved" && (
          <span className="text-sm" style={{ color: "var(--md-sys-color-secondary)" }}>
            {t.saved}
          </span>
        )}
        {status === "error" && (
          <span className="text-sm" style={{ color: "var(--color-error, #ea4335)" }}>
            {t.error}
          </span>
        )}
      </div>
    </form>
  );
}
