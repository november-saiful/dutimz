import type { ContentStatus } from "@/types";
import {
  STATUS_LABELS,
  availableActions,
  type WorkflowAction,
} from "@/lib/content/workflow";

/** Material-style badge for a workflow status, Bangla/English. */
export function StatusBadge({
  status,
  locale = "bn",
}: {
  status: ContentStatus;
  locale?: "bn" | "en";
}) {
  const STYLES: Record<ContentStatus, { bg: string; fg: string }> = {
    draft: {
      bg: "var(--md-sys-color-surface-variant)",
      fg: "var(--md-sys-color-on-surface)",
    },
    pending_review: {
      bg: "var(--md-sys-color-tertiary)",
      fg: "var(--md-sys-color-on-tertiary)",
    },
    published: {
      bg: "var(--md-sys-color-secondary)",
      fg: "var(--md-sys-color-on-secondary)",
    },
    rejected: {
      bg: "var(--color-error, #ea4335)",
      fg: "#ffffff",
    },
    archived: {
      bg: "var(--md-sys-color-on-surface-variant)",
      fg: "var(--md-sys-color-surface)",
    },
  };
  const style = STYLES[status] ?? STYLES.draft;
  const label = STATUS_LABELS[status][locale];

  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold"
      style={{ background: style.bg, color: style.fg }}
      data-status={status}
    >
      {label}
    </span>
  );
}

const ACTION_LABELS: Record<WorkflowAction, { bn: string; en: string }> = {
  submit: { bn: "পর্যালোচনায় পাঠান", en: "Submit for review" },
  approve: { bn: "অনুমোদন", en: "Approve & publish" },
  reject: { bn: "প্রত্যাখ্যান", en: "Reject" },
  request_changes: { bn: "সংশোধনের জন্য ফেরত", en: "Request changes" },
  publish: { bn: "এখনই প্রকাশ", en: "Publish now" },
  unpublish: { bn: "প্রকাশনা বাতিল", en: "Unpublish" },
  reopen: { bn: "নতুন করে খুলুন", en: "Reopen" },
  archive: { bn: "আর্কাইভ", en: "Archive" },
};

const ACTION_STYLES: Partial<Record<WorkflowAction, { bg: string; fg: string }>> = {
  approve: { bg: "var(--md-sys-color-secondary)", fg: "var(--md-sys-color-on-secondary)" },
  publish: { bg: "var(--md-sys-color-secondary)", fg: "var(--md-sys-color-on-secondary)" },
  reject: { bg: "var(--color-error, #ea4335)", fg: "#ffffff" },
  unpublish: { bg: "var(--color-error, #ea4335)", fg: "#ffffff" },
};

/** The transition buttons legal for a status+role, per the state machine. */
export function WorkflowActions({
  status,
  role,
  locale = "bn",
  onAction,
  disabled = false,
}: {
  status: ContentStatus;
  role: "reporter" | "moderator" | "admin";
  locale?: "bn" | "en";
  onAction: (action: WorkflowAction) => void;
  disabled?: boolean;
}) {
  const actions = availableActions(status, role);
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="workflow-actions">
      {actions.map((action) => {
        const style = ACTION_STYLES[action];
        return (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => onAction(action)}
            className="rounded-full px-4 py-2 text-sm font-bold transition hover:opacity-90 disabled:opacity-50"
            style={
              style
                ? { background: style.bg, color: style.fg }
                : {
                    background: "var(--md-sys-color-primary)",
                    color: "var(--md-sys-color-on-primary)",
                  }
            }
            data-action={action}
          >
            {ACTION_LABELS[action][locale]}
          </button>
        );
      })}
    </div>
  );
}
