"use client";

import * as React from "react";

import { SidebarProvider } from "@/components/ui/sidebar";

const SIDEBAR_COOKIE_NAME = "sidebar_state";

function readSidebarCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((part) => part === `${SIDEBAR_COOKIE_NAME}=true`);
}

/**
 * Desktop sidebar state for every page. The rail is the default: the first
 * paint always matches the server (minimized), and an effect restores an
 * expanded sidebar from the cookie the provider writes on every toggle. The
 * restore is a plain update rather than an initial value, so the first paint
 * can never disagree with the server HTML. The cookie is path-scoped to /,
 * so the preference holds across all pages for a week.
 */
export function SidebarState({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (readSidebarCookie()) setOpen(true);
  }, []);
  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      {children}
    </SidebarProvider>
  );
}
