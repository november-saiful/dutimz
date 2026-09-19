import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveContent } from "@/lib/data/contentStore";
import type { Content } from "@/types";

/**
 * A fake PostgREST client covering exactly the calls `saveContent` makes:
 *
 *   contents.select("eq").maybeSingle()
 *   content_revisions.select("version").eq().order().limit().maybeSingle()
 *   content_revisions.insert(row)
 *   contents.update(patch).eq().select().single()
 *
 * `insert` is where the interesting behaviour lives: it can hand back a
 * `23505` unique violation to stand in for a save that raced this one and
 * already claimed the version number.
 */

type Row = Record<string, unknown>;

interface FakeState {
  contents: Row[];
  revisions: Row[];
  /** 1-based insert number that should fail with a unique violation. */
  conflictOnInsert?: number;
  /** Insert error code for every insert (e.g. an RLS/permission failure). */
  failInsertsWith?: string;
  /** What the competing save committed before we retry. */
  onConflict?: (state: FakeState) => void;
}

function makeSupabase(state: FakeState): SupabaseClient {
  let inserts = 0;

  return {
    from(table: string) {
      const filters: Row = {};
      let pendingUpdate: Row | null = null;

      const matching = (): Row[] => {
        const source = table === "contents" ? state.contents : state.revisions;
        return source.filter((row) =>
          Object.entries(filters).every(([column, value]) => row[column] === value),
        );
      };

      const api: Record<string, unknown> = {
        select: () => api,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return api;
        },
        order: () => api,
        limit: () => api,
        insert: (payload: Row) => {
          inserts += 1;
          if (state.failInsertsWith) {
            return { error: { code: state.failInsertsWith, message: "insert rejected" } };
          }
          if (state.conflictOnInsert === inserts) {
            state.onConflict?.(state);
            return {
              error: { code: "23505", message: "duplicate key value violates unique constraint" },
            };
          }
          state.revisions.push({ id: `rev-${state.revisions.length + 1}`, ...payload });
          return { error: null };
        },
        update: (payload: Row) => {
          pendingUpdate = payload;
          return api;
        },
        // Reads that end the chain with an object (single) or null (maybeSingle).
        maybeSingle: async () => {
          if (pendingUpdate) {
            const target = matching()[0];
            if (!target) return { data: null, error: null };
            Object.assign(target, pendingUpdate);
            return { data: { ...target }, error: null };
          }
          if (table === "content_revisions") {
            const rows = matching();
            const newest = rows.reduce<Row | undefined>(
              (best, row) =>
                best === undefined || (row.version as number) > (best.version as number)
                  ? row
                  : best,
              undefined,
            );
            return { data: newest ? { version: newest.version } : null, error: null };
          }
          const row = matching()[0];
          return { data: row ? { ...row } : null, error: null };
        },
        single: async () => {
          const result = await (api.maybeSingle as () => Promise<{ data: Row | null }>)();
          return { data: result.data, error: result.data ? null : { message: "no rows" } };
        },
      };

      return api;
    },
  } as unknown as SupabaseClient;
}

/** A story at `version` with `revisionVersions` already in its history. */
function scenario(version: number, revisionVersions: number[]): FakeState {
  return {
    contents: [
      {
        id: "story-1",
        version,
        status: "draft",
        title_bn: "পুরোনো শিরোনাম",
        body_bn: "<p>পুরোনো</p>",
        content_type: "news",
        content_format: "text",
        published_at: null,
      },
    ],
    revisions: revisionVersions.map((v) => ({
      id: `rev-seed-${v}`,
      content_id: "story-1",
      version: v,
    })),
  };
}

const patch = { title_bn: "নতুন শিরোনাম" } as Partial<Content>;

describe("saveContent — version allocation", () => {
  it("writes one revision and moves the story to the next version", async () => {
    const state = scenario(4, [1, 2, 3, 4]);

    const result = await saveContent(makeSupabase(state), {
      contentId: "story-1",
      patch,
      editorId: "editor-1",
      action: "edit",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.version).toBe(5);
    expect(result.recorded).toBe(true);
    expect(result.content.version).toBe(5);

    const written = state.revisions.at(-1);
    expect(written?.version).toBe(5);
    expect(written?.editor_id).toBe("editor-1");
    expect(written?.changes).toMatchObject({
      action: "edit",
      diff: { title_bn: { from: "পুরোনো শিরোনাম", to: "নতুন শিরোনাম" } },
    });
  });

  it("numbers above the newest revision when the story counter lags behind", async () => {
    // A racing save already stored version 6 while `contents.version` says 4 —
    // taking the maximum is what stops us from claiming 5 and colliding later.
    const state = scenario(4, [4, 6]);

    const result = await saveContent(makeSupabase(state), {
      contentId: "story-1",
      patch,
      editorId: "editor-1",
      action: "edit",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.version).toBe(7);
    const versions = state.revisions.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("retries with a fresh number when another save takes it first", async () => {
    const state = scenario(3, [3]);
    state.conflictOnInsert = 1;
    // The competitor commits version 4 before our retry reads state again.
    state.onConflict = (s) => {
      s.revisions.push({ id: "rev-rival", content_id: "story-1", version: 4 });
      (s.contents[0] as Row).version = 4;
    };

    const result = await saveContent(makeSupabase(state), {
      contentId: "story-1",
      patch,
      editorId: "editor-1",
      action: "edit",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.version).toBe(5);

    const versions = state.revisions.map((r) => r.version);
    expect(versions).toEqual([3, 4, 5]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("gives up with a conflict when every attempt loses the race", async () => {
    const state = scenario(2, [2]);
    state.conflictOnInsert = 1;
    state.onConflict = (s) => {
      s.conflictOnInsert = (s.conflictOnInsert ?? 0) + 1;
    };

    const result = await saveContent(makeSupabase(state), {
      contentId: "story-1",
      patch,
      editorId: "editor-1",
      action: "edit",
      maxAttempts: 2,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: expect.stringContaining("edited elsewhere") as unknown as string,
    });
  });
});

describe("saveContent — what counts as a revision", () => {
  it("records nothing for a field save that changed nothing", async () => {
    const state = scenario(3, [1, 2, 3]);

    const result = await saveContent(makeSupabase(state), {
      contentId: "story-1",
      patch: { title_bn: "পুরোনো শিরোনাম" },
      editorId: "editor-1",
      action: "edit",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recorded).toBe(false);
    expect(state.revisions).toHaveLength(3);
    expect(state.contents[0]?.version).toBe(3);
  });

  it("always records a transition, even with no field change", async () => {
    const state = scenario(3, [1, 2, 3]);

    const result = await saveContent(makeSupabase(state), {
      contentId: "story-1",
      patch: { status: "published" },
      editorId: "moderator-1",
      action: "approve",
      note: "প্রকাশের অনুমোদন",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.version).toBe(4);

    expect(state.revisions.at(-1)?.changes).toMatchObject({
      action: "approve",
      note: "প্রকাশের অনুমোদন",
      diff: { status: { from: "draft", to: "published" } },
    });
    expect(state.contents[0]?.status).toBe("published");
  });
});

describe("saveContent — failure handling", () => {
  it("claims the version before touching the story", async () => {
    // The revision insert fails, so the story must be left exactly as it was:
    // a version bump with no history is worse than a failed save.
    const state = scenario(3, [1, 2, 3]);
    state.failInsertsWith = "42501";

    const result = await saveContent(makeSupabase(state), {
      contentId: "story-1",
      patch,
      editorId: "editor-1",
      action: "edit",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
    expect(state.contents[0]).toMatchObject({ version: 3, title_bn: "পুরোনো শিরোনাম" });
    expect(state.revisions).toHaveLength(3);
  });

  it("reports a missing story instead of inventing history for it", async () => {
    const state: FakeState = { contents: [], revisions: [] };

    const result = await saveContent(makeSupabase(state), {
      contentId: "gone",
      patch,
      editorId: "editor-1",
      action: "edit",
    });

    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(state.revisions).toHaveLength(0);
  });
});
