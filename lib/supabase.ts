import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

import { reportError } from "./errors";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    !supabaseUrl.includes("YOUR_PROJECT_REF")
  );
}

/** Anonymous server-side client for public reads (same role as Pages Functions used). */
export function supabaseServer() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "dutimz-next" } },
  });
}

/**
 * Browsers cap a `Set-Cookie` lifetime at 400 days. Every session cookie this site writes uses
 * the same ceiling, so the OAuth callback and the browser client can never disagree about how
 * long a reader stays signed in. See `app/auth/callback/route.ts`.
 */
const SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * Browser client for signed-in actions (reactions, bookmarks, comments, uploads).
 *
 * One instance per page, created on first use and then reused. `createBrowserClient` builds a
 * brand new GoTrue client on every call, and this function is called from the effect of nearly
 * every interactive component, so a signed-in reader ended up with a dozen of them sharing one
 * storage key. They then raced each other over the same refresh token: the browser logs
 * "Multiple GoTrueClient instances detected", whichever client loses the race finds its token
 * already spent and gets a 400 from `/auth/v1/token?grant_type=refresh_token`, and the reader is
 * treated as signed out. That is how a signed-in reporter was told to "sign in with Google"
 * while uploading a photo, and why the session kept evaporating between actions.
 */
let browserClient: SupabaseClient | null = null;

export function supabaseBrowser() {
  browserClient ??= createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  });
  return browserClient;
}

/**
 * Distinguishes "there is genuinely nobody signed in" from "the session could not be checked".
 *
 * Supabase reports an absent session as an `AuthSessionMissingError`, while a dropped network
 * call reports something else entirely. Treating the second as the first is how a signed-in
 * reader gets shown a sign-in button over a bad connection, so callers must be able to tell them
 * apart before they clear any UI state.
 */
export function isMissingSession(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "AuthSessionMissingError"
  );
}

/** Treat a token as spent 30s early so it cannot expire mid-request. */
const REFRESH_MARGIN_SECONDS = 30;

/**
 * Returns an access token that is actually valid right now, refreshing the stored session when
 * it has expired — or null when nobody is signed in.
 *
 * `getSession()` hands back whatever the cookie store holds without refreshing it, so a session
 * that has outlived its one-hour access token still looks signed in. A request carrying that
 * dead token is refused by the server, which is how a signed-in reporter kept being told to
 * sign in with Google before an upload. Going through here turns "a session exists" into "the
 * token works", which is the only thing the caller can send anywhere.
 */
export async function freshAccessToken(): Promise<string | null> {
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (
    session?.expires_at &&
    session.expires_at - REFRESH_MARGIN_SECONDS > Date.now() / 1000
  ) {
    return session.access_token;
  }
  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (error) {
    reportError("session refresh", error);
    return session?.access_token ?? null;
  }
  return refreshed.session?.access_token ?? session?.access_token ?? null;
}

export type DbCategory = { slug: string; title_bn: string };
export type DbProfile = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type Story = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body?: string;
  author_id?: string | null;
  is_anonymous: boolean;
  published_at: string;
  hero_media_key: string | null;
  article_media?: { media_id: string; position: number }[] | null;
  category: DbCategory | DbCategory[] | null;
  profiles: DbProfile | DbProfile[] | null;
};

export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function storyCategory(story: Story): DbCategory {
  return (
    one(story.category) ?? { slug: "campus", title_bn: "ক্যাম্পাস" }
  );
}

export type Credit = { name: string; href: string };

export const ANONYMOUS_BYLINE = "নাম প্রকাশে অনিচ্ছুক";

export function storyCredit(story: Story): Credit {
  const profile = one(story.profiles);
  if (story.is_anonymous || !profile?.username)
    return { name: ANONYMOUS_BYLINE, href: "" };
  const name =
    profile.display_name?.trim() || `@${profile.username || "পাঠক"}`;
  return { name, href: `/u/${encodeURIComponent(profile.username)}/` };
}
