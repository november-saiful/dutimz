"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  Bookmark,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  X,
  type LucideIcon,
} from "lucide-react";

import { SignInButton } from "@/components/auth/sign-in-button";
import { flagIconFor } from "@/components/dashboard/flag";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { type AccountMenuActionId } from "@/lib/account-menu";

/*
  The site's one menu: the button at the right of the top bar opens a panel that
  carries the desks, the account and the reader's saved stories together — in both
  session states, because bookmarks are content rather than an account surface.

  It was two controls — a burger that disclosed the section pills on a phone and
  a separate avatar dropdown for the member's own surfaces — so a reader had to
  know which of the two held what they wanted, and "সংরক্ষিত কনটেন্ট" was drawn
  twice in two vocabularies.  They are one menu now, in the reference design's shape: a solid panel over a dimmed
  page, the desks under their own label, the account under its own, and whoever is
  reading at its foot — the member with
  their sign-out, a visitor with the one way in.

  The panel is the site's own `Sheet`, so its accessibility is the primitive's:
  focus stays inside, Escape and a backdrop tap close it, the page behind it
  stops scrolling, and it is a dialog with a name to a screen reader. What is
  ours is the look and the motion, and `app/globals.css` owns every `menu-` rule
  that draws it.
*/

export type SiteMenuUser = {
  name: string;
  username: string;
  avatar?: string;
  initials: string;
};

type MenuItem = {
  icon: LucideIcon;
  label: string;
  action: AccountMenuActionId;
  /**
   * Needs a session to be useful. A signed-out reader who taps one is signed in
   * first (the header turns the tap into the Google flow) instead of landing on
   * a page they cannot use.
   */
  requiresSession?: boolean;
};

const GUEST_USER: SiteMenuUser = {
  name: "অতিথি",
  username: "DUTIMZ পাঠক",
  initials: "ঢা",
};

/**
 * The one row both a visitor and a member keep, in the same place: their own
 * saved stories. It sits at the top of both lists rather than in one of them, so
 * a reader's bookmarks do not vanish from the menu the moment they sign in — and
 * a signed-out tap starts the Google flow (`runAction` below) instead of landing
 * on a list only a session can fill.
 */
const SAVED_ITEM: MenuItem = {
  icon: Bookmark,
  label: "সংরক্ষিত কনটেন্ট",
  action: "saved",
  requiresSession: true,
};

/** A visitor's list: their bookmarks, with the sign-in button above them. */
const GUEST_ITEMS: MenuItem[] = [SAVED_ITEM];

/** The member's rows, content first; log out is the foot's button, not a row. */
const ACCOUNT_ITEMS: MenuItem[] = [
  SAVED_ITEM,
  {
    icon: LayoutDashboard,
    label: "ড্যাশবোর্ড",
    action: "dashboard",
  },
  {
    icon: CircleUserRound,
    label: "আমার প্রোফাইল",
    action: "my-profile",
  },
  {
    icon: LogOut,
    label: "লগ আউট",
    action: "logout",
  },
];

/** Where a desk lives. The bar's pills and this panel's rows share it. */
export function sectionHref(slug: string) {
  return slug === "all" ? "/" : `/category/${slug}/`;
}

/** Whether a desk is the address the reader is on. Shared with the pills. */
export function isCurrentSection(slug: string, pathname: string) {
  return slug === "all"
    ? pathname === "/"
    : pathname.startsWith(`/category/${slug}`);
}

/** The row's trailing mark: it arrives on hover, and never on a phone's tap. */
function MenuArrow() {
  return (
    <svg className="menu-arrow" viewBox="0 0 24 24" aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function SiteMenu({
  sections,
  user,
  onAction = () => {},
  hiddenActions = [],
}: {
  /** The live desks, read once by the shell and shared with the bar and footer. */
  sections: { slug: string; label: string }[];
  /**
   * The signed-in reader, or null/undefined for a visitor with no session. The
   * menu is the same panel in both states; only its foot and its account rows
   * change.
   */
  user?: SiteMenuUser | null;
  /** Handled by the header: routes, the Google flow, and ending the session. */
  onAction?: (action?: string) => void;
  /**
   * Action ids to hide, for hosts where an entry has no destination. The menu
   * reads the same table as the handler, so an entry that survives here always
   * has somewhere to go.
   */
  hiddenActions?: string[];
}) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = React.useState(false);
  const isGuest = !user;
  const activeUser = user ?? GUEST_USER;
  const hidden = new Set(hiddenActions);

  /*
    Every line takes its place in the open animation as it is built, so the panel
    arrives from its head down instead of as one slab. `line` counts in the order
    the tree below is constructed, and the stylesheet turns each number into that
    line's own delay.
  */
  let line = 0;
  const at = () => ({ "--i": line++ }) as React.CSSProperties;

  // The reader's own pages are a dialog's business: a navigation closes it, and
  // so does the browser's back button.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const items = isGuest ? GUEST_ITEMS : ACCOUNT_ITEMS;
  const rows = items.filter(
    (item) => item.action !== "logout" && !hidden.has(item.action),
  );
  // Log out is not a row: the reference puts it beside the member at the foot.
  const logout = items.find(
    (item) => item.action === "logout" && !hidden.has(item.action),
  );

  const runAction = (item: MenuItem) => {
    // A signed-out reader tapping a session-only row signs in rather than
    // landing on a page that would only bounce them back.
    onAction(isGuest && item.requiresSession ? "sign-in" : item.action);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="menu-btn"
          aria-label="মেনু"
          data-menu-trigger
        >
          {/* The reference's mark: three bars that become the X it opens to. */}
          <span className="menu-bars" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        // The head carries this panel's own close control, in the site's voice.
        hideClose
        className="menu-panel"
        overlayClassName="menu-backdrop"
      >
        <div className="menu-head menu-anim" style={at()}>
          <div>
            <SheetDescription className="menu-eyebrow">
              ডেস্ক ও অ্যাকাউন্ট
            </SheetDescription>
            <SheetTitle className="menu-title">মেনু</SheetTitle>
          </div>
          <SheetClose asChild>
            <button
              type="button"
              className="menu-close"
              aria-label="মেনু বন্ধ করুন"
            >
              <X aria-hidden />
            </button>
          </SheetClose>
        </div>

        {sections.length > 0 && (
          <>
            <p className="menu-section menu-anim" style={at()}>
              বিভাগ
            </p>
            <nav className="menu-list" aria-label="বিভাগ">
              {sections.map((section) => {
                const Icon = flagIconFor(section.label);
                const current = isCurrentSection(section.slug, pathname);
                return (
                  <Link
                    key={section.slug}
                    href={sectionHref(section.slug)}
                    className="menu-item menu-anim"
                    style={at()}
                    aria-current={current ? "page" : undefined}
                  >
                    <Icon className="menu-icon" aria-hidden />
                    <span className="menu-text">{section.label}</span>
                    <MenuArrow />
                  </Link>
                );
              })}
            </nav>
          </>
        )}

        <div className="menu-rule menu-anim" style={at()} aria-hidden />

        <p className="menu-section menu-anim" style={at()}>
          অ্যাকাউন্ট
        </p>

        {/* Signed out, the menu leads with the one way in: Google. */}
        {isGuest && (
          <div className="menu-signin menu-anim" style={at()}>
            <SignInButton />
          </div>
        )}

        {rows.length > 0 && (
          <div className="menu-list">
            {rows.map((item) => (
              <button
                key={item.action}
                type="button"
                className="menu-item menu-anim"
                style={at()}
                onClick={() => runAction(item)}
              >
                <item.icon className="menu-icon" aria-hidden />
                <span className="menu-text">{item.label}</span>
                <MenuArrow />
              </button>
            ))}
          </div>
        )}

        <div className="menu-profile menu-anim" style={at()}>
          <Avatar className="menu-avatar">
            {activeUser.avatar ? (
              <AvatarImage src={activeUser.avatar} alt={activeUser.name} />
            ) : null}
            <AvatarFallback>{activeUser.initials}</AvatarFallback>
          </Avatar>
          <div className="menu-profile-info">
            <p className="menu-profile-name">{activeUser.name}</p>
            <p className="menu-profile-role">{activeUser.username}</p>
          </div>
          {logout && (
            <button
              type="button"
              className="menu-logout"
              aria-label={logout.label}
              title={logout.label}
              onClick={() => runAction(logout)}
            >
              <logout.icon aria-hidden />
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
