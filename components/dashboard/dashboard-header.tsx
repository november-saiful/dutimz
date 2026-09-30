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
import { UserDropdown } from "@/components/ui/user-dropdown";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase";

export type Crumb = { label: string; href?: string };

type HeaderUser = {
  name: string;
  username: string;
  avatar?: string;
  initials: string;
};

/**
 * Menu entries with no DUTIMZ destination stay out of the header menu: there is
 * no presence system behind "status", no theming behind "appearance", and no
 * premium tier, referral programme, native app or changelog behind the
 * upsell/support entries. What remains maps to a real route in handleMenuAction.
 */
const HIDDEN_MENU_ACTIONS = [
  "status",
  "appearance",
  "upgrade",
  "referrals",
  "download",
  "whats-new",
];

function initialsFor(name: string): string {
  const parts = name
    .replace(/^@/, "")
    .split(/[\s_.-]+/)
    .filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "প";
  const second = parts.length > 1 ? (parts[1]?.charAt(0) ?? "") : "";
  return `${first}${second}`.toUpperCase();
}

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
  // undefined while the session is being resolved, null when signed out: both
  // render the plain account link so the header never shifts shape on load.
  const [menuUser, setMenuUser] = React.useState<HeaderUser | null | undefined>(
    undefined,
  );

  React.useEffect(() => {
    /*
      Demo builds and pull-request previews run without Supabase credentials,
      and supabaseBrowser() throws in that case rather than handing back a dead
      client. Unguarded, that throw reaches the error boundary and replaces the
      rendered page with Next's error document — so every preview of the site
      showed a blank error page while the deploy itself reported success.
    */
    if (!isSupabaseConfigured()) {
      setMenuUser(null);
      return;
    }
    let cancelled = false;
    const supabase = supabaseBrowser();

    async function loadUser(userId: string | null, meta: Record<string, unknown>) {
      if (!userId) {
        if (!cancelled) setMenuUser(null);
        return;
      }
      try {
        const { data } = await supabase
          .from("profiles")
          .select("username,display_name,avatar_url")
          .eq("id", userId)
          .maybeSingle();
        if (cancelled) return;
        const profile = data as {
          username?: string;
          display_name?: string;
          avatar_url?: string | null;
        } | null;
        const name = String(
          profile?.display_name ||
            meta.full_name ||
            meta.name ||
            (typeof meta.email === "string" ? meta.email.split("@")[0] : "") ||
            "পাঠক",
        );
        const avatar =
          profile?.avatar_url ||
          (typeof meta.avatar_url === "string" ? meta.avatar_url : "") ||
          (typeof meta.picture === "string" ? meta.picture : "") ||
          undefined;
        setMenuUser({
          name,
          username: `@${profile?.username ?? ""}`,
          avatar,
          initials: initialsFor(name),
        });
      } catch {
        if (!cancelled) setMenuUser(null);
      }
    }

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled)
          await loadUser(user?.id ?? null, (user?.user_metadata ?? {}) as Record<string, unknown>);
      } catch {
        if (!cancelled) setMenuUser(null);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadUser(
        session?.user?.id ?? null,
        (session?.user?.user_metadata ?? {}) as Record<string, unknown>,
      );
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function handleMenuAction(action?: string) {
    switch (action) {
      case "profile":
        router.push("/profile/me/");
        break;
      case "settings":
        router.push("/account/");
        break;
      case "notifications":
        router.push("/saved/");
        break;
      case "help":
        router.push("/about/");
        break;
      case "switch":
      case "logout": {
        try {
          await supabaseBrowser().auth.signOut();
        } catch {
          // Signed out as far as the UI is concerned either way.
        }
        setMenuUser(null);
        // "Switch account" lands on sign-in, whose Google button uses
        // prompt=select_account, so the reader can pick another identity.
        router.push(action === "switch" ? "/auth/sign-in/" : "/");
        router.refresh();
        break;
      }
      default:
        break;
    }
  }

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
          {menuUser ? (
            <UserDropdown
              user={{ ...menuUser, status: "online" }}
              onAction={handleMenuAction}
              hiddenActions={HIDDEN_MENU_ACTIONS}
            />
          ) : (
            <Link href="/account" aria-label="আমার অ্যাকাউন্ট">
              <Avatar className="ml-1 size-8">
                <AvatarFallback>ঢা</AvatarFallback>
              </Avatar>
            </Link>
          )}
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
