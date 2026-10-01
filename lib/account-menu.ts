/**
 * Single source of truth for the account menu.
 *
 * Every entry the menu can emit is declared here with its destination, and both
 * the menu component and the header's click handler read from this table — so an
 * action can never point the reader somewhere the handler does not know about,
 * or leave an entry with no route at all. The menu's `action` fields are typed
 * as `AccountMenuActionId`, which makes referencing an unknown id a compile
 * error rather than a silent dead link.
 *
 * Google is the only identity provider and there is no sign-in page: the
 * `sign-in` action starts the OAuth flow, and `switch` ends the session and
 * starts it again so the reader can pick another identity.
 */

/** Actions that navigate straight to a DUTIMZ route. */
export const ACCOUNT_ROUTES = {
  profile: "/profile/me/",
  settings: "/account/",
  notifications: "/saved/",
  help: "/about/",
  saved: "/saved/",
  statistics: "/statistics/",
  corrections: "/corrections/",
  guidelines: "/guidelines/",
  about: "/about/",
} as const;

/**
 * Actions that end the session before landing on their route. "switch" is not
 * listed: it signs out and then immediately re-opens the Google account picker,
 * so it has no page to land on.
 */
export const ACCOUNT_SIGN_OUT_ROUTES = {
  logout: "/",
} as const;

/** Actions handled as a call to the auth provider rather than a navigation. */
export const ACCOUNT_AUTH_ACTIONS = ["sign-in", "switch"] as const;

/** Entries the menu can render but this site deliberately hides: there is no
 * presence system, theming, premium tier, referral programme, native app or
 * changelog behind them, so they have no destination to route to. */
export const ACCOUNT_HIDDEN_ACTIONS = [
  "status",
  "appearance",
  "upgrade",
  "referrals",
  "download",
  "whats-new",
] as const;

export type AccountMenuActionId =
  | keyof typeof ACCOUNT_ROUTES
  | keyof typeof ACCOUNT_SIGN_OUT_ROUTES
  | (typeof ACCOUNT_AUTH_ACTIONS)[number]
  | (typeof ACCOUNT_HIDDEN_ACTIONS)[number];
