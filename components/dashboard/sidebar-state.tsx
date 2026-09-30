"use client";

import * as React from "react";

import { SidebarProvider } from "@/components/ui/sidebar";

/**
 * Desktop rail state for every page. The rail is fixed and always expanded —
 * there is nothing to minimize, so no cookie and no toggle state are kept. The
 * provider pins `open`; the mobile drawer's own `openMobile` state still lives
 * inside it, so phones keep the Sheet.
 */
export function SidebarState({ children }: { children: React.ReactNode }) {
  return <SidebarProvider open>{children}</SidebarProvider>;
}
