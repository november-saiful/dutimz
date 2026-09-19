"use client";

import { useState, useCallback } from "react";
import { AdminSearchBar } from "@/components/admin/AdminSearchBar";

// Lazy-load panels only when their tab is active
import dynamic from "next/dynamic";

const SiteSettingsPanel = dynamic(() => import("./SiteSettingsPanel").then((m) => m.SiteSettingsPanel), { ssr: false });
const UserManagementPanel = dynamic(() => import("./UserManagementPanel").then((m) => m.UserManagementPanel), { ssr: false });
const CategoryManagerPanel = dynamic(() => import("./CategoryManagerPanel").then((m) => m.CategoryManagerPanel), { ssr: false });
const TagManagerPanel = dynamic(() => import("./TagManagerPanel").then((m) => m.TagManagerPanel), { ssr: false });
const AdManagerPanel = dynamic(() => import("./AdManagerPanel").then((m) => m.AdManagerPanel), { ssr: false });
const PollManagerPanel = dynamic(() => import("./PollManagerPanel").then((m) => m.PollManagerPanel), { ssr: false });
const NewsletterPanel = dynamic(() => import("./NewsletterPanel").then((m) => m.NewsletterPanel), { ssr: false });
const ContentManagerPanel = dynamic(() => import("./ContentManagerPanel").then((m) => m.ContentManagerPanel), { ssr: false });

const TABS = [
  { id: "contents", icon: "📰", label: "সংবাদ" },
  { id: "settings", icon: "⚙️", label: "সাইট সেটিংস" },
  { id: "users", icon: "👥", label: "ব্যবহারকারী" },
  { id: "categories", icon: "📁", label: "বিভাগ" },
  { id: "tags", icon: "🏷️", label: "ট্যাগ" },
  { id: "ads", icon: "📢", label: "বিজ্ঞাপন" },
  { id: "polls", icon: "📊", label: "পোল" },
  { id: "newsletter", icon: "✉️", label: "নিউজলেটার" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const PANELS: Record<TabId, React.ComponentType> = {
  contents: ContentManagerPanel,
  settings: SiteSettingsPanel,
  users: UserManagementPanel,
  categories: CategoryManagerPanel,
  tags: TagManagerPanel,
  ads: AdManagerPanel,
  polls: PollManagerPanel,
  newsletter: NewsletterPanel,
};

export function AdminShell() {

  const [activeTab, setActiveTab] = useState<TabId>("settings");

  const handleNavigate = useCallback((tab: string) => {
    if (TABS.some((t) => t.id === tab)) {
      setActiveTab(tab as TabId);
    }
  }, []);

  const ActivePanel = PANELS[activeTab];

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="flex items-center gap-4">
        <AdminSearchBar onNavigate={handleNavigate} />
      </div>

      {/* Tab bar */}
      <div
        className="sticky top-0 z-20 -mx-1 overflow-x-auto rounded-xl px-1 py-1"
        style={{
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          backdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        <div className="flex gap-1 min-w-max">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "text-white shadow-md"
                    : "text-[var(--md-sys-color-on-surface)] opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                }`}
                style={
                  isActive
                    ? { background: "var(--md-sys-color-primary)" }
                    : undefined
                }
              >
                <span className="text-base">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active panel */}
      <div key={activeTab} style={{ animation: "fadeSlideUp 0.3s ease-out" }}>
        <ActivePanel />
      </div>
    </div>
  );
}
