export const runtime = "edge";

import { NextRequest } from "next/server";
import {
  getMockRevision,
  listMockRevisions,
} from "@/lib/data/reporterMock";
import { hasSupabase, json, jsonError } from "@/lib/data/deskApi";
import { restorePayload } from "@/lib/content/revisions";

/**
 * /api/reporter/revisions?contentId=…&version=…
 *  - with `version`: returns { revision, body } (plain-text-ish HTML body for
 *    the history preview and restore flow).
 *  - without: returns the full revision list for the panel.
 */

export async function GET(request: NextRequest) {
  const contentId = request.nextUrl.searchParams.get("contentId");
  if (!contentId) return jsonError("contentId is required");

  const versionParam = request.nextUrl.searchParams.get("version");

  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const { getAuthProfile } = await import("@/lib/auth/server");
    const profile = await getAuthProfile();
    if (!profile) return jsonError("Authentication required", 401);

    const supabase = createSupabaseServerClient();
    if (versionParam) {
      const { data: revision } = await supabase
        .from("content_revisions")
        .select("*")
        .eq("content_id", contentId)
        .eq("version", Number(versionParam))
        .maybeSingle();
      if (!revision) return jsonError("Not found", 404);
      const fields = restorePayload(revision);
      return json({
        revision,
        body: (fields.body_bn as string | undefined) ?? (fields.body_en as string | undefined) ?? "",
      });
    }

    const { data: revisions, error } = await supabase
      .from("content_revisions")
      .select("*, editor:profiles(id, username, display_name, avatar_url)")
      .eq("content_id", contentId)
      .order("version", { ascending: false });
    if (error) return jsonError(error.message, 500);
    return json({ revisions: revisions ?? [] });
  }

  // Mock mode.
  if (versionParam) {
    const revision = getMockRevision(contentId, Number(versionParam));
    if (!revision) return jsonError("Not found", 404);
    const fields = restorePayload(revision);
    return json({
      revision,
      body:
        (fields.body_bn as string | undefined) ??
        (fields.body_en as string | undefined) ??
        "",
    });
  }

  return json({ revisions: listMockRevisions(contentId) });
}
