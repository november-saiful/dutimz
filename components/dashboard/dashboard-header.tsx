"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

/**
 * The site's top bar, in the reference design's shape: the mark on the left,
 * the section pills beside it, and the language chip, search field, account
 * menu and phone burger on the right. The section pills are the real desks from
 * the database, so a retired desk disappears from the bar on its own.
 */
export function DashboardHeader({
  sections,
}: {
  sections: { slug: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // The phone's search field lives in a popup this button raises; both fields
  // write the same `query`, so switching widths never strands a half-typed term.
  const [searchOpen, setSearchOpen] = React.useState(false);
  const searchInput = React.useRef<HTMLInputElement>(null);
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

  // The phone menu is a disclosure over the section pills and the phone search is
  // a popup over the bar; both close on any navigation, including the reader's
  // own back button.
  React.useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

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
    // and the handler cannot drift apart. The section bar owns the desks.
    const href = (ACCOUNT_ROUTES as Record<string, string>)[action];

    if (href) router.push(href);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    // The popup closes on its own when the route changes; closing here too means
    // a search that lands on the page the reader is already on still dismisses it.
    setSearchOpen(false);
    router.push(trimmed ? `/search/?q=${encodeURIComponent(trimmed)}` : "/search/");
  }

  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="logo" aria-label="DUTIMZ মূলপাতা">
          {/*
            One file carries the lockup: the mark and the wordmark are drawn
            together in `public/dutimz-text-logo.svg`, so the bar shows the brand
            as it was designed instead of a tile and a typed word that only
            happened to sit next to each other.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/dutimz-text-logo.svg" alt="" width={1278} height={372} />
        </Link>

        <nav
          id="site-nav"
          className={`nav${menuOpen ? " open" : ""}`}
          aria-label="বিভাগ"
        >
          {sections.map((section) => {
            const href =
              section.slug === "all" ? "/" : `/category/${section.slug}/`;
            const active =
              section.slug === "all"
                ? pathname === "/"
                : pathname.startsWith(`/category/${section.slug}`);
            return (
              <Link
                key={section.slug}
                href={href}
                className={`pill${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>

        <div className="top-actions">
          {/*
            The site publishes in Bengali only, so the language control is shown
            but disabled until a second edition exists — an honest "coming soon"
            rather than a menu that switches nothing.
          */}
          <button
            type="button"
            className="lang"
            disabled
            aria-label="বাংলা (শীঘ্রই আসছে)"
            title="শীঘ্রই আসছে"
          >
            বাং
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {/*
            The phone's search. A bar this narrow cannot hold a field beside the
            mark, the account menu and the burger, so the field is raised on
            demand: the button opens the site's own sheet from the top with the
            same form the wide bar shows inline.
          */}
          <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
            <SheetTrigger asChild>
              <button type="button" className="search-toggle" aria-label="খুঁজুন">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="M16.5 16.5L21 21" />
                </svg>
              </button>
            </SheetTrigger>
            <SheetContent
              side="top"
              // Above the sticky top bar (60) and the phone's nav drawer (70): the
              // popup drops over the bar it belongs to, and its scrim covers the
              // bar with everything else.
              overlayClassName="z-[80]"
              className="z-[80] gap-3 rounded-b-2xl p-4 pt-5 sm:p-6"
              // Radix would focus the first focusable node; the field is the
              // point of the popup, so it takes the caret (and the keyboard).
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                searchInput.current?.focus();
              }}
            >
              <SheetHeader className="text-left">
                <SheetTitle className="text-sm font-bold">
                  সংবাদ খুঁজুন
                </SheetTitle>
              </SheetHeader>
              <form role="search" className="flex items-center gap-2" onSubmit={submitSearch}>
                <Input
                  ref={searchInput}
                  type="text"
                  name="q"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="প্রতিবেদন, বিষয়, বিভাগ..."
                  aria-label="খুঁজুন"
                  autoComplete="off"
                  enterKeyHint="search"
                  className="h-11 rounded-xl border-input"
                />
                <Button type="submit" size="lg" className="h-11 rounded-xl px-5">
                  খুঁজুন
                </Button>
              </form>
            </SheetContent>
          </Sheet>

          <form className="search" role="search" onSubmit={submitSearch}>
            <input
              type="text"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="প্রতিবেদন, বিষয়, বিভাগ..."
              aria-label="খুঁজুন"
            />
            <button type="submit" aria-label="খুঁজুন">
              <svg viewBox="0 0 24 24" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M16.5 16.5L21 21" />
              </svg>
            </button>
          </form>

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

          <button
            type="button"
            className="burger"
            aria-label="মেনু"
            aria-expanded={menuOpen}
            aria-controls="site-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
