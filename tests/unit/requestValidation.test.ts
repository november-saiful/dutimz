import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readJsonBody, validate } from "@/lib/api/validation";
import {
  COMMENT_MAX_LENGTH,
  MAX_SEARCH_LIMIT,
  MAX_UPLOAD_BYTES,
  bookmarkSchema,
  commentReactionSchema,
  createCommentSchema,
  imageUploadSchema,
  newsletterLocale,
  newsletterSubscribeSchema,
  pollVoteSchema,
  searchQuerySchema,
} from "@/lib/api/schemas";

/** Narrow a failed outcome for assertions. */
function failure(outcome: ReturnType<typeof validate>) {
  if (outcome.ok) throw new Error("expected validation to fail");
  return outcome;
}

describe("validate", () => {
  it("returns the parsed value on success", () => {
    const outcome = validate(z.object({ a: z.string().trim() }), { a: " x " });
    expect(outcome).toEqual({ ok: true, data: { a: "x" } });
  });

  it("reports field paths and a 400 for malformed payloads", () => {
    const outcome = failure(
      validate(z.object({ n: z.number() }), { n: "not a number" }),
    );
    expect(outcome.status).toBe(400);
    expect(outcome.issues[0]?.field).toBe("n");
    expect(outcome.error).toBe(outcome.issues[0]?.message);
  });

  it("uses the nested path, not just the leaf name", () => {
    const outcome = failure(
      validate(z.object({ poll: z.object({ id: z.string() }) }), {
        poll: { id: 1 },
      }),
    );
    expect(outcome.issues[0]?.field).toBe("poll.id");
  });

  it("answers 413 when the payload is merely too big", () => {
    const outcome = failure(
      validate(z.object({ body: z.string().max(3) }), { body: "too long" }),
    );
    expect(outcome.status).toBe(413);
  });

  it("labels a root-level failure", () => {
    const outcome = failure(validate(z.string(), 42));
    expect(outcome.issues[0]?.field).toBe("_");
  });
});

describe("readJsonBody", () => {
  it("returns the parsed body", async () => {
    const request = new Request("https://dutimz.test/api", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
    });
    expect(await readJsonBody(request)).toEqual({ ok: true, value: { a: 1 } });
  });

  it("reports unparseable bodies instead of throwing", async () => {
    const request = new Request("https://dutimz.test/api", {
      method: "POST",
      body: "{ not json",
    });
    const outcome = await readJsonBody(request);
    expect(outcome).toEqual({ ok: false, error: "Invalid JSON body" });
  });
});

describe("createCommentSchema", () => {
  it("trims the body and keeps an optional parent", () => {
    const parsed = createCommentSchema.parse({
      contentId: "  story-1  ",
      parentId: "comment-2",
      body: "  দারুণ খবর  ",
    });
    expect(parsed).toMatchObject({
      contentId: "story-1",
      parentId: "comment-2",
      body: "দারুণ খবর",
    });
  });

  it("accepts an explicit null parent (top-level comment)", () => {
    expect(
      createCommentSchema.parse({ contentId: "s1", parentId: null, body: "hi" }).parentId,
    ).toBeNull();
  });

  it("rejects empty and whitespace-only bodies", () => {
    for (const body of ["", "   ", "\n\t"]) {
      expect(createCommentSchema.safeParse({ contentId: "s1", body }).success).toBe(
        false,
      );
    }
  });

  it("caps the body at COMMENT_MAX_LENGTH with a 413", () => {
    const outcome = failure(
      validate(createCommentSchema, {
        contentId: "s1",
        body: "x".repeat(COMMENT_MAX_LENGTH + 1),
      }),
    );
    expect(outcome.status).toBe(413);
  });

  it("rejects a missing content id", () => {
    const outcome = failure(validate(createCommentSchema, { body: "hi" }));
    expect(outcome.error).toBe("A non-empty id is required");
  });
});

describe("commentReactionSchema", () => {
  it("only accepts like or dislike", () => {
    expect(
      commentReactionSchema.safeParse({ commentId: "c1", reaction: "like" }).success,
    ).toBe(true);
    expect(
      commentReactionSchema.safeParse({ commentId: "c1", reaction: "love" }).success,
    ).toBe(false);
  });
});

describe("bookmarkSchema", () => {
  it("requires a non-empty content id", () => {
    expect(bookmarkSchema.safeParse({ contentId: "c1" }).success).toBe(true);
    expect(bookmarkSchema.safeParse({ contentId: "  " }).success).toBe(false);
    expect(bookmarkSchema.safeParse({}).success).toBe(false);
  });
});

describe("newsletterSubscribeSchema", () => {
  it("normalises the address so one human is one row", () => {
    const parsed = newsletterSubscribeSchema.parse({ email: "  Reader@Dutimz.COM " });
    expect(parsed.email).toBe("reader@dutimz.com");
  });

  it("rejects addresses without a domain", () => {
    for (const email of ["reader", "reader@", "reader@dutimz", "@dutimz.com", ""]) {
      expect(newsletterSubscribeSchema.safeParse({ email }).success).toBe(false);
    }
  });

  it("accepts the known locale and defaults to the site default", () => {
    expect(newsletterLocale(newsletterSubscribeSchema.parse({ email: "a@b.com" }))).toBe(
      "bn",
    );
    expect(
      newsletterLocale(newsletterSubscribeSchema.parse({ email: "a@b.com", locale: "bn" })),
    ).toBe("bn");
    expect(
      newsletterSubscribeSchema.safeParse({ email: "a@b.com", locale: "en" }).success,
    ).toBe(false);
    expect(
      newsletterSubscribeSchema.safeParse({ email: "a@b.com", locale: "fr" }).success,
    ).toBe(false);
  });
});

describe("pollVoteSchema", () => {
  it("requires both ids", () => {
    expect(pollVoteSchema.safeParse({ pollId: "p1", optionId: "o1" }).success).toBe(true);
    expect(pollVoteSchema.safeParse({ pollId: "p1" }).success).toBe(false);
  });
});

describe("searchQuerySchema", () => {
  it("defaults and clamps the limit", () => {
    expect(searchQuerySchema.parse({ q: "dhaka" }).limit).toBe(8);
    expect(searchQuerySchema.parse({ q: "dhaka", limit: "3" }).limit).toBe(3);
    expect(searchQuerySchema.parse({ q: "dhaka", limit: "999" }).limit).toBe(
      MAX_SEARCH_LIMIT,
    );
    expect(searchQuerySchema.parse({ q: "dhaka", limit: "0" }).limit).toBe(1);
    expect(searchQuerySchema.parse({ q: "dhaka", limit: "-7" }).limit).toBe(1);
  });

  it("falls back to the default for a non-numeric limit instead of failing", () => {
    expect(searchQuerySchema.parse({ q: "dhaka", limit: "abc" }).limit).toBe(8);
  });

  it("treats empty filter params as absent", () => {
    const parsed = searchQuerySchema.parse({ q: "dhaka", type: "", category: "" });
    expect(parsed.type).toBeNull();
    expect(parsed.category).toBeNull();
  });

  it("requires a query of at least two characters", () => {
    const outcome = failure(validate(searchQuerySchema, { q: "d" }));
    expect(outcome.status).toBe(400);
    expect(outcome.error).toBe("Query must be at least 2 characters");
    expect(validate(searchQuerySchema, {}).ok).toBe(false);
  });
});

describe("imageUploadSchema", () => {
  const png = () => new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });

  it("accepts an allowed image and defaults the folder", () => {
    const parsed = imageUploadSchema.parse({ file: png(), folder: null });
    expect(parsed.folder).toBe("thumbnails");
    expect(parsed.file.name).toBe("photo.png");
  });

  it("keeps an explicit nested folder", () => {
    expect(imageUploadSchema.parse({ file: png(), folder: "reporter/2026" }).folder).toBe(
      "reporter/2026",
    );
  });

  it("rejects a traversal or otherwise odd folder", () => {
    for (const folder of ["../secrets", "a b", ".hidden", "/leading", "a;b"]) {
      const outcome = validate(imageUploadSchema, { file: png(), folder });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.status).toBe(400);
    }
  });

  it("accepts a File that is not `instanceof File` (cross-realm uploads)", () => {
    // Mirrors the edge runtime, whose `request.formData()` hands back a File
    // built by a different constructor than the global one.
    class ForeignFile {
      name = "photo.png";
      type = "image/png";
      size = 3;
    }

    const parsed = imageUploadSchema.parse({ file: new ForeignFile(), folder: null });
    expect(parsed.file.type).toBe("image/png");
  });

  it("rejects a string where a file belongs", () => {
    const outcome = failure(validate(imageUploadSchema, { file: "photo.png" }));
    expect(outcome.error).toBe("No file provided");
  });

  it("rejects a missing file and a disallowed MIME type", () => {
    const missing = failure(validate(imageUploadSchema, { folder: "thumbnails" }));
    expect(missing.error).toBe("No file provided");
    const svg = new File(["<svg/>"], "x.svg", { type: "image/svg+xml" });
    const outcome = failure(validate(imageUploadSchema, { file: svg }));
    expect(outcome.error).toBe("Unsupported file type. Allowed: JPEG, PNG, WebP, AVIF, GIF");
  });

  it("answers 413 for a file over the size cap", () => {
    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.png", {
      type: "image/png",
    });
    const outcome = failure(validate(imageUploadSchema, { file: big }));
    expect(outcome.status).toBe(413);
    expect(outcome.error).toBe("File too large. Maximum size: 10MB");
  });
});
