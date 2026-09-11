import { describe, expect, it } from "vitest";
import {
  toBanglaNumerals,
  formatCount,
  formatDate,
  estimateReadTime,
  slugify,
  stripHtml,
  isValidEmail,
} from "@/lib/utils/format";

describe("toBanglaNumerals", () => {
  it("converts Latin digits to Bangla numerals", () => {
    expect(toBanglaNumerals(12345)).toBe("১২৩৪৫");
    expect(toBanglaNumerals("8 September 2026")).toBe("৮ September ২০২৬");
  });

  it("leaves non-digit text intact", () => {
    expect(toBanglaNumerals("abc")).toBe("abc");
  });
});

describe("formatCount", () => {
  it("groups digits and localizes", () => {
    expect(formatCount(1234567, "en")).toBe("1,234,567");
    expect(formatCount(1234567, "bn")).toBe("১,২৩৪,৫৬৭");
  });
});

describe("formatDate", () => {
  it("formats Bangla dates with Bangla numerals and month", () => {
    const d = new Date(2026, 8, 8); // Sep 8 2026
    expect(formatDate(d, "bn")).toBe("৮ সেপ্টেম্বর, ২০২৬");
  });

  it("formats English dates", () => {
    const d = new Date(2026, 8, 8);
    expect(formatDate(d, "en")).toBe("8 September, 2026");
  });
});

describe("estimateReadTime", () => {
  it("returns at least 1 minute", () => {
    expect(estimateReadTime("short")).toBe(1);
  });

  it("estimates from word count", () => {
    const body = Array.from({ length: 600 }, () => "word").join(" ");
    expect(estimateReadTime(body)).toBe(3);
  });

  it("handles empty body", () => {
    expect(estimateReadTime(null)).toBe(0);
  });
});

describe("slugify", () => {
  it("produces SEO slugs", () => {
    expect(slugify("Dhaka University Times — 2026!")).toBe("dhaka-university-times-2026");
  });
});

describe("stripHtml", () => {
  it("strips tags and collapses whitespace", () => {
    expect(stripHtml("<p>Hello   <b>world</b></p>")).toBe("Hello world");
  });
});

describe("isValidEmail", () => {
  it("validates basic emails", () => {
    expect(isValidEmail("reader@dutimz.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});
