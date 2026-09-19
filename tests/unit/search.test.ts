import { describe, expect, it } from "vitest";
import {
  parseContentRangeTotal,
  postgrestIlikePattern,
} from "@/lib/content/search";

describe("parseContentRangeTotal", () => {
  it("reads the total out of a PostgREST content-range header", () => {
    expect(parseContentRangeTotal("0-23/57", 0)).toBe(57);
    expect(parseContentRangeTotal("0-0/1", 0)).toBe(1);
    expect(parseContentRangeTotal("*/0", 5)).toBe(0);
  });

  it("falls back when the header is absent or unparseable", () => {
    // Number(undefined) is NaN — a plain `??` would leak NaN into the response.
    expect(parseContentRangeTotal(null, 7)).toBe(7);
    expect(parseContentRangeTotal(undefined, 7)).toBe(7);
    expect(parseContentRangeTotal("garbage", 7)).toBe(7);
  });
});

describe("postgrestIlikePattern", () => {
  it("wraps the term in wildcards and double quotes", () => {
    expect(postgrestIlikePattern("dhaka")).toBe('"%dhaka%"');
  });

  it("keeps reserved logic-tree characters inside the quoted value", () => {
    // Unquoted, a comma or parenthesis would split the or=(...) filter and
    // make PostgREST reject the whole request.
    expect(postgrestIlikePattern("Hossain, Kamal")).toBe('"%Hossain, Kamal%"');
    expect(postgrestIlikePattern("(2026)")).toBe('"%(2026)%"');
    expect(postgrestIlikePattern("a.b:c")).toBe('"%a.b:c%"');
  });

  it("escapes embedded quotes and backslashes", () => {
    expect(postgrestIlikePattern('say "hi"')).toBe('"%say \\"hi\\"%"');
    expect(postgrestIlikePattern("back\\slash")).toBe('"%back\\\\slash%"');
  });
});
