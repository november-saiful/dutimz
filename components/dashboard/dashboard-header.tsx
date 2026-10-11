"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { SidebarTrigger } from "@/components/ui/sidebar";

export type Crumb = { label: string; href?: string };

export function DashboardHeader({
  title,
  crumbs = [],
  breaking = [],
}: {
  title: string;
  crumbs?: Crumb[];
  breaking?: { href: string; title: string }[];
}) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="sticky top-0 z-10 border-b bg-background">
      <header className="grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {/*
            Phones open the rail as a drawer; on desktop the rail is fixed and
            expanded, so the trigger is only offered where the drawer exists.
          */}
          <SidebarTrigger aria-label="Toggle navigation" className="md:hidden" />
          <div className="min-w-0">
            <nav
              aria-label="অবস্থান"
              className="hidden items-center gap-1 text-xs text-muted-foreground md:flex"
            >
              <Link href="/" className="hover:text-foreground">
                মূলপাতা
              </Link>
              {crumbs.map((crumb) => (
                <React.Fragment key={crumb.label}>
                  <span aria-hidden>›</span>
                  {crumb.href ? (
                    <Link href={crumb.href} className="hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="truncate text-foreground">
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </nav>
            <h1 className="hidden truncate text-lg font-semibold md:block">
              {title}
            </h1>
          </div>
        </div>
        {/*
          The centre track is `auto` between two equal `1fr` tracks, so the mark
          sits at the exact centre of the bar no matter how wide the title or
          the actions grow.
        */}
        <Link
          href="/"
          aria-label="DUTIMZ মূলপাতা"
          className="flex items-center justify-center px-1 sm:px-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dutimz-text-logo.svg"
            alt="DUTIMZ"
            width={120}
            height={35}
            className="h-6 w-auto sm:h-7"
          />
        </Link>
        <div className="flex items-center justify-end gap-1">
          <CommandPalette />
        </div>
      </header>
      {pathname === "/" && breaking.length > 0 && (
        <div className="group flex items-center gap-2 overflow-hidden border-t px-4 py-1.5 sm:px-6">
          <Badge className="shrink-0">ব্রেকিং</Badge>
          {/*
            The track carries the list twice and slides exactly one copy to the
            left, so it can loop forever without a visible jump. Motion stops for
            readers who ask for reduced motion, and pauses while hovered.
          */}
          <div className="relative flex-1 overflow-hidden">
            <div className="ticker-track flex w-max gap-8 whitespace-nowrap text-xs text-muted-foreground">
              {[...breaking.slice(0, 5), ...breaking.slice(0, 5)].map(
                (item, index) => (
                  <Link
                    key={`${item.href}-${index}`}
                    href={item.href}
                    className="hover:text-foreground"
                  >
                    {item.title}
                  </Link>
                ),
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
