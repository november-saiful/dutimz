import { test, expect } from "@playwright/test";

/**
 * E2E tests for the reporter workflow:
 *   homepage → reporter desk → create draft → edit → slug → publish → public URL
 */

test.describe("Public pages", () => {
  test("homepage loads with content", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("news detail page renders", async ({ page }) => {
    // Navigate to a known mock slug
    await page.goto("/news/mock-debate-festival-report");
    // Should show the article title or 404
    const title = page.locator("h1");
    await expect(title).toBeVisible({ timeout: 10_000 });
  });

  test("category page renders", async ({ page }) => {
    await page.goto("/");
    // Click the first category link if available
    const catLink = page.locator('a[href^="/category/"]').first();
    if (await catLink.isVisible()) {
      await catLink.click();
      await expect(page.locator("h2, h1").first()).toBeVisible();
    }
  });
});

test.describe("Reporter workflow", () => {
  test("reporter desk loads", async ({ page }) => {
    await page.goto("/reporter");
    // Should show the desk heading or login prompt
    await expect(page.locator("text=প্রতিবেদক ডেস্ক").or(page.locator("text=লগইন প্রয়োজন"))).toBeVisible({ timeout: 10_000 });
  });

  test("create new story page loads", async ({ page }) => {
    await page.goto("/reporter/contents/new");
    await expect(page.locator('[data-testid="content-editor"]')).toBeVisible({ timeout: 10_000 });
  });

  test("slug field is required and placed after title", async ({ page }) => {
    await page.goto("/reporter/contents/new");

    // Title field should be first
    const titleInput = page.locator("#ce-title-bn");
    const slugInput = page.locator("#ce-slug");

    await expect(titleInput).toBeVisible();
    await expect(slugInput).toBeVisible();

    // Title should come before slug in the DOM
    const titleBox = await titleInput.boundingBox();
    const slugBox = await slugInput.boundingBox();
    expect(titleBox!.y).toBeLessThan(slugBox!.y);

    // Slug should be required
    await expect(slugInput).toHaveAttribute("required");
  });

  test("slug validation shows error when empty on new content", async ({ page }) => {
    await page.goto("/reporter/contents/new");
    const slug = page.locator("#ce-slug");

    // Type a title to pass title validation
    await page.fill("#ce-title-bn", "টেস্ট খবর");
    await page.fill("#ce-body-bn", "<p>এটি একটি পরীক্ষামূলক খবর। এখানে পর্যাপ্ত পরিমাণে লেখা আছে যাতে প্রকাশের শর্ত পূরণ হয়। আমরা এখানে আরও কিছু বাক্য লিখছি।</p><p>দ্বিতীয় অনুচ্ছেদে আরও বিস্তারিত তথ্য দেওয়া হয়েছে।</p>");

    // Slug field should be empty by default
    await expect(slug).toHaveValue("");

    // The slug required error should be visible (for new content)
    const slugError = page.locator("text=স্লাগ আবশ্যক");
    await expect(slugError).toBeVisible();
  });
});

test.describe("Content display", () => {
  test("article body is justified", async ({ page }) => {
    await page.goto("/news/mock-debate-festival-report");
    const body = page.locator(".prose-bn");
    if (await body.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(body).toHaveCSS("text-align", "justify");
    }
  });

  test("no text-to-speech button on content pages", async ({ page }) => {
    await page.goto("/news/mock-debate-festival-report");
    await page.waitForLoadState("networkidle");
    // The TTS button should not exist
    const ttsButton = page.locator("text=নিবন্ধ শুনুন");
    await expect(ttsButton).not.toBeVisible();
  });
});
