/**
 * Single source of truth for the account menu.
 *
 * Every entry the menu can emit is declared here with its destination, and both
 * the menu component and the header's click handler read from this table — so an
 * action can never point the reader somewhere the handler does not know about,
 * or leave an entry with no route at all. The menu's `action` fields are typed
 * as `AccountMenuActionId`, which makes referencing an unknown id a compile
 * error rather than a silent dead link.
 */

/** Actions that navigate straight to a DUTIMZ route. */
export const ACCOUNT_ROUTES = {
  profile: "/profile/me/",
  settings: "/account/",
  notifications: "/saved/",
  help: "/about/",
  "sign-in": "/auth/sign-in/",
  saved: "/saved/",
  statistics: "/statistics/",
  corrections: "/corrections/",
  guidelines: "/guidelines/",
  about: "/about/",
} as const;

/**
 * Actions that end the session before landing on their route. "switch" sends the
 * reader to sign-in, whose Google button uses `prompt=select_account` so they can
 * pick another identity; "logout" returns home.
 */
export const ACCOUNT_SIGN_OUT_ROUTES = {
  switch: "/auth/sign-in/",
  logout: "/",
} as const;

/**
 * Entries the menu can render but this site deliberately hides: there is no
 * presence system, theming, premium tier, referral programme, native app or
 * changelog behind them, so they have no destination to route to.
 */
export const ACCOUNT_HIDDEN_ACTIONS = [
  "status",
  "appearance",
  "upgrade",
  "referrals",
  "download",
  "whats-new",
] as const;

/** Section entries carry their slug, e.g. `category:campus`. */
export const CATEGORY_ACTION_PREFIX = "category:";

export type AccountMenuActionId =
  | keyof typeof ACCOUNT_ROUTES
  | keyof typeof ACCOUNT_SIGN_OUT_ROUTES
  | (typeof ACCOUNT_HIDDEN_ACTIONS)[number];

export function categoryAction(slug: string): string {
  return `${CATEGORY_ACTION_PREFIX}${slug}`;
}

export function isCategoryAction(action: string): boolean {
  return action.startsWith(CATEGORY_ACTION_PREFIX);
}

export function categoryHref(action: string): string {
  return `/category/${action.slice(CATEGORY_ACTION_PREFIX.length)}/`;
}
