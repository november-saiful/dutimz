import type { ContentRevision } from "@/types";

/**
 * `ContentRevision` is backed by `content_revisions` (migration 0001):
 *   - `changes` JSONB holds `{ diff, snapshot, note, action }`.
 *   - `version` is monotonic per content row.
 * See src/lib/content/revisions.ts for the payload shape helpers.
 */
export type RevisionChanges = {
  diff: Record<string, { from: unknown; to: unknown }>;
  snapshot?: {
    fields: Record<string, unknown>;
    savedAt: string;
  };
  /** Workflow action that produced this revision (submit/approve/…). */
  action?: string;
  /** Editor's note, e.g. moderator's requested changes. */
  note?: string;
};

export interface ContentRevisionWithEditor extends ContentRevision {
  editor: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface ReporterStats {
  total: number;
  drafts: number;
  pending_review: number;
  published: number;
  rejected: number;
  totalViews: number;
}
