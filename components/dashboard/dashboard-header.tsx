"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Bell, BellRing, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PAGES, SiteMenu } from "@/components/dashboard/site-menu";
import { DuSignupNotice } from "@/components/dashboard/du-signup-notice";
import { useDuEmailPolicy } from "@/components/auth/du-email-policy";
import { PushBell } from "@/components/push/PushBell";
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
 * The site's chrome. On a wide screen it is the attached newspaper masthead:
 * a thin utility row (search, date, saved, notifications, account, write), the
 * wordmark set large and centred, and a ruled row of the live desks followed by
 * the site's own pages — navigation, not a client-side filter. The same desks
 * live in the menu and the footer, so a retired section leaves all three at
 * once.
 *
 * On a phone the masthead drops out and the bar keeps its search button, bell
 * and menu; the four reader destinations live in the dock. The menus are one
 * surface either way: the panel drops from its trigger and closes on any
 * navigation.
 */
export function DashboardHeader({
  sections,
  today,
  deckGlass = false,
  heroGlass = false,
}: {
  sections: { slug: string; label: string }[];
  /** The date the paper is dated: formatted on the server so hydration agrees. */
  today: string;
  /**
   * An immersive phone deck (the flipps feeds) scrolls its picture under the bar:
   * the bar then draws as a translucent glass pane instead of solid paper. Below
   * the dock breakpoint only; the wide layout is unchanged.
   */
  deckGlass?: boolean;
  /**
   * The front page's lead runs under the bar, so the bar is clear while the
   * hero's foot is still below it and returns to paper once it has passed.
   */
  heroGlass?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const headerRef = React.useRef<HTMLElement>(null);
  // Starts from the server's answer (`heroGlass`), so the first paint over the
  // hero is already clear rather than flashing a white bar over the picture.
  const [overHero, setOverHero] = React.useState(heroGlass);
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
  const { policyDialog, gated } = useDuEmailPolicy();

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

  // The phone search is a popup over the bar, and it closes on any navigation,
  // including the reader's own back button. The menu closes itself the same way.
  React.useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  /*
    The front page's lead picture starts under the bar. The bar is clear only
    while that picture is beneath it: once the lead's foot rises past the bar's
    own height, the paper sheet is the surface underneath and the bar wears its
    usual white glass again. The measurement is taken on scroll rather than
    against a fixed offset, so a phone's changing viewport cannot shift the line.
  */
  React.useEffect(() => {
    if (!heroGlass) {
      setOverHero(false);
      return;
    }
    const bar = headerRef.current;
    const hero = document.querySelector<HTMLElement>("[data-hero-under-bar]");
    if (!bar || !hero) {
      setOverHero(false);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      setOverHero(hero.getBoundingClientRect().bottom > bar.offsetHeight);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [heroGlass, pathname]);

  // Google is the only provider and there is no sign-in page, so both the menu's
  // sign-in button and its session-only rows start the OAuth flow directly. The
  // first attempt of a session is held behind the DU-email policy dialog.
  function startGoogleSignIn() {
    gated(() => {
      rememberReturnPath();
      void signInWithGoogle().then(({ error }) => {
        if (error) reportError("google sign-in", error);
      });
    });
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
      startGoogleSignIn();
      return;
    }

    // Switch account ends the session and immediately re-opens the account
    // picker, so the reader chooses another identity in one step.
    if (action === "switch") {
      await signOut();
      startGoogleSignIn();
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
    // and the handler cannot drift apart.
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
    <>
      <DuSignupNotice />
      {policyDialog}
      {/*
        The wide edition's masthead, in the attached design's shape: the
        utility strip, the large centred wordmark, then the ruled desk row.
        It scrolls with the page — a newspaper's masthead is not sticky — and
        the phone bar below takes over under the wide breakpoint.
      */}
      <header className="print-header">
        <div className="print-container">
          <div className="print-utility">
            <div className="print-utility-left">
              <button
                type="button"
                className="print-icon"
                aria-label="খুঁজুন"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={16} strokeWidth={2} aria-hidden />
              </button>
              <span className="print-date">{today}</span>
              <Link href="/news/" className="print-toplink">
                আজকের সংবাদ
              </Link>
            </div>
            <div className="print-utility-right">
              <Link href="/saved/" className="print-toplink">
                সংরক্ষিত
              </Link>
              <span className="print-lang" title="বাংলা সংস্করণ">
                বাংলা
              </span>
              <PushBell
                renderTrigger={({ open, toggle, subscribed }) => {
                  const Icon = subscribed ? BellRing : Bell;
                  return (
                    <button
                      type="button"
                      className="print-icon"
                      aria-label="বিজ্ঞপ্তি"
                      aria-expanded={open}
                      onClick={toggle}
                    >
                      <Icon size={16} strokeWidth={2} aria-hidden />
                      {subscribed && <i className="print-icon-dot" aria-hidden />}
                    </button>
                  );
                }}
              />
              <SiteMenu
                sections={sections}
                user={menuUser}
                onAction={handleMenuAction}
                hiddenActions={HIDDEN_MENU_ACTIONS}
                renderTrigger={({ open, toggle }) => (
                  <button
                    type="button"
                    className="print-login"
                    aria-expanded={open}
                    aria-haspopup="dialog"
                    onClick={toggle}
                  >
                    {menuUser ? menuUser.name : "লগ ইন"}
                  </button>
                )}
              />
              <Link href="/account/write/" className="print-write">
                লিখুন
              </Link>
            </div>
          </div>

          <div className="print-masthead">
            <Link href="/" aria-label="DUTIMZ মূলপাতা">
              {/* The lockup the bar already uses, drawn as the masthead. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/dutimz-text-logo.svg" alt="DUTIMZ" width={1278} height={372} />
            </Link>
          </div>

          <nav className="print-nav" aria-label="সংবাদ বিভাগ">
            {sections
              .filter((section) => section.slug !== "all")
              .map((section) => {
                const href = `/category/${section.slug}/`;
                const current = pathname.startsWith(href);
                return (
                  <Link
                    key={section.slug}
                    href={href}
                    className="print-nav-link"
                    aria-current={current ? "page" : undefined}
                  >
                    {section.label}
                  </Link>
                );
              })}
            <span className="print-nav-rule" aria-hidden />
            {PAGES.map((page) => {
              const current = pathname === page.href || pathname.startsWith(page.href);
              return (
                <Link
                  key={page.key}
                  href={page.href}
                  className="print-nav-link"
                  aria-current={current ? "page" : undefined}
                >
                  {page.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <header
        ref={headerRef}
        className="topbar"
        data-deck-glass={deckGlass || undefined}
        data-hero-glass={overHero || undefined}
      >
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

        <div className="top-actions">
          {/*
            The site publishes in Bengali only, so the language indicator is a
            static chip until a second edition exists — no chevron, because there
            is no menu to open.
          */}
          <span
            className="lang"
            aria-label="বাংলা সংস্করণ"
            title="বাংলা সংস্করণ"
          >
            বাং
          </span>

          {/*
            The phone's search. A bar this narrow cannot hold a field beside the
            mark, the bell and the menu, so the button raises the site's own
            sheet from the top. The wide masthead's search button opens the
            same sheet, so the two widths share one search surface.
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

          {/*
            The phone's controls. The wide masthead carries its own search,
            bell and account triggers, so this group belongs to the phone bar
            alone.
          */}
          <div className="phone-actions">
            {/* Push opt-in bell: topic picker + welcome sample, works signed-out. */}
            <PushBell />
            <SiteMenu
              sections={sections}
              user={menuUser}
              onAction={handleMenuAction}
              hiddenActions={HIDDEN_MENU_ACTIONS}
            />
          </div>
        </div>
      </div>
    </header>
    </>
  );
}
