import type { Metadata } from "next";

import { SiteMenu } from "@/components/dashboard/site-menu";
import { CATEGORIES } from "@/lib/site";

export const metadata: Metadata = {
  title: "Site menu demo",
  robots: { index: false, follow: false },
};

const DEMO_USER = {
  name: "Ayman Echakar",
  username: "@aymanch-03",
  avatar:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=128&q=80",
  initials: "AE",
};

const HIDDEN_ACTIONS = [
  "status",
  "appearance",
  "upgrade",
  "referrals",
  "download",
  "whats-new",
];

export default function SiteMenuDemoPage() {
  return (
    <div className="grid gap-12 p-6 sm:grid-cols-2">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Signed in
        </h2>
        <div className="flex justify-start rounded-2xl border border-border bg-background p-3">
          <SiteMenu
            sections={CATEGORIES}
            user={DEMO_USER}
            hiddenActions={HIDDEN_ACTIONS}
          />
        </div>
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Signed out
        </h2>
        <div className="flex justify-start rounded-2xl border border-border bg-background p-3">
          <SiteMenu
            sections={CATEGORIES}
            user={null}
            hiddenActions={HIDDEN_ACTIONS}
          />
        </div>
      </div>
    </div>
  );
}
