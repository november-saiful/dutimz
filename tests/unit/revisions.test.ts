import { describe, expect, it } from "vitest";
import {
  buildSnapshot,
  describeRevision,
  diffContents,
  restorePayload,
  revisionPreview,
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
