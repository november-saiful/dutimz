"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  Bookmark,
  CircleUserRound,
  Clapperboard,
  Info,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";

import { SignInButton } from "@/components/auth/sign-in-button";
import { flagIconFor } from "@/components/dashboard/flag";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type AccountMenuActionId } from "@/lib/account-menu";

/*
  The site's one menu: the button at the right of the top bar opens an anchored
  popup that carries the account and the reader's saved stories together — in
  both session states, because bookmarks are content rather than an account
  surface.

  Like the push bell beside it, this is a small panel growing from its button
  (one spring on opacity/scale/y, GPU only), not a full-height sheet. The
  account leads at the top in both layouts; the desks follow below it on phones
  only, where the bar's pills are hidden — on the wide bar the pills already
  carry the desks, so the menu does not repeat them.
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

/**
 * The site's own pages the menu carries in both layouts: the wide bar shows
 * the desks as pills (so the desks stay phone-only rows), but these
 * destinations are behind no bar control — hence their own titled section
 * under a divider, on web and on phones alike.
 */
const PAGES: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "ফ্লিপস", href: "/flipps/", icon: Clapperboard },
  { label: "স্পটলাইট", href: "/spotlight/", icon: MessagesSquare },
  { label: "পরিসংখ্যান", href: "/statistics/", icon: BarChart3 },
  { label: "সংশোধন ও তথ্য যাচাই", href: "/corrections/", icon: BadgeCheck },
  { label: "আমাদের পরিচয়", href: "/about/", icon: Info },
  { label: "সম্পাদকীয় নীতিমালা", href: "/guidelines/", icon: BookOpen },
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
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const isGuest = !user;
  const activeUser = user ?? GUEST_USER;
  const hidden = new Set(hiddenActions);

  // The reader's own pages are a popup's business: a navigation closes it, and
  // so does an outside tap or Escape.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

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
    setOpen(false);
    onAction(isGuest && item.requiresSession ? "sign-in" : item.action);
  };

  const panelMotion = shouldReduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.96, y: -6 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.97, y: -4 },
      };

  const listVariants = shouldReduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.035, delayChildren: 0.05 },
        },
      };

  const itemVariants = shouldReduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.18 } },
      };

  return (
    <div ref={wrapRef} className="relative">
      <motion.button
        type="button"
        className="menu-btn"
        aria-label="মেনু"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-menu-trigger
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
      >
        {/* The reference's mark: three bars that become the X it opens to. */}
        <span className="menu-bars" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="site-menu-popup"
            role="dialog"
            aria-label="মেনু"
            className="absolute right-0 top-[calc(100%+10px)] z-[70] max-h-[calc(100dvh-80px)] w-[min(360px,calc(100vw-36px))] origin-top-right overflow-y-auto rounded-3xl border bg-white p-5 shadow-[0_24px_60px_-20px_rgba(26,18,32,0.35),0_8px_20px_-10px_rgba(26,18,32,0.18)] max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-[calc(var(--topbar)+8px)] max-sm:max-h-[calc(100dvh-var(--topbar)-20px)] max-sm:w-auto max-sm:origin-top-center"
            style={{ willChange: "transform, opacity" }}
            initial={panelMotion.initial}
            animate={panelMotion.animate}
            exit={panelMotion.exit}
            transition={
              shouldReduceMotion
                ? { duration: 0.12 }
                : { type: "spring", stiffness: 400, damping: 30 }
            }
          >
            <motion.div
              variants={listVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col"
            >
              <motion.div variants={itemVariants} className="menu-head">
                <div>
                  <p className="menu-eyebrow">ডেস্ক ও অ্যাকাউন্ট</p>
                  <p className="menu-title">মেনু</p>
                </div>
              </motion.div>

              {/* Account leads: the wide bar already carries the desks as pills,
                  so the menu opens with the reader's own pages everywhere. */}
              <motion.p variants={itemVariants} className="menu-section">
                অ্যাকাউন্ট
              </motion.p>

              {/* Signed out, the menu leads with the one way in: Google. */}
              {isGuest && (
                <motion.div variants={itemVariants} className="menu-signin">
                  <SignInButton />
                </motion.div>
              )}

              {rows.length > 0 && (
                <motion.div variants={itemVariants} className="menu-list">
                  {rows.map((item) => (
                    <button
                      key={item.action}
                      type="button"
                      className="menu-item"
                      onClick={() => runAction(item)}
                    >
                      <item.icon className="menu-icon" aria-hidden />
                      <span className="menu-text">{item.label}</span>
                      <MenuArrow />
                    </button>
                  ))}
                </motion.div>
              )}

              <motion.div
                variants={itemVariants}
                className="menu-rule"
                aria-hidden
              />
              <motion.div variants={itemVariants} className="menu-profile">
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
              </motion.div>

              {/* Desks live here on phones only, where the bar's pills are
                  hidden (see the 860px rule in globals.css): on the wide bar
                  the pills already carry them, so the menu does not repeat
                  them. menu-mobile-only mirrors that breakpoint. */}
              {sections.length > 0 && (
                <>
                  <motion.div
                    variants={itemVariants}
                    className="menu-rule menu-mobile-only"
                    aria-hidden
                  />

                  <motion.p
                    variants={itemVariants}
                    className="menu-section menu-mobile-only"
                  >
                    বিভাগ
                  </motion.p>
                  <motion.nav
                    variants={itemVariants}
                    className="menu-list menu-mobile-only"
                    aria-label="বিভাগ"
                  >
                    {sections.map((section) => {
                      const Icon = flagIconFor(section.label);
                      const current = isCurrentSection(section.slug, pathname);
                      return (
                        <Link
                          key={section.slug}
                          href={sectionHref(section.slug)}
                          className="menu-item"
                          aria-current={current ? "page" : undefined}
                        >
                          <Icon className="menu-icon" aria-hidden />
                          <span className="menu-text">{section.label}</span>
                          <MenuArrow />
                        </Link>
                      );
                    })}
                  </motion.nav>
                </>
              )}
              <>
                <motion.div
                  variants={itemVariants}
                  className="menu-rule"
                  aria-hidden
                />
                <motion.p
                  variants={itemVariants}
                  className="menu-section"
                >
                  পাতা
                  </motion.p>
                  <motion.nav
                    variants={itemVariants}
                    className="menu-list"
                    aria-label="পাতা"
                  >
                    {PAGES.map((page) => (
                      <Link key={page.href} href={page.href} className="menu-item">
                        <page.icon className="menu-icon" aria-hidden />
                        <span className="menu-text">{page.label}</span>
                        <MenuArrow />
                      </Link>
                    ))}
                  </motion.nav>
              </>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
