"use client";

import { supabaseBrowser } from "@/lib/supabase";

/**
 * Google is the only identity provider this site offers, so "sign in" is always
 * this one call. There is no dedicated sign-in page: the account menu, and every
 * action that needs a session, start the OAuth flow directly, and the callback
 * (`app/auth/callback/`) returns the reader to the page they were on.
 */
export async function signInWithGoogle(): Promise<{ error: unknown | null }> {
  try {
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback/`,
        queryParams: { prompt: "select_account" },
      },
    });
    return { error };
  } catch (err) {
    return { error: err };
  }
}

const RETURN_PATH_KEY = "dutimz-after-auth";

/**
 * Remembers the current page so the reader can be returned to it after the
 * Google round-trip. Stored in sessionStorage rather than the OAuth redirect so
 * the redirect URL stays the exact callback the Supabase allowlist names.
 */
export function rememberReturnPath() {
  try {
    sessionStorage.setItem(
      RETURN_PATH_KEY,
      `${location.pathname}${location.search}`,
    );
  } catch {
    /* private mode can refuse storage; the callback then lands on the homepage */
  }
}

/**
 * Reads and clears the remembered page. Returns null when there is nothing
 * usable to restore, so a stale value can never send the reader somewhere odd.
 */
export function consumeReturnPath(): string | null {
  try {
    const value = sessionStorage.getItem(RETURN_PATH_KEY);
    if (value) sessionStorage.removeItem(RETURN_PATH_KEY);
    return value && value.startsWith("/") ? value : null;
  } catch {
    return null;
  }
}
