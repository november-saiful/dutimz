/**
 * Phase 4 Comment Section — server component that fetches comments
 * and renders the interactive CommentThread.
 */
import { CommentThread } from "./CommentThread";
import { getCommentsByContentId } from "@/lib/data/publicMock";

export function CommentSection({ contentId }: { contentId: string }) {
  const comments = getCommentsByContentId(contentId);
  return <CommentThread contentId={contentId} comments={comments} />;
}
