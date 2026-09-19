import { describe, expect, it } from "vitest";
import {
  applyTransition,
  availableActions,
  canFastTrack,
  WorkflowTransitionError,
  STATUS_LABELS,
} from "@/lib/content/workflow";

const reporter = { id: "u1", role: "reporter" as const };
const moderator = { id: "m1", role: "moderator" as const };
const visitor = { id: "v1", role: "visitor" as const };

describe("applyTransition — reporter paths", () => {
  it("submits a draft for review", () => {
    const result = applyTransition("draft", "submit", reporter, 1);
    expect(result.status).toBe("pending_review");
    expect(result.publishedAt).toBeNull();
    expect(result.version).toBe(2);
  });

  it("bumps the version on each accepted transition", () => {
    const first = applyTransition("draft", "submit", reporter, 1);
    const back = applyTransition("pending_review", "request_changes", moderator, first.version);
    expect(back.status).toBe("draft");
    expect(back.version).toBe(3);
  });

  it("rejects illegal transitions", () => {
    expect(() =>
      applyTransition("published", "submit", reporter, 1),
    ).toThrow(WorkflowTransitionError);
    expect(() =>
      applyTransition("draft", "approve", reporter, 1),
    ).toThrow(WorkflowTransitionError);
  });
});

describe("applyTransition — moderator paths", () => {
  it("approves pending_review to published with a timestamp", () => {
    const result = applyTransition("pending_review", "approve", moderator, 3);
    expect(result.status).toBe("published");
    expect(result.publishedAt).not.toBeNull();
    // Going live writes a revision, so it takes the next version.
    expect(result.version).toBe(4);
  });

  it("fast-tracks a draft straight to published", () => {
    const result = applyTransition("draft", "publish", moderator, 2);
    expect(result.status).toBe("published");
    expect(result.version).toBe(3);
  });

  it("publishes a rejected story with a fresh version", () => {
    const result = applyTransition("rejected", "publish", moderator, 7);
    expect(result.status).toBe("published");
    expect(result.version).toBe(8);
  });

  it("rejects pending_review with moderator rights", () => {
    const result = applyTransition("pending_review", "reject", moderator, 2);
    expect(result.status).toBe("rejected");
  });

  it("unpublishes a live story back to draft", () => {
    const result = applyTransition("published", "unpublish", moderator, 5);
    expect(result.status).toBe("draft");
    expect(result.version).toBe(6);
  });

  it("refuses reporter-only roles on moderation actions", () => {
    expect(() =>
      applyTransition("pending_review", "approve", reporter, 1),
    ).toThrowError(/not permitted/);
  });

  it("refuses visitors everywhere", () => {
    for (const action of ["submit", "approve", "reject", "publish"] as const) {
      expect(() =>
        applyTransition("draft", action, visitor, 1),
      ).toThrow(WorkflowTransitionError);
    }
  });
});

describe("applyTransition — version invariant", () => {
  it("advances the version on every transition, publish included", () => {
    // A full career, the way the desks drive it: nothing may repeat a number,
    // because every step writes exactly one revision under it.
    const steps: [Parameters<typeof applyTransition>[0], Parameters<typeof applyTransition>[1]][] = [
      ["draft", "submit"],
      ["pending_review", "request_changes"],
      ["draft", "submit"],
      ["pending_review", "approve"],
      ["published", "unpublish"],
      ["draft", "publish"],
      ["published", "unpublish"],
      ["draft", "submit"],
      ["pending_review", "reject"],
      ["rejected", "reopen"],
      ["draft", "submit"],
      ["pending_review", "approve"],
      ["published", "archive"],
    ];

    const versions: number[] = [];
    let status = "draft" as Parameters<typeof applyTransition>[0];
    let version = 1;
    for (const [from, action] of steps) {
      expect(from).toBe(status);
      const result = applyTransition(from, action, moderator, version);
      versions.push(result.version);
      status = result.status;
      version = result.version;
    }

    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(versions[0]).toBe(2);
  });

  it("never reuses the version it started from", () => {
    for (const action of ["submit", "approve", "reject", "request_changes", "publish", "unpublish", "reopen", "archive"] as const) {
      const from = ({
        submit: "draft",
        approve: "pending_review",
        reject: "pending_review",
        request_changes: "pending_review",
        publish: "draft",
        unpublish: "published",
        reopen: "rejected",
        archive: "published",
      } as const)[action];
      const result = applyTransition(from, action, moderator, 5);
      expect(result.version).toBeGreaterThan(5);
    }
  });
});

describe("availableActions", () => {
  it("gives reporters submit + nothing on drafts", () => {
    expect(availableActions("draft", "reporter")).toEqual(["submit"]);
  });

  it("gives moderators the full decision set on pending stories", () => {
    const actions = availableActions("pending_review", "moderator");
    expect(actions).toContain("approve");
    expect(actions).toContain("reject");
    expect(actions).toContain("request_changes");
  });

  it("gives reporters no actions on published stories", () => {
    expect(availableActions("published", "reporter")).toEqual([]);
  });

  it("lets reporters reopen rejected stories", () => {
    expect(availableActions("rejected", "reporter")).toContain("reopen");
  });
});

describe("canFastTrack", () => {
  it("is true for moderator and admin", () => {
    expect(canFastTrack("moderator")).toBe(true);
    expect(canFastTrack("admin")).toBe(true);
    expect(canFastTrack("reporter")).toBe(false);
  });
});

describe("STATUS_LABELS", () => {
  it("covers every workflow state in both languages", () => {
    for (const status of Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]) {
      expect(STATUS_LABELS[status].bn.length).toBeGreaterThan(0);
      expect(STATUS_LABELS[status].en.length).toBeGreaterThan(0);
    }
  });
});
