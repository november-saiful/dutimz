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
 * Desktop sidebar state for every page. The rail is the default: minimized
 * unless the reader expanded it. The provider writes the same cookie on every
 * toggle (see SidebarProvider), so reading it back here remembers an expanded
 * sidebar across all pages for a week.
 */
export function SidebarState({ children }: { children: React.ReactNode }) {
  const [defaultOpen] = React.useState(readSidebarCookie);
  return <SidebarProvider defaultOpen={defaultOpen}>{children}</SidebarProvider>;
}
