import { stripHtml } from "@/lib/utils/format";
import type { Content, ContentRevision } from "@/types";

/**
 * Phase 3 revision history (spec section 3.1, `content_revisions`).
 * Revisions are immutable snapshots: every accepted edit writes one row with
 * a JSONB diff + full snapshot, so restore is a simple update + new revision.
 */

/** Fields tracked by the revision system. */
const TRACKED_FIELDS = [
  "title_bn",
  "subtitle_bn",
  "excerpt_bn",
  "body_bn",
  "title_en",
  "subtitle_en",
  "excerpt_en",
  "body_en",
  "thumbnail_url",
  "thumbnail_alt",
  "video_url",
  "category_id",
  "tags",
] as const;

export type TrackedField = (typeof TRACKED_FIELDS)[number];
export type FieldDiff = Partial<Record<TrackedField, { from: unknown; to: unknown }>>;

export interface RevisionSnapshot {
  fields: Partial<Record<TrackedField, unknown>>;
  savedAt: string;
}

/** Compute a field-level diff between two content states. */
export function diffContents(
  before: Partial<Content>,
  after: Partial<Content>,
): FieldDiff {
  const diff: FieldDiff = {};
  for (const field of TRACKED_FIELDS) {
    const a = before[field] ?? null;
    const b = after[field] ?? null;
    if (!deepEqual(a, b)) {
      diff[field] = { from: a, to: b };
    }
  }
  return diff;
}

/** Extract the snapshot payload persisted inside each revision. */
export function buildSnapshot(content: Partial<Content>): RevisionSnapshot {
  const fields: Record<string, unknown> = {};
  for (const field of TRACKED_FIELDS) {
    const value = content[field];
    if (value !== undefined) {
      // JSONB-safe deep copy (Content.tags is string[]; objects otherwise).
      fields[field] = Array.isArray(value)
        ? [...value]
        : value === null || typeof value !== "object"
          ? value
          : JSON.parse(JSON.stringify(value));
    }
  }
  return { fields, savedAt: new Date().toISOString() } as RevisionSnapshot;
}

/**
 * Read the stored revision payload. Rows persist `{ diff, snapshot, action,
 * note }`; older/mock rows may store the diff at the top level.
 */
function readRevisionPayload(changes: Record<string, unknown> | null | undefined): {
  diff: FieldDiff;
  snapshot?: RevisionSnapshot;
} {
  const raw = (changes ?? {}) as {
    diff?: FieldDiff;
    snapshot?: RevisionSnapshot;
  };
  if (raw.diff || raw.snapshot) return { diff: raw.diff ?? {}, snapshot: raw.snapshot };
  // Fallback: the changes object itself is the diff.
  return { diff: raw as FieldDiff };
}

/** Human-readable summary of a revision row, Bangla/English. */
export function describeRevision(
  revision: Pick<ContentRevision, "changes">,
  locale: "bn" | "en",
): string {
  const diff = readRevisionPayload(revision.changes).diff;
  const fields = Object.keys(diff) as TrackedField[];
  if (fields.length === 0) {
    return locale === "bn" ? "কোনো পরিবর্তন নেই" : "No field changes";
  }
  const labels: Record<TrackedField, { bn: string; en: string }> = {
    title_bn: { bn: "বাংলা শিরোনাম", en: "Bangla title" },
    subtitle_bn: { bn: "বাংলা সাবটাইটেল", en: "Bangla subtitle" },
    excerpt_bn: { bn: "বাংলা সারসংক্ষেপ", en: "Bangla excerpt" },
    body_bn: { bn: "বাংলা মূল লেখা", en: "Bangla body" },
    title_en: { bn: "ইংরেজি শিরোনাম", en: "English title" },
    subtitle_en: { bn: "ইংরেজি সাবটাইটেল", en: "English subtitle" },
    excerpt_en: { bn: "ইংরেজি সারসংক্ষেপ", en: "English excerpt" },
    body_en: { bn: "ইংরেজি মূল লেখা", en: "English body" },
    thumbnail_url: { bn: "থাম্বনেইল", en: "Thumbnail" },
    thumbnail_alt: { bn: "ছবির বিবরণ", en: "Image caption" },
    video_url: { bn: "ভিডিও লিংক", en: "Video link" },
    category_id: { bn: "বিভাগ", en: "Category" },
    tags: { bn: "ট্যাগ", en: "Tags" },
  };
  return fields
    .map((f) => (locale === "bn" ? labels[f].bn : labels[f].en))
    .join(locale === "bn" ? ", " : ", ");
}

/**
 * Body preview of a revision (plain text, ~140 chars) for the history list.
 */
export function revisionPreview(
  revision: Pick<ContentRevision, "changes">,
): string {
  const diff = readRevisionPayload(revision.changes).diff;
  const bodyChange = diff.body_bn?.to ?? diff.body_en?.to;
  if (typeof bodyChange === "string") {
    const text = stripHtml(bodyChange);
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }
  return "";
}

/** Restore payload: the revision's snapshot fields, ready for an UPDATE. */
export function restorePayload(
  revision: Pick<ContentRevision, "changes">,
): Partial<Content> {
  const { diff, snapshot } = readRevisionPayload(revision.changes);
  if (snapshot?.fields && Object.keys(snapshot.fields).length > 0) {
    return snapshot.fields as Partial<Content>;
  }
  // Fallback for diffs stored without a snapshot: take the "to" side.
  const out: Record<string, unknown> = {};
  for (const [field, change] of Object.entries(diff)) {
    out[field] = (change as { to: unknown } | undefined)?.to;
  }
  return out as Partial<Content>;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object") {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.length !== kb.length || !ka.every((k, i) => k === kb[i])) return false;
    return ka.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}
