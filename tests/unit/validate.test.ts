import { describe, expect, it } from "vitest";
import {
  bodyTextLength,
  bodyWordCount,
  buildSlug,
  isPublishable,
  validateDraft,
  validateForPublish,
} from "@/lib/content/validate";

const longBanglaBody = `<p>${"বাংলা সংবাদ লেখার নমুনা অনুচ্ছেদ। ".repeat(12)}</p>`;

function baseInput(overrides: Partial<Parameters<typeof validateDraft>[0]> = {}) {
  return {
    title_bn: "ঢাকা বিশ্ববিদ্যালয়ে নতুন ঘোষণা",
    body_bn: longBanglaBody,
    title_en: "New announcement at Dhaka University",
    body_en: null,
    content_type: "news" as const,
    content_format: "text" as const,
    thumbnail_url: "https://cdn.example.com/thumb.webp",
    video_url: null,
    ...overrides,
  };
}

describe("validateDraft (lenient)", () => {
  it("accepts a complete draft", () => {
    expect(validateDraft(baseInput())).toEqual([]);
  });

  it("rejects short titles", () => {
    const issues = validateDraft(baseInput({ title_bn: "ছোট" }));
    expect(issues.some((i) => i.field === "title_bn")).toBe(true);
  });

  it("requires a video link or thumbnail for video news", () => {
    const issues = validateDraft(
      baseInput({ content_format: "video", video_url: null, thumbnail_url: null }),
    );
    expect(issues.some((i) => i.field === "video")).toBe(true);
  });
});

describe("validateForPublish (strict)", () => {
  it("accepts a story meeting all minimums", () => {
    expect(validateForPublish(baseInput())).toEqual([]);
    expect(isPublishable(baseInput())).toBe(true);
  });

  it("blocks stories with a thin body", () => {
    const issues = validateForPublish(baseInput({ body_bn: "<p>একটি ছোট লেখা।</p>" }));
    expect(issues.some((i) => i.field === "body_bn")).toBe(true);
    expect(isPublishable(baseInput({ body_bn: "<p>একটি ছোট লেখা।</p>" }))).toBe(false);
  });

  it("blocks stories without a thumbnail", () => {
    const issues = validateForPublish(baseInput({ thumbnail_url: null }));
    expect(issues.some((i) => i.field === "thumbnail")).toBe(true);
  });

  it("measures body length with HTML stripped", () => {
    expect(bodyTextLength("<p>শুধু টেক্সট</p>")).toBe("শুধু টেক্সট".length);
    expect(bodyWordCount("<p>এক দুই তিন চার</p>")).toBe(4);
  });
});

describe("buildSlug", () => {
  it("prefers the English title transliteration (Appendix D)", () => {
    expect(buildSlug("Dhaka University election 2026", "ঢাকা বিশ্ববিদ্যালয় নির্বাচন")).toBe(
      "dhaka-university-election-2026",
    );
  });

  it("falls back to the Bangla title when no English title exists", () => {
    const slug = buildSlug(null, "ঢাকা বিশ্ববিদ্যালয় নির্বাচন");
    expect(slug).toContain("ঢাকা");
  });

  it("always returns a non-empty slug", () => {
    const slug = buildSlug("", "");
    expect(slug.length).toBeGreaterThan(2);
  });
});
