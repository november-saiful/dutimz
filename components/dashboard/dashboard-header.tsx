"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { UserDropdown } from "@/components/ui/user-dropdown";
import {
  ACCOUNT_HIDDEN_ACTIONS,
  ACCOUNT_ROUTES,
  ACCOUNT_SIGN_OUT_ROUTES,
} from "@/lib/account-menu";
import {
  consumeReturnPath,
  rememberReturnPath,
  signInWithGoogle,
} from "@/lib/auth-client";
import { reportError } from "@/lib/errors";
import { isMissingSession, isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase";

export type Crumb = { label: string; href?: string };

type HeaderUser = {
  name: string;
  username: string;
  avatar?: string;
  initials: string;
};

/**
 * Entries with no destination for this site are hidden. The list lives with the
 * route table so the menu, the handler and this host stay in step: adding a
 * route there is enough to make an entry live here.
 */
const HIDDEN_MENU_ACTIONS: string[] = [...ACCOUNT_HIDDEN_ACTIONS];

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
  // undefined while the session is being resolved, null when signed out. Both
  // render the account menu in its signed-out shape, so the header never shifts
  // on load and a visitor always has the menu (and can sign in from it).
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
        const { data, error } = await supabase
          .from("profiles")
          .select("username,display_name,avatar_url")
          .eq("id", userId)
          .maybeSingle();
        if (error) reportError("header profile", error);
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
      } catch (err) {
        reportError("header profile", err);
        if (!cancelled) setMenuUser(null);
      }
    }

    (async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          reportError("header session", error);
          // A dropped connection is not a sign-out. Only a genuinely absent session may clear the
          // menu; anything else leaves whatever the reader already sees in place.
          if (!isMissingSession(error)) return;
        }
        if (!cancelled)
          await loadUser(user?.id ?? null, (user?.user_metadata ?? {}) as Record<string, unknown>);
      } catch (err) {
        reportError("header session", err);
        if (!cancelled) setMenuUser(null);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadUser(
        session?.user?.id ?? null,
        (session?.user?.user_metadata ?? {}) as Record<string, unknown>,
      ).catch((err) => reportError("header profile refresh", err));
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  /*
    Returning from Google: the callback lands on the homepage, so the page the
    reader left is restored here, once the session has actually been resolved.
    The value is consumed (not merely read), so a cancelled attempt cannot send
    a later visit somewhere unexpected.
  */
  React.useEffect(() => {
    if (!menuUser) return;
    const target = consumeReturnPath();
    if (target && target !== pathname) router.replace(target);
  }, [menuUser, pathname, router]);

  // Google is the only provider and there is no sign-in page, so both the menu's
  // sign-in button and its session-only rows start the OAuth flow directly.
  async function startGoogleSignIn() {
    rememberReturnPath();
    const { error } = await signInWithGoogle();
    if (error) reportError("google sign-in", error);
  }

  async function signOut() {
    try {
      const { error } = await supabaseBrowser().auth.signOut();
      if (error) reportError("sign out", error);
    } catch (err) {
      // Signed out as far as the UI is concerned either way.
      reportError("sign out", err);
    }
    setMenuUser(null);
  }

  async function handleMenuAction(action?: string) {
    if (!action) return;

    if (action === "sign-in") {
      await startGoogleSignIn();
      return;
    }

    // Switch account ends the session and immediately re-opens the account
    // picker, so the reader chooses another identity in one step.
    if (action === "switch") {
      await signOut();
      await startGoogleSignIn();
      return;
    }

    // Sign-out actions end the session first, then land on their route.
    if (action in ACCOUNT_SIGN_OUT_ROUTES) {
      await signOut();
      router.push((ACCOUNT_SIGN_OUT_ROUTES as Record<string, string>)[action]);
      router.refresh();
      return;
    }

    // The public profile is the signed-in member's own handle, which the menu
    // already resolved when it loaded the profile.
    if (action === "my-profile") {
      const handle = menuUser?.username.replace(/^@/, "");
      if (handle) router.push(`/u/${encodeURIComponent(handle)}/`);
      return;
    }

    // Every remaining entry is a plain route from the shared table, so the menu
    // and the handler cannot drift apart. Sections are not in the menu — the
    // sidebar owns them — so there is no slug-shaped action left to resolve.
    const href = (ACCOUNT_ROUTES as Record<string, string>)[action];

    if (href) router.push(href);
  }

  return (
    <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
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
          the actions grow. The same wordmark is used at every width: because the
          page title is desktop-only, the text logo, the drawer trigger and the
          three controls fit a 360px bar.
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
          {/*
            The account menu is always present: signed-out visitors get a
            sign-in call to action inside it instead of a bare avatar that
            dropped them on a page they could not use.
          */}
          <UserDropdown
            user={menuUser ? { ...menuUser, status: "online" } : null}
            onAction={handleMenuAction}
            hiddenActions={HIDDEN_MENU_ACTIONS}
          />
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
