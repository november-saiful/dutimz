/**
 * Phase 4 Comment Section — server component that loads the approved comment
 * thread (Supabase when configured, mock store otherwise) and hands it to the
 * interactive CommentThread client component.
 *
 * Uses the cookie-less anon client internally, so rendering an article page
 * does not opt it into dynamic rendering.
 */
import { CommentThread } from "./CommentThread";
import { listComments } from "@/lib/data/publicApi";

export async function CommentSection({ contentId }: { contentId: string }) {
  const comments = await listComments(contentId);
  return <CommentThread contentId={contentId} comments={comments} />;
}
