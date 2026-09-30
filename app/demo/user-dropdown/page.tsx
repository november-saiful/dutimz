import type { Metadata } from "next";

import { UserDropdown } from "@/components/ui/user-dropdown";

export const metadata: Metadata = {
  title: "User dropdown demo",
  robots: { index: false, follow: false },
};

const DEMO_USER = {
  name: "Ayman Echakar",
  username: "@aymanch-03",
  avatar:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=128&q=80",
  initials: "AE",
  status: "online",
};

const HIDDEN_ACTIONS = [
  "status",
  "appearance",
  "upgrade",
  "referrals",
  "download",
  "whats-new",
];

export default function UserDropdownDemoPage() {
  return (
    <div className="grid gap-12 p-6 sm:grid-cols-2">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Signed in</h2>
        <div className="flex justify-start">
          <UserDropdown user={DEMO_USER} hiddenActions={HIDDEN_ACTIONS} />
        </div>
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Signed out</h2>
        <div className="flex justify-start">
          <UserDropdown user={null} hiddenActions={HIDDEN_ACTIONS} />
        </div>
      </div>
    </div>
  );
}
