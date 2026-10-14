import { freshAccessToken } from "@/lib/supabase";

/*
  One upload contract for every picture the site keeps.

  The gallery, the Spotlight proof photos and a member's own face and banner all
  post the same way: the raw file as the body, its type in `Content-Type`, and the
  reader's own access token in `Authorization`. The media Worker — which holds the
  only binding to the R2 buckets — decides what that token may write, so where the
  bytes land is a server decision, not this module's.

  The token comes from the shared `@supabase/ssr` session, and `freshAccessToken`
  refreshes it when the stored one has expired. A bare supabase-js client built
  here would read localStorage and find no session at all, and a stale cookie
  session would send a dead token the media Worker answers with 401 — both of
  which tell a signed-in member to sign in with Google before their own upload.
*/

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * Which media the Worker is being asked to store. `article` is editorial and
 * needs a newsroom role; `spotlight` and `profile` are open to every signed-in
 * member, because a reader who has never filed a story still has a face.
 */
export type MediaScope = "article" | "spotlight" | "profile";

const UPLOAD_PATHS: Record<MediaScope, string> = {
  article: "/upload",
  spotlight: "/spotlight/upload",
  profile: "/profile/upload",
};

export function mediaBase(): string {
  const configured = process.env.NEXT_PUBLIC_MEDIA_URL ?? "";
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location.hostname === "localhost")
    return "http://localhost:8788";
  return "https://media.dutimz.com";
}

/** A stored picture, as the Worker hands it back: its id and its public URL. */
export type UploadedImage = { id: string; url: string };

/**
 * Send one picture to the media Worker and get its id and URL back. Throws with a
 * reader-facing Bengali message on every failure — a missing session, an empty
 * response, and anything the Worker itself refused.
 */
export async function uploadImage(
  file: File,
  scope: MediaScope,
): Promise<UploadedImage> {
  const token = await freshAccessToken();
  if (!token) throw new Error("ছবি পাঠাতে আগে গুগল দিয়ে প্রবেশ করুন।");
  const response = await fetch(`${mediaBase()}${UPLOAD_PATHS[scope]}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      Authorization: `Bearer ${token}`,
    },
    body: file,
  });
  const payload = (await response.json().catch(() => null)) as {
    id?: string;
    url?: string;
    error?: string;
  } | null;
  if (!response.ok) {
    // 403 without a JSON body is the origin gate, not the member's file: this
    // address is not allowed to post to the media Worker (local and preview
    // hosts are accepted; anything else must upload from the main site).
    if (response.status === 403 && !payload?.error) {
      throw new Error("এই ঠিকানা থেকে ছবি পাঠানো যাচ্ছে না। মূল সাইট থেকে চেষ্টা করুন।");
    }
    throw new Error(
      payload?.error ?? `মিডিয়া সার্ভার থেকে ${response.status} ত্রুটি এসেছে`,
    );
  }
  if (!payload?.id) throw new Error("ছবির আইডি পাওয়া যায়নি।");
  return { id: payload.id, url: payload.url ?? "" };
}
