import { describe, expect, it } from "vitest";
import {
  MAX_COMMENT_DEPTH,
  mapCommentRow,
  mapCommentRows,
  mapPollRow,
  parsePollOptions,
} from "@/lib/data/publicMappers";

describe("parsePollOptions", () => {
  it("keeps well-formed options and their vote counts", () => {
    expect(
      parsePollOptions([
        { id: "opt-1a", label_bn: "ভালো", label_en: "Good", votes: 3 },
      ]),
    ).toEqual([{ id: "opt-1a", label_bn: "ভালো", label_en: "Good", votes: 3 }]);
  });

  it("accepts a stringified array (legacy rows)", () => {
    expect(
      parsePollOptions('[{"id":"a","label_bn":"ক","label_en":"A","votes":1}]'),
    ).toEqual([{ id: "a", label_bn: "ক", label_en: "A", votes: 1 }]);
  });

  it("defaults a missing vote count to zero", () => {
    const [option] = parsePollOptions([{ id: "a", label_bn: "ক", label_en: "A" }]);
    expect(option?.votes).toBe(0);
  });

  it("generates an id for entries without one and drops junk", () => {
    const parsed = parsePollOptions([{ label_bn: "ক", label_en: "A" }, null, "nope", 7]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe("opt-0");
  });

  it("returns an empty list for unusable input", () => {
    expect(parsePollOptions(null)).toEqual([]);
    expect(parsePollOptions("not json")).toEqual([]);
    expect(parsePollOptions({ id: "a" })).toEqual([]);
  });
});

describe("mapPollRow", () => {
  it("prefers the bilingual columns and falls back to the legacy question", () => {
    const both = mapPollRow({
      id: "p1",
      question: "legacy",
      question_bn: "প্রশ্ন",
      question_en: "Question",
      options: [],
    });
    expect(both.question_bn).toBe("প্রশ্ন");
    expect(both.question_en).toBe("Question");

    const legacy = mapPollRow({ id: "p2", question: "legacy only", options: [] });
    expect(legacy.question_bn).toBe("legacy only");
    expect(legacy.question_en).toBe("legacy only");
  });

  it("sums the option votes into totalVotes", () => {
    const poll = mapPollRow({
      id: "p1",
      question: "q",
      options: [{ id: "a", votes: 2 }, { id: "b", votes: 5 }],
    });
    expect(poll.totalVotes).toBe(7);
  });

  it("exposes ends_at as endsAt and omits absent deadlines", () => {
    expect(mapPollRow({ id: "p", options: [], ends_at: "2030-01-01T00:00:00Z" }).endsAt)
      .toBe("2030-01-01T00:00:00Z");
    expect(mapPollRow({ id: "p", options: [], ends_at: null }).endsAt).toBeUndefined();
  });
});

describe("mapCommentRows", () => {
  it("falls back to the joined profile for the author name and avatar", () => {
    const [comment] = mapCommentRows([
      {
        id: "c1",
        content_id: "k1",
        body: "hi",
        author_name: null,
        author: { username: "reader", display_name: "পাঠক", avatar_url: "https://a/x.png" },
      },
    ]);
    expect(comment?.author_name).toBe("পাঠক");
    expect(comment?.author_avatar).toBe("https://a/x.png");
  });

  it("prefers the stored author_name over the profile", () => {
    const [comment] = mapCommentRows([
      {
        id: "c1",
        content_id: "k1",
        author_name: "Guest Name",
        author: { display_name: "Profile Name" },
      },
    ]);
    expect(comment?.author_name).toBe("Guest Name");
  });

  it("derives depth from the parent chain (the table has no depth column)", () => {
    const rows = [
      { id: "a", content_id: "k1" },
      { id: "b", content_id: "k1", parent_id: "a" },
      { id: "c", content_id: "k1", parent_id: "b" },
      { id: "d", content_id: "k1", parent_id: "c" },
      { id: "e", content_id: "k1", parent_id: "d" },
    ];
    expect(mapCommentRows(rows).map((c) => c.depth)).toEqual([0, 1, 2, 3, MAX_COMMENT_DEPTH]);
  });

  it("treats an orphaned parent as top level and survives a cycle", () => {
    const depths = mapCommentRows([
      { id: "a", content_id: "k1", parent_id: "missing" },
      { id: "b", content_id: "k1", parent_id: "c" },
      { id: "c", content_id: "k1", parent_id: "b" },
    ]).map((c) => c.depth);
    expect(depths[0]).toBe(1);
    expect(depths[1]).toBeLessThanOrEqual(MAX_COMMENT_DEPTH);
    expect(depths[2]).toBeLessThanOrEqual(MAX_COMMENT_DEPTH);
  });

  it("defaults unknown statuses to approved and missing counters to zero", () => {
    const [comment] = mapCommentRows([
      { id: "c1", content_id: "k1", status: "weird", likes: null, dislikes: undefined },
    ]);
    expect(comment?.status).toBe("approved");
    expect(comment?.likes).toBe(0);
    expect(comment?.dislikes).toBe(0);
  });

  it("keeps a valid status untouched", () => {
    const [comment] = mapCommentRows([{ id: "c1", content_id: "k1", status: "spam" }]);
    expect(comment?.status).toBe("spam");
  });

  it("mapCommentRow maps a single row without needing its parent", () => {
    expect(mapCommentRow({ id: "c1", content_id: "k1", body: "x" }).content_id).toBe("k1");
  });
});
