import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Content } from "@/types";
import type { ContentRevisionWithEditor } from "@/types/workflow";
import { ContentEditor } from "@/components/reporter/ContentEditor";
import { getActiveCategories } from "@/lib/data/queries";
import { getAuthContext } from "@/lib/auth/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Edit story",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Edit page: server-loads the row + revisions (Supabase or mock store) and
 * hands them to the editor client. Ownership checks happen in the API layer;
 * middleware guards the route by role.
 */
export default async function EditContentPage({
  params,
}: {
  params: { id: string };
}) {
  const { profile } = await getAuthContext();
  const categories = await getActiveCategories();
  const role = (profile?.role ?? "reporter") as "reporter" | "moderator" | "admin";

  let content: Content | null = null;
  let revisions: ContentRevisionWithEditor[] = [];

  if (hasSupabaseEnv()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseServerClient();
    const { data } = await supabase
      .from("contents")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    content = (data as Content | null) ?? null;

    const { data: revs } = await supabase
      .from("content_revisions")
      .select("*, editor:profiles(id, username, display_name, avatar_url)")
      .eq("content_id", params.id)
      .order("version", { ascending: false });
    revisions = (revs as ContentRevisionWithEditor[] | null) ?? [];
  } else {
    const { getMockContent, listMockRevisions } = await import("@/lib/data/reporterMock");
    const row = getMockContent(params.id);
    if (row) {
      content = row;
      revisions = listMockRevisions(params.id).map((r) => ({
        id: r.id,
        content_id: r.content_id,
        editor_id: r.editor_id,
        changes: r.changes,
        version: r.version,
        created_at: r.created_at,
        editor: {
          id: r.editor_id,
          username: r.editor_name,
          display_name: r.editor_name,
          avatar_url: null,
        },
      }));
    }
  }

  if (!content) notFound();

  return (
    <div className="container mt-8 max-w-4xl">
      <ContentEditor
        initialContent={content}
        revisions={revisions}
        categories={categories}
        role={role}
      />
    </div>
  );
}
