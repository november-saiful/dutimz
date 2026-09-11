import { describe, expect, it } from "vitest";
import { sanitizeArticleHtml, wasSanitized } from "@/lib/content/sanitize";

describe("sanitizeArticleHtml", () => {
  it("keeps legitimate newsroom markup", () => {
    const html =
      "<h2>শিরোনাম</h2><p>লেখা <strong>গুরুত্বপূর্ণ</strong> <em>ঝুঁকি</em>।</p><ul><li>তালিকা</li></ul>";
    expect(sanitizeArticleHtml(html)).toBe(html);
  });

  it("forces safe rel/target on links", () => {
    const clean = sanitizeArticleHtml('<a href="https://example.com">সূত্র</a>');
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it("strips script tags and inline handlers", () => {
    const dirty =
      '<p>ok</p><script>alert(1)</script><img src="https://x.example/i.png" onerror="alert(1)">';
    const clean = sanitizeArticleHtml(dirty);
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onerror");
    expect(clean).toContain("<p>ok</p>");
    expect(clean).toContain("https://x.example/i.png");
  });

  it("strips style attributes and style tags", () => {
    const clean = sanitizeArticleHtml('<p style="color:red">x</p><style>p{}</style>');
    expect(clean).not.toContain("style");
  });

  it("removes iframes and forms", () => {
    const clean = sanitizeArticleHtml('<iframe src="https://evil.example"></iframe><form></form>');
    expect(clean).not.toContain("iframe");
    expect(clean).not.toContain("form");
  });

  it("keeps Bangla language attributes for mixed-script copy", () => {
    const html = '<p lang="bn" dir="auto">বাংলা <span lang="en">English</span></p>';
    const clean = sanitizeArticleHtml(html);
    expect(clean).toContain('lang="bn"');
    expect(clean).toContain('dir="auto"');
    expect(clean).toContain('lang="en"');
  });

  it("blocks javascript: URLs", () => {
    const clean = sanitizeArticleHtml('<a href="javascript:alert(1)">click</a>');
    expect(clean).not.toContain("javascript:");
  });

  it("reports when content was modified", () => {
    expect(wasSanitized("<p>ok</p>")).toBe(false);
    expect(wasSanitized("<p onclick='x()'>ok</p>")).toBe(true);
  });

  it("handles null and empty input", () => {
    expect(sanitizeArticleHtml(null)).toBe("");
    expect(sanitizeArticleHtml("")).toBe("");
    expect(sanitizeArticleHtml(undefined)).toBe("");
  });
});
