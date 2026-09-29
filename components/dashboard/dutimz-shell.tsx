import * as React from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { DutimzSidebar } from "@/components/dashboard/dutimz-sidebar";
import {
  DashboardHeader,
  type Crumb,
} from "@/components/dashboard/dashboard-header";

export function DutimzShell({
  title,
  crumbs,
  breaking,
  children,
}: {
  title: string;
  crumbs?: Crumb[];
  breaking?: { href: string; title: string }[];
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <DutimzSidebar />
      {/*
        min-w-0: the inset is a flex item, and a flex item's min-width is `auto`, so it
        refuses to shrink below the min-content width of the widest thing inside it. At
        tablet widths, where the sidebar becomes permanent, that pushed the inset ~23px
        past the viewport and ate the right padding off every card.
      */}
      <SidebarInset className="min-w-0">
        <DashboardHeader title={title} crumbs={crumbs} breaking={breaking} />
        {/*
          min-w-0 again: this main is itself a flex item of the column flex
          container above. Without it, an unbreakable string (e.g. a raw error
          message in a card) sets the min-content width and stretches the whole
          document past the viewport on phones.
        */}
        <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
          {children}
        </main>
        <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
          <p className="font-semibold text-foreground">DUTIMZ</p>
          <p>ঢাকা বিশ্ববিদ্যালয়ের কণ্ঠস্বর</p>
          <nav
            className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1"
            aria-label="প্রয়োজনীয় লিংক"
          >
            <a href="/about/" className="hover:text-foreground">
              আমাদের পরিচয়
            </a>
            <a href="/guidelines/" className="hover:text-foreground">
              সম্পাদকীয় নীতিমালা
            </a>
            <a href="/corrections/" className="hover:text-foreground">
              সংশোধন ও তথ্য যাচাই
            </a>
            <a href="mailto:hello@dutimz.com" className="hover:text-foreground">
              যোগাযোগ
            </a>
          </nav>
          <p className="mt-2">© {new Date().getFullYear()} DUTIMZ</p>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
