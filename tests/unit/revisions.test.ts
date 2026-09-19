import { describe, expect, it } from "vitest";
import {
  buildRevisionChanges,
  buildSnapshot,
  describeRevision,
  diffContents,
  nextRevisionVersion,
  restorePayload,
  revisionPreview,
  shouldRecordRevision,
} from "@/lib/content/revisions";
import type { Content } from "@/types";

const base: Partial<Content> = {
  title_bn: "পুরোনো শিরোনাম",
  body_bn: "<p>পুরোনো লেখা</p>",
  tags: ["campus"],
  thumbnail_url: null,
};

describe("diffContents", () => {
  it("detects changed tracked fields", () => {
    const diff = diffContents(base, { ...base, title_bn: "নতুন শিরোনাম" });
    expect(Object.keys(diff)).toEqual(["title_bn"]);
    expect(diff.title_bn).toEqual({ from: "পুরোনো শিরোনাম", to: "নতুন শিরোনাম" });
  });

  it("ignores untracked fields like view_count", () => {
    const diff = diffContents(base, { ...base, view_count: 99 });
    expect(Object.keys(diff)).toEqual([]);
  });

  it("deep-compares tag arrays", () => {
    const diff = diffContents(base, { ...base, tags: ["campus", "election"] });
    expect(Object.keys(diff)).toEqual(["tags"]);
    const same = diffContents(base, { ...base, tags: ["campus"] });
    expect(Object.keys(same)).toEqual([]);
  });
});

describe("buildSnapshot", () => {
  it("captures tracked fields JSONB-safe", () => {
    const snap = buildSnapshot(base);
    expect(snap.fields.title_bn).toBe("পুরোনো শিরোনাম");
    expect(snap.fields.tags).toEqual(["campus"]);
    expect(snap.savedAt).toBeTruthy();
  });
});

describe("describeRevision", () => {
  it("lists changed fields in Bangla and English", () => {
    const changes = { changes: { diff: { title_bn: { from: "a", to: "b" }, tags: { from: [], to: ["x"] } } } };
    expect(describeRevision(changes as never, "bn")).toBe("বাংলা শিরোনাম, ট্যাগ");
    expect(describeRevision(changes as never, "en")).toBe("Bangla title, Tags");
  });

  it("handles empty diffs", () => {
    expect(describeRevision({ diff: {} } as never, "en")).toBe("No field changes");
  });
});

describe("revisionPreview", () => {
  it("extracts a plain-text body preview", () => {
    const changes = { changes: { diff: { body_bn: { from: null, to: "<p>প্রথম অনুচ্ছেদ</p>" } } } };
    expect(revisionPreview(changes as never)).toBe("প্রথম অনুচ্ছেদ");
  });

  it("truncates long previews", () => {
    const long = "x".repeat(300);
    const changes = { changes: { diff: { body_bn: { from: null, to: long } } } };
    expect(revisionPreview(changes as never).length).toBeLessThanOrEqual(141);
  });
});

describe("nextRevisionVersion", () => {
  it("steps above the story's current version", () => {
    expect(nextRevisionVersion(1, 1)).toBe(2);
    expect(nextRevisionVersion(4, 4)).toBe(5);
  });

  it("steps above the newest stored revision when the two disagree", () => {
    // A racing save already claimed 5 while `contents.version` still says 4.
    expect(nextRevisionVersion(4, 5)).toBe(6);
    expect(nextRevisionVersion(9, 2)).toBe(10);
  });

  it("never returns a number that is already taken", () => {
    for (const [current, latest] of [
      [0, 0],
      [1, null],
      [null, 3],
      [7, 7],
      [undefined, undefined],
    ] as const) {
      const next = nextRevisionVersion(current, latest);
      expect(next).toBeGreaterThan(Math.max(current ?? 0, latest ?? 0));
    }
  });
});

describe("shouldRecordRevision", () => {
  it("drops a field save that changed nothing", () => {
    expect(shouldRecordRevision("edit", {})).toBe(false);
  });

  it("records a field save that changed something", () => {
    expect(shouldRecordRevision("edit", { title_bn: { from: "a", to: "b" } })).toBe(true);
  });

  it("always records a transition, whose change is the status itself", () => {
    expect(shouldRecordRevision("approve", {})).toBe(true);
    expect(shouldRecordRevision("create", {})).toBe(true);
    expect(shouldRecordRevision("delete", {})).toBe(true);
  });
});

describe("buildRevisionChanges", () => {
  const before: Partial<Content> = { ...base, status: "pending_review" };

  it("diffs fields and includes the status transition", () => {
    const changes = buildRevisionChanges(
      before,
      { ...before, status: "published", title_bn: "নতুন শিরোনাম" },
      { action: "approve", note: "প্রকাশিত" },
    );
    expect(changes.action).toBe("approve");
    expect(changes.note).toBe("প্রকাশিত");
    expect(changes.diff.status).toEqual({ from: "pending_review", to: "published" });
    expect(changes.diff.title_bn).toEqual({ from: "পুরোনো শিরোনাম", to: "নতুন শিরোনাম" });
  });

  it("keeps the status out of the snapshot so restore cannot resurrect it", () => {
    const changes = buildRevisionChanges(
      before,
      { ...before, status: "published" },
      { action: "approve" },
    );
    expect(changes.diff.status).toBeDefined();
    expect(Object.keys(changes.snapshot.fields)).not.toContain("status");
    expect(changes.snapshot.fields.title_bn).toBe("পুরোনো শিরোনাম");
  });

  it("leaves an empty diff for a no-op field save", () => {
    const changes = buildRevisionChanges(before, { ...before }, { action: "edit" });
    expect(changes.diff).toEqual({});
    expect(shouldRecordRevision(changes.action, changes.diff)).toBe(false);
  });

  it("omits an empty note rather than storing undefined", () => {
    const changes = buildRevisionChanges(before, { ...before, title_bn: "x" }, {
      action: "edit",
    });
    expect("note" in changes).toBe(false);
  });
});

describe("describeRevision", () => {
  it("names a status transition", () => {
    const changes = { changes: { diff: { status: { from: "draft", to: "published" } } } };
    expect(describeRevision(changes as never, "en")).toBe("Status");
    expect(describeRevision(changes as never, "bn")).toBe("অবস্থা");
  });
});

describe("restorePayload", () => {
  it("prefers the embedded snapshot", () => {
    const changes = {
      changes: {
        diff: { title_bn: { from: "a", to: "b" } },
        snapshot: { fields: { title_bn: "snapshot title", body_bn: "<p>snap</p>" }, savedAt: "now" },
      },
    };
    const payload = restorePayload(changes as never);
    expect(payload.title_bn).toBe("snapshot title");
    expect(payload.body_bn).toBe("<p>snap</p>");
  });

  it("falls back to diff 'to' values without a snapshot", () => {
    const changes = { changes: { diff: { title_bn: { from: "a", to: "b" } } } };
    expect(restorePayload(changes as never).title_bn).toBe("b");
  });
});
