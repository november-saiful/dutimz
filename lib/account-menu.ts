/**
 * Single source of truth for the account menu.
 *
 * The menu has one small set of entries: a signed-out visitor is offered the
 * Google sign-in button and their saved content, and a signed-in member gets
 * their dashboard, their public profile and log out. Every entry the menu can
 * emit is declared here with its destination, and both the menu component and
 * the header's click handler read from this table — so an action can never point
 * the reader somewhere the handler does not know about, or leave an entry with
 * no route at all.
 *
 * Google is the only identity provider and there is no sign-in page: the
 * `sign-in` action starts the OAuth flow.
 */

/** Actions that navigate straight to a DUTIMZ route. `my-profile` is a prefix:
 * the header resolves the member's handle and appends it. */
export const ACCOUNT_ROUTES = {
  dashboard: "/account/",
  "my-profile": "/u/",
  saved: "/saved/",
} as const;

/** Actions that end the session before landing on their route. */
export const ACCOUNT_SIGN_OUT_ROUTES = {
  logout: "/",
} as const;

/** Actions handled as a call to the auth provider rather than a navigation. */
export const ACCOUNT_AUTH_ACTIONS = ["sign-in"] as const;

/** Entries the menu never renders on this site: there is no presence system,
 * theming, premium tier, referral programme, native app or changelog behind
 * them, so they have no destination to route to. */
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
