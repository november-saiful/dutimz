import { headers } from "next/headers";

import { previewMember } from "@/lib/preview";
import { SITE_URL } from "@/lib/site";
import { isSupabaseConfigured, supabaseServer } from "@/lib/supabase";

/*
  What the share card for `/u/<handle>/` is drawn from.

  The card is the profile page's own band — the same gradient, the same blooms,
  the same single face — with the member's name over it, so a link to a member
  previews as the editorial page it actually is rather than as the site's generic
  banner. Nothing here draws; `app/u/[username]/opengraph-image.tsx` does that.
  This module owns the two things that need care: what row a handle resolves to,
  and the font bytes Satori needs to draw Bengali at all.

  A scraped handle is not a reason to fail a request: `ogProfile` answers `null`
  for an unknown member, an unconfigured build (no Supabase credentials) and a
  reader's failed call alike, and the route turns all three into the generic band
  card. That is also why nothing here fetches a cover photo or an avatar — a
  second network dependency inside an image a scraper fetches is a new way for
  the card to be missing.
*/

/** The profile band's gradient, byte for byte what `app/globals.css` draws. */
export const BAND_GRADIENT =
  "linear-gradient(118deg, #1d0f1e 0%, #451a4a 38%, #7a3d7f 68%, #2a1029 100%)";

/** What the card needs about a member. Deliberately small: four strings. */
export type OgProfile = {
  name: string;
  username: string;
  /**
   * The member's role, which the eyebrow names: "DUTIMZ Reporter". It comes from
   * the same public read as the rest of the identity — `user_roles` itself is
   * owner-and-admin only — and `roleTitle` turns it into the word the card sets.
   */
  role: string | null;
  /** Shown beside the handle only when the member publishes it. */
  department: string | null;
};

/**
 * The fonts Satori is handed, in the shape `ImageResponse` wants.
 *
 * `public/fonts/` carries the site's own face as static TTFs: Satori cannot read
 * woff2, and `next/font` only ever ships woff2, so the share card needs its own
 * copy. They are fetched over HTTP rather than read from disk because this route
 * runs on Cloudflare Workers, where there is no filesystem — and from *our* origin
 * rather than a font host so a card never depends on a third party being reachable.
 *
 * The two files are the *complete* face, Bengali and Latin, at both weights, and
 * that is not an accident of how they were fetched: the renderer behind
 * `ImageResponse` will quietly ask Google for any glyph the fonts it was handed do
 * not have. A weight that carried only one script would still draw a card — from a
 * fetch that has to succeed inside every preview a scraper makes, on a host we do
 * not control. The card's own words are Latin ("DUTIMZ Reporter") and a member's
 * are usually Bengali, so both scripts have to be in our bytes at every weight.
 * `tests/ui-smoke.test.mjs` reads this font's cmap so that stays true.
 */
export type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

const FONT_FAMILY = "Noto Serif Bengali";
const fontPath = (weight: 400 | 700) =>
  `/fonts/noto-serif-bengali-${weight}.ttf`;

let cachedFonts: Promise<OgFont[]> | null = null;

/** Where this deployment answers, as the request arrived at it. */
async function requestOrigin(): Promise<string> {
  try {
    const incoming = await headers();
    const host = incoming.get("host");
    if (host) {
      const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
      const proto = incoming.get("x-forwarded-proto") ?? (local ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // Rendering outside a request (a static pass) has no headers to read.
  }
  return SITE_URL;
}

async function loadFonts(): Promise<OgFont[]> {
  const origin = await requestOrigin();
  return Promise.all(
    ([400, 700] as const).map(async (weight) => {
      const response = await fetch(`${origin}${fontPath(weight)}`);
      if (!response.ok) {
        throw new Error(`share card font ${weight} answered ${response.status}`);
      }
      return {
        name: FONT_FAMILY,
        data: await response.arrayBuffer(),
        weight,
        style: "normal" as const,
      };
    }),
  );
}

/**
 * Both weights, loaded once per isolate and shared by every card.
 *
 * The promise itself is cached, not its result: two cards requested at the same
 * moment share one fetch instead of racing two. A failed load clears the cache
 * again, so one bad minute does not leave every later card textless.
 */
export function ogFonts(): Promise<OgFont[]> {
  cachedFonts ??= loadFonts().catch((error: unknown) => {
    cachedFonts = null;
    throw error;
  });
  return cachedFonts;
}

/** The face the card is set in — the site's own, which draws Bengali and Latin. */
export const OG_FONT_FAMILY = FONT_FAMILY;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The member behind a handle, or null.
 *
 * A build without credentials shows the preview member for the one handle the
 * fixture owns — the same rule `/u/<handle>/` itself follows, so the card and
 * the page it previews can never describe two different people.
 */
export async function ogProfile(handle: string): Promise<OgProfile | null> {
  if (!isSupabaseConfigured()) {
    if (handle !== previewMember.username) return null;
    return {
      name: previewMember.displayName,
      username: previewMember.username,
      role: previewMember.role,
      department: previewMember.department,
    };
  }
  try {
    const { data, error } = await supabaseServer().rpc("get_public_profile", {
      p_username: handle,
    });
    if (error) return null;
    const row = (Array.isArray(data) ? data[0] : data) as
      | Record<string, unknown>
      | null
      | undefined;
    if (!row) return null;
    const username = asString(row.username) ?? handle;
    return {
      // A member with no display name is still a member: the handle stands in.
      name: asString(row.display_name) ?? `@${username}`,
      username,
      role: asString(row.role),
      department: asString(row.department),
    };
  } catch {
    return null;
  }
}
