import type { ContentStatus, UserRole } from "@/types";
import { ROLE_HIERARCHY } from "@/lib/constants/app";

/**
 * Phase 3 content workflow (section 4.2 of the spec):
 *
 *   draft ──submit──▶ pending_review ──approve──▶ published
 *     ▲                    │       │                 │
 *     │                 reject   request_changes   │
 *     │                    ▼       │                 │
 *     └─────────────── rejected ◀──┘                 │
 *     ▲                                              │
 *     └────────────── unpublish (archive) ◀──────────┘
 *
 * `request_changes` is expressed as moving the story back to `draft` with a
 * revision note, matching the "editor sends back" loop used by newsrooms.
 *
 * Each accepted transition writes exactly one revision and advances the story's
 * version by one — including approval, which publishes the story. That pairing
 * (one revision ⇒ one version number) is what keeps the history unambiguous;
 * see `nextRevisionVersion` in src/lib/content/revisions.ts.
 */

/** Roles allowed to perform each workflow transition. */
export const TRANSITION_ROLES: Record<
  WorkflowAction,
  readonly UserRole[]
> = {
  submit: ["reporter", "moderator", "admin"],
  approve: ["moderator", "admin"],
  reject: ["moderator", "admin"],
  request_changes: ["moderator", "admin"],
  publish: ["moderator", "admin"],
  unpublish: ["moderator", "admin"],
  reopen: ["reporter", "moderator", "admin"],
  archive: ["moderator", "admin"],
} as const;

export type WorkflowAction =
  | "submit" // draft → pending_review
  | "approve" // pending_review → published
  | "reject" // pending_review → rejected
  | "request_changes" // pending_review → draft (with note)
  | "publish" // draft/rejected → published (moderators may fast-track)
  | "unpublish" // published → draft
  | "reopen" // rejected → draft
  | "archive"; // published → archived

/** Human-readable Bangla/English labels for each status. */
export const STATUS_LABELS: Record<
  ContentStatus,
  { bn: string; en: string }
> = {
  draft: { bn: "খসড়া", en: "Draft" },
  pending_review: { bn: "পর্যালোচনাধীন", en: "Pending review" },
  published: { bn: "প্রকাশিত", en: "Published" },
  rejected: { bn: "প্রত্যাখ্যাত", en: "Rejected" },
  archived: { bn: "আর্কাইভড", en: "Archived" },
};

export const STATUS_LABEL_KEYS: readonly ContentStatus[] = [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "archived",
] as const;

/** Where each transition sends the story. */
const TRANSITIONS: Record<WorkflowAction, ContentStatus> = {
  submit: "pending_review",
  approve: "published",
  reject: "rejected",
  request_changes: "draft",
  publish: "published",
  unpublish: "draft",
  reopen: "draft",
  archive: "archived",
};

/** Statuses from which each transition is legal. */
const TRANSITION_FROM: Record<WorkflowAction, readonly ContentStatus[]> = {
  submit: ["draft"],
  approve: ["pending_review"],
  reject: ["pending_review"],
  request_changes: ["pending_review"],
  publish: ["draft", "rejected"],
  unpublish: ["published"],
  reopen: ["rejected"],
  archive: ["published"],
};

export class WorkflowTransitionError extends Error {
  constructor(
    public readonly action: WorkflowAction,
    public readonly from: ContentStatus,
    public readonly reason: "invalid_transition" | "forbidden_role",
  ) {
    super(
      reason === "forbidden_role"
        ? `Role is not permitted to ${action} content in state "${from}".`
        : `Cannot ${action} content from state "${from}".`,
    );
    this.name = "WorkflowTransitionError";
  }
}

export interface WorkflowActor {
  id: string;
  role: UserRole;
}

export interface TransitionResult {
  status: ContentStatus;
  action: WorkflowAction;
  from: ContentStatus;
  /**
   * The story's version after the transition — always one higher than before,
   * and the number the revision it writes is filed under.
   */
  version: number;
  /** Epoch ms when the story became live (approve/publish only). */
  publishedAt: string | null;
}

function roleLevel(role: UserRole): number {
  return ROLE_HIERARCHY[role] ?? 0;
}

/**
 * Pure transition check + application. Throws WorkflowTransitionError when the
 * action is illegal for the state or the actor's role is insufficient.
 * Immutable inputs; callers persist `status`, `version`, `published_at`.
 *
 * **Every** accepted transition advances the version, going live included.
 * Approving used to keep the previous number, which made the publish revision
 * collide with the edit it published — two rows claiming the same version, so
 * `?version=N` was ambiguous and the history's "current" badge landed on the
 * wrong entry. A transition always writes a revision, so it always needs a
 * number of its own; callers use `nextRevisionVersion` for the same reason.
 */
export function applyTransition(
  from: ContentStatus,
  action: WorkflowAction,
  actor: Pick<WorkflowActor, "role"> | WorkflowActor,
  currentVersion = 1,
): TransitionResult {
  const allowedFrom = TRANSITION_FROM[action];
  if (!allowedFrom.includes(from)) {
    throw new WorkflowTransitionError(action, from, "invalid_transition");
  }
  if (!TRANSITION_ROLES[action].includes(actor.role)) {
    throw new WorkflowTransitionError(action, from, "forbidden_role");
  }

  const to = TRANSITIONS[action];
  const goesLive = to === "published";
  // Versions never go backwards and never repeat.
  const version = Math.max(currentVersion, 0) + 1;

  return {
    status: to,
    action,
    from,
    version,
    publishedAt: goesLive ? new Date().toISOString() : null,
  };
}

/** Legal next actions for a story in `status` for the given role (for UI). */
export function availableActions(
  status: ContentStatus,
  role: UserRole,
): WorkflowAction[] {
  return (Object.keys(TRANSITIONS) as WorkflowAction[]).filter((action) => {
    const allowedFrom = TRANSITION_FROM[action];
    return (
      allowedFrom.includes(status) && TRANSITION_ROLES[action].includes(role)
    );
  });
}

/** Moderators and above bypass the review queue (still recorded as revisions). */
export function canFastTrack(role: UserRole): boolean {
  return roleLevel(role) >= roleLevel("moderator");
}
