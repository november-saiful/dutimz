import { ImageResponse } from "next/og";

import {
  BAND_GRADIENT,
  OG_FONT_FAMILY,
  ogFonts,
  ogProfile,
} from "@/lib/og-card";
import { roleTitle } from "@/lib/site";

/*
  The share card for a member's profile: the page's own band, with the member's
  name over it.

  `/u/<handle>/` is an editorial page — the band, the identity laid over its foot,
  the strip of real numbers — and it shares as itself rather than as the site's
  default text-logo banner. Next picks this file up by name and adds the absolute
  `og:image` and `twitter:image` to the page's metadata, so no page code has to
  remember it.

  What is drawn is deliberately only text and CSS gradients: no avatar, no cover
  photo, nothing fetched from the media host. An image a scraper fetches has to
  arrive, and a second network call inside it is a second way for the card to be
  missing. The face is the site's own (see `lib/og-card.ts` for why it is fetched
  over HTTP and why it is a TTF).
*/

export const alt = "DUTIMZ সদস্যের প্রকাশ্য প্রোফাইল";

export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

/** The band's drifting blooms. Satori has no `filter: blur`, so they are radial washes. */
const BLOOMS = [
  {
    top: "-150px",
    right: "-120px",
    width: "560px",
    height: "560px",
    background:
      "radial-gradient(circle, rgba(163,112,160,0.55) 0%, rgba(163,112,160,0) 70%)",
  },
  {
    bottom: "-210px",
    left: "60px",
    width: "540px",
    height: "540px",
    background:
      "radial-gradient(circle, rgba(122,61,127,0.6) 0%, rgba(122,61,127,0) 70%)",
  },
  {
    top: "60px",
    left: "430px",
    width: "360px",
    height: "360px",
    background:
      "radial-gradient(circle, rgba(207,166,212,0.26) 0%, rgba(207,166,212,0) 70%)",
  },
] as const;

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  // The segment is a URL segment: the page decodes it the same way before asking
  // for the member, so the card must too or the two can disagree about a handle.
  const handle = (() => {
    try {
      return decodeURIComponent(username);
    } catch {
      return username;
    }
  })();

  const [profile, fonts] = await Promise.all([ogProfile(handle), ogFonts()]);
  // No profile — an unknown handle, a build with no database, a failed read — is
  // the site's own card, never a broken one: it claims no member and names none.
  // The eyebrow introduces the member the way the page does: the desk names their
  // role, not "member" — a reporter's card says DUTIMZ Reporter. A handle that
  // resolves to nobody claims no role at all.
  const eyebrow = profile ? `DUTIMZ ${roleTitle(profile.role)}` : "DUTIMZ";
  const name = profile?.name ?? "সদস্য প্রোফাইল";
  const account = profile ? `@${profile.username}` : null;
  const department = profile?.department ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          padding: "72px",
          background: BAND_GRADIENT,
          fontFamily: OG_FONT_FAMILY,
        }}
      >
        {BLOOMS.map((bloom, index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              ...bloom,
              borderRadius: "50%",
            }}
          />
        ))}

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 22,
              letterSpacing: 5,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              marginTop: 18,
              maxWidth: 980,
              fontSize: 74,
              fontWeight: 700,
              lineHeight: 1.15,
              color: "#ffffff",
              textShadow: "0 2px 24px rgba(0,0,0,0.35)",
            }}
          >
            {name}
          </div>
          {account ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: 18,
                fontSize: 30,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              <span>{account}</span>
              {department ? (
                <span style={{ marginLeft: 18, marginRight: 18, color: "rgba(255,255,255,0.4)" }}>
                  ·
                </span>
              ) : null}
              {department ? <span>{department}</span> : null}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            width: "100%",
            marginTop: 56,
          }}
        >
          <div
            style={{
              display: "flex",
              width: "240px",
              height: 1,
              background: "rgba(255,255,255,0.25)",
            }}
          />
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 8,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            DUTIMZ
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
