import type { Metadata } from "next";

import { UserDropdown } from "@/components/ui/user-dropdown";

export const metadata: Metadata = {
  title: "User dropdown demo",
  robots: { index: false, follow: false },
};

export default function UserDropdownDemoPage() {
  return (
    <div className="flex min-h-[50vh] items-start justify-end p-6">
      <UserDropdown />
    </div>
  );
}
