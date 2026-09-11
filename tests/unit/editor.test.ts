/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  getEditorHtml,
  isBlockCommand,
  countWords,
} from "@/lib/content/editor";
import {
  createMockContent,
  getMockContent,
  getMockRevision,
  listMockContents,
  listMockRevisions,
  resetMockDesk,
  updateMockContent,
} from "@/lib/data/reporterMock";

describe("editor engine", () => {
  it("classifies block commands", () => {
    expect(isBlockCommand("formatBlock:h2")).toBe(true);
    expect(isBlockCommand("bold")).toBe(false);
  });

  it("counts words in mixed Bangla/English text", () => {
    expect(countWords("ঢাকা বিশ্ববিদ্যালয় DU news")).toBe(4);
  });

  it("normalizes editor HTML on read-back", () => {
    const div = document.createElement("div");
    div.innerHTML = '<p>লেখা</p><p> </p><a href="https://example.com" target="_blank">link</a>';
    const html = getEditorHtml(div);
    expect(html).toContain("rel=\"noopener noreferrer\"");
    expect(html).not.toMatch(/<p>\s*<\/p>/);
  });

  it("returns empty string for null editable", () => {
    expect(getEditorHtml(null)).toBe("");
  });
});

describe("mock desk store", () => {
  beforeEach(() => {
    resetMockDesk();
  });

  it("seeds demo rows in every workflow state", () => {
    const statuses = listMockContents().map((r) => r.status);
    expect(statuses).toContain("draft");
    expect(statuses).toContain("pending_review");
    expect(statuses).toContain("published");
    expect(statuses).toContain("rejected");
  });

  it("creates a draft with a create-revision", () => {
    const created = createMockContent({ title_bn: "নতুন খসড়া" });
    expect(created.status).toBe("draft");
    expect(created.version).toBe(1);

    const revisions = listMockRevisions(created.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.changes.action).toBe("create");
  });

  it("bumps version and writes a revision on update", () => {
    const created = createMockContent({ title_bn: "টাইটেল" });
    const updated = updateMockContent(created.id, { title_bn: "নতুন টাইটেল" });
    expect(updated?.version).toBe(2);

    const revisions = listMockRevisions(created.id);
    expect(revisions).toHaveLength(2);
    expect(revisions[0]?.version).toBe(2);
    const diff = revisions[0]?.changes.diff as Record<string, { to: unknown }>;
    expect(diff.title_bn).toBeDefined();
  });

  it("keeps revisions newest-first per story", () => {
    const created = createMockContent({ title_bn: "ইতিহাস" });
    updateMockContent(created.id, { body_bn: "<p>১</p>" });
    updateMockContent(created.id, { body_bn: "<p>২</p>" });

    const versions = listMockRevisions(created.id).map((r) => r.version);
    expect(versions).toEqual([3, 2, 1]);
  });

  it("serves a single revision by version", () => {
    const created = createMockContent({ title_bn: "একক" });
    updateMockContent(created.id, { title_bn: "একক ২" });
    const rev = getMockRevision(created.id, 2);
    const diff = rev?.changes.diff as Record<string, { to: unknown }> | undefined;
    expect(diff?.title_bn?.to).toBe("একক ২");
  });

  it("finds content by id", () => {
    const created = createMockContent({ title_bn: "খোঁজ" });
    expect(getMockContent(created.id)?.title_bn).toBe("খোঁজ");
  });
});
