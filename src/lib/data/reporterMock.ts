import type {
  Category,
  Content,
  ContentStatus,
  ContentType,
} from "@/types";
import { mockCategories } from "@/lib/data/mock";

/**
 * Mock-mode backing store for the Phase 3 desk (reporter dashboard, editor,
 * review queue). Mirrors the Supabase schema closely enough that swapping the
 * store for real queries is a drop-in change. Rows are module-scoped so the
 * dev server keeps your drafts across navigations.
 */

export interface MockRevisionRow {
  id: string;
  content_id: string;
  editor_id: string;
  editor_name: string;
  changes: Record<string, unknown>;
  version: number;
  created_at: string;
}

interface DeskUser {
  id: string;
  username: string;
  display_name: string;
  role: "reporter" | "moderator" | "admin";
}

export const MOCK_DESK_USER: DeskUser = {
  id: "u-reporter",
  username: "dutimz_reporter",
  display_name: "নমুনা প্রতিবেদক",
  role: "reporter",
};

export const MOCK_MODERATOR: DeskUser = {
  id: "u-moderator",
  username: "dutimz_moderator",
  display_name: "নমুনা সম্পাদক",
  role: "moderator",
};

function iso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function emptyContent(partial: Partial<Content>): Content {
  return {
    id: "c-mock",
    slug: "mock",
    content_type: "news" as ContentType,
    content_format: "text",
    language_primary: "bn",
    title_bn: "",
    subtitle_bn: null,
    excerpt_bn: null,
    body_bn: null,
    title_en: null,
    subtitle_en: null,
    excerpt_en: null,
    body_en: null,
    thumbnail_url: null,
    thumbnail_alt: null,
    featured_image_url: null,
    video_url: null,
    video_duration: null,
    attachments: [],
    category_id: null,
    tags: [],
    author_id: MOCK_DESK_USER.id,
    created_by: MOCK_DESK_USER.id,
    updated_by: MOCK_DESK_USER.id,
    status: "draft" as ContentStatus,
    published_at: null,
    scheduled_at: null,
    view_count: 0,
    read_time: null,
    meta_title: null,
    meta_description: null,
    og_image_url: null,
    is_featured: false,
    is_breaking: false,
    is_commentable: true,
    allow_notifications: true,
    version: 1,
    parent_version_id: null,
    created_at: iso(0),
    updated_at: iso(0),
    ...partial,
  };
}

const SEED_ROWS: Content[] = [
  emptyContent({
    id: "d-1",
    slug: "mock-campus-election-draft",
    title_bn: "ক্যাম্পাস নির্বাচন: ভোটের আগে দাবিতালিকা",
    body_bn:
      "<p>ছাত্র সংসদ নির্বাচন ঘিরে বিভিন্ন প্যানেল শিক্ষার্থীদের কাছে দাবিতালিকা নিয়ে যাচ্ছে। হল সংস্কার, লাইব্রেরি সময় বৃদ্ধি ও পরিবহন ভাতা এবারের প্রধান ইস্যু।</p><p>নির্বাচন কমিশন জানিয়েছে, ভোটগ্রহণ হবে আগামী মাসের প্রথম সপ্তাহে।</p>",
    title_en: "Campus election: demands before the vote",
    excerpt_bn: "হল সংস্কার ও পরিবহন ভাতা এবারের প্রধান দাবি।",
    category_id: mockCategories[0]?.id ?? null,
    tags: ["campus", "election"],
    status: "draft",
    version: 2,
    created_at: iso(60 * 26),
    updated_at: iso(45),
  }),
  emptyContent({
    id: "d-2",
    slug: "mock-lab-equipment-repair",
    title_bn: "পরীক্ষাগারের যন্ত্রপাতি সংস্কারে বরাদ্দ",
    body_bn:
      "<p>বিজ্ঞান অনুষদের পরীক্ষাগারগুলোতে ব্যবহৃত যন্ত্রপাতি সংস্কারে নতুন বরাদ্দ পেয়েছে বিশ্ববিদ্যালয়। রসায়ন ও পদার্থবিজ্ঞান বিভাগের তিনটি ল্যাবে কাজ শুরু হবে এই মাসেই।</p>",
    excerpt_bn: "রসায়ন ও পদার্থবিজ্ঞান ল্যাবে শুরু হবে সংস্কার।",
    category_id: mockCategories[2]?.id ?? null,
    status: "pending_review",
    version: 3,
    created_at: iso(60 * 40),
    updated_at: iso(60 * 5),
  }),
  emptyContent({
    id: "d-3",
    slug: "mock-debate-festival-report",
    title_bn: "আন্তঃবিশ্ববিদ্যালয় বিতর্ক উৎসব শেষ",
    body_bn:
      "<p>দুই দিনের আন্তঃবিশ্ববিদ্যালয় বিতর্ক উৎসবে চ্যাম্পিয়ন হয়েছে স্বাগতিক দল। ফাইনালের বিষয় ছিল ডিজিটাল নিরাপত্তা আইন।</p>",
    excerpt_bn: "চ্যাম্পিয়ন স্বাগতিক দল; ফাইনালের বিষয় ডিজিটাল নিরাপত্তা।",
    thumbnail_url:
      "https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=1200&q=60",
    category_id: mockCategories[4]?.id ?? null,
    status: "published",
    published_at: iso(60 * 30),
    version: 4,
    view_count: 320,
    created_at: iso(60 * 80),
    updated_at: iso(60 * 30),
  }),
  emptyContent({
    id: "d-4",
    slug: "mock-library-hours-note",
    title_bn: "লাইব্রেরির নতুন সময়সূচি (সংশোধনী প্রয়োজন)",
    body_bn: "<p>খসড়া তথ্য যাচাই করা হয়নি।</p>",
    category_id: mockCategories[3]?.id ?? null,
    status: "rejected",
    version: 2,
    created_at: iso(60 * 100),
    updated_at: iso(60 * 20),
  }),
];

const SEED_REVISIONS: MockRevisionRow[] = [
  {
    id: "r-3-1",
    content_id: "d-3",
    editor_id: MOCK_DESK_USER.id,
    editor_name: MOCK_DESK_USER.display_name,
    version: 1,
    created_at: iso(60 * 80),
    changes: {
      diff: { body_bn: { from: null, to: "<p>প্রথম খসড়া।</p>" } },
      snapshot: { fields: { title_bn: "আন্তঃবিশ্ববিদ্যালয় বিতর্ক উৎসব শুরু" }, savedAt: iso(60 * 80) },
      action: "create",
    },
  },
  {
    id: "r-3-2",
    content_id: "d-3",
    editor_id: MOCK_MODERATOR.id,
    editor_name: MOCK_MODERATOR.display_name,
    version: 2,
    created_at: iso(60 * 55),
    changes: {
      diff: { title_bn: { from: "আন্তঃবিশ্ববিদ্যালয় বিতর্ক উৎসব শুরু", to: "আন্তঃবিশ্ববিদ্যালয় বিতর্ক উৎসব শেষ" } },
      action: "approve",
      note: "শিরোনাম সময়ের সাথে আপডেট করা হয়েছে।",
    },
  },
  {
    id: "r-4-1",
    content_id: "d-4",
    editor_id: MOCK_MODERATOR.id,
    editor_name: MOCK_MODERATOR.display_name,
    version: 2,
    created_at: iso(60 * 20),
    changes: {
      diff: { status: { from: "pending_review", to: "rejected" } },
      action: "reject",
      note: "সময়সূচির উৎস যাচাই করে জমা দিন।",
    },
  },
];

// In-memory store shared across route bundles: Next.js dev compiles each
// route handler separately, so module scope alone is not enough — hang the
// store off globalThis so every bundle sees the same rows.
interface MockDeskStore {
  rows: Content[];
  revisions: MockRevisionRow[];
  nextId: number;
}

const globalStore = globalThis as typeof globalThis & {
  __dutimzMockDesk?: MockDeskStore;
};

if (!globalStore.__dutimzMockDesk) {
  globalStore.__dutimzMockDesk = {
    rows: [...SEED_ROWS],
    revisions: [...SEED_REVISIONS],
    nextId: 1,
  };
}

const store = globalStore.__dutimzMockDesk;
const rows: Content[] = store.rows;
const revisions: MockRevisionRow[] = store.revisions;

function genId(): string {
  store.nextId += 1;
  return `d-${Date.now().toString(36)}-${store.nextId}`;
}

export function listMockContents(): Content[] {
  return rows;
}

export function getMockContent(id: string): Content | undefined {
  return rows.find((r) => r.id === id);
}

export function createMockContent(
  partial: Partial<Content> & { title_bn: string },
): Content {
  const now = new Date().toISOString();
  const row = emptyContent({
    ...partial,
    id: genId(),
    slug: partial.slug ?? `mock-${now}`,
    created_at: now,
    updated_at: now,
  });
  rows.unshift(row);
  revisions.push({
    id: genId(),
    content_id: row.id,
    editor_id: MOCK_DESK_USER.id,
    editor_name: MOCK_DESK_USER.display_name,
    version: 1,
    created_at: now,
    changes: {
      diff: { title_bn: { from: null, to: row.title_bn } },
      snapshot: { fields: { body_bn: row.body_bn, title_bn: row.title_bn }, savedAt: now },
      action: "create",
      note: partial.status === "pending_review" ? "সরাসরি জমা" : undefined,
    },
  });
  return row;
}

export function updateMockContent(
  id: string,
  patch: Partial<Content>,
  meta?: { editorName?: string; note?: string; action?: string; bumpVersion?: boolean },
): Content | undefined {
  const row = rows.find((r) => r.id === id);
  if (!row) return undefined;

  const before = { ...row };
  Object.assign(row, patch, { updated_at: new Date().toISOString() });
  const version =
    meta?.bumpVersion === false ? row.version : row.version + 1;
  row.version = version;

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (JSON.stringify(before[key as keyof Content]) !== JSON.stringify(value)) {
      diff[key] = { from: before[key as keyof Content] ?? null, to: value ?? null };
    }
  }

  revisions.push({
    id: genId(),
    content_id: row.id,
    editor_id: meta?.editorName === MOCK_MODERATOR.display_name ? MOCK_MODERATOR.id : MOCK_DESK_USER.id,
    editor_name: meta?.editorName ?? MOCK_DESK_USER.display_name,
    version,
    created_at: row.updated_at,
    changes: {
      diff,
      snapshot: {
        fields: {
          title_bn: row.title_bn,
          body_bn: row.body_bn,
          thumbnail_url: row.thumbnail_url,
          category_id: row.category_id,
        },
        savedAt: row.updated_at,
      },
      action: meta?.action ?? "edit",
      note: meta?.note,
    },
  });

  return row;
}

export function listMockRevisions(contentId: string): MockRevisionRow[] {
  return revisions
    .filter((r) => r.content_id === contentId)
    .sort((a, b) => b.version - a.version);
}

export function getMockRevision(
  contentId: string,
  version: number,
): MockRevisionRow | undefined {
  return revisions.find((r) => r.content_id === contentId && r.version === version);
}

export function resetMockDesk(): void {
  // Mutate the shared arrays in place so every bundle holding a reference
  // (module-level rows/revisions) sees the reset data.
  rows.length = 0;
  rows.push(...SEED_ROWS.map((r) => ({ ...r })));
  revisions.length = 0;
  revisions.push(...SEED_REVISIONS.map((r) => ({ ...r })));
  store.nextId = 1;
}

/** Categories join helper for the mock rows. */
export function mockCategoryFor(content: Content): Category | null {
  return mockCategories.find((c) => c.id === content.category_id) ?? null;
}
