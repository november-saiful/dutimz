"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [query, setQuery] = React.useState("");

  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <header className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <SidebarTrigger aria-label="Toggle navigation" />
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
                  <span className="truncate text-foreground">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
          <h1 className="truncate text-lg font-semibold">{title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <form
            role="search"
            className="hidden items-center md:flex"
            onSubmit={(event) => {
              event.preventDefault();
              if (query.trim())
                router.push(`/search?q=${encodeURIComponent(query.trim())}`);
            }}
          >
            <label htmlFor="dashboard-search" className="sr-only">
              খবর খুঁজুন
            </label>
            <Input
              id="dashboard-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="খবর খুঁজুন…"
              className="h-9 w-44 lg:w-56"
            />
          </form>
          <Button variant="ghost" size="icon" aria-label="Search" asChild>
            <Link href="/search">
              <Search />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Notifications" asChild>
            <Link href="/saved">
              <Bell />
            </Link>
          </Button>
          <Link href="/account" aria-label="আমার অ্যাকাউন্ট">
            <Avatar className="ml-1 size-8">
              <AvatarFallback>ঢা</AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </header>
      {pathname === "/" && breaking.length > 0 && (
        <div className="flex items-center gap-2 overflow-hidden border-t px-4 py-1.5 sm:px-6">
          <Badge className="shrink-0">ব্রেকিং</Badge>
          <div className="flex gap-4 overflow-x-auto text-xs text-muted-foreground">
            {breaking.slice(0, 5).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="truncate hover:text-foreground"
              >
                {item.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
