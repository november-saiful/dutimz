import { describe, expect, it } from "vitest";
import { buildHeroItems } from "@/lib/content/hero";
import type { Category, ContentWithRelations } from "@/types";

/** Categories are only ever compared by id here, so a sparse stub will do. */
function category(id: string): Category {
  return { id, slug: id, name_bn: id, name_en: id } as Category;
}

function content(
  id: string,
  categoryId: string | null,
  extra: Partial<ContentWithRelations> = {},
): ContentWithRelations {
  return {
    id,
    slug: id,
    category_id: categoryId,
    category: categoryId ? category(categoryId) : null,
    ...extra,
  } as ContentWithRelations;
}

const ids = (items: ContentWithRelations[]) => items.map((item) => item.id);

const cats = ["c1", "c2", "c3", "c4", "c5", "c6", "c7"].map(category);

describe("buildHeroItems — one story per category", () => {
  it("takes a single story from each category, in category order", () => {
    const latest = cats.map((cat, i) => content(`s${i}`, cat.id));
    const hero = buildHeroItems({ categories: cats, featured: [], latest }, 3);

    expect(ids(hero)).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6"]);
  });

  it("never takes a second story from a category that already has one", () => {
    const latest = [
      content("a1", "c1"),
      content("a2", "c1"),
      content("b1", "c2"),
      content("b2", "c2"),
      content("d1", "c3"),
    ];
    const hero = buildHeroItems({ categories: cats, featured: [], latest }, 3);

    expect(ids(hero)).toEqual(["a1", "b1", "d1"]);
  });

  it("prefers the category's featured pick over its newest story", () => {
    const latest = [content("newest", "c1"), content("other", "c2")];
    const featured = [content("curated", "c1")];

    const hero = buildHeroItems({ categories: cats, featured, latest }, 3);
    expect(hero[0]?.id).toBe("curated");
  });

  it("skips the categories that have no stories yet", () => {
    const latest = [content("a1", "c3"), content("b1", "c5")];
    expect(ids(buildHeroItems({ categories: cats, featured: [], latest }, 2))).toEqual([
      "a1",
      "b1",
    ]);
  });

  it("keeps a story that is both featured and latest only once", () => {
    const story = content("both", "c1");
    const hero = buildHeroItems(
      { categories: cats, featured: [story], latest: [story] },
      3,
    );
    expect(ids(hero)).toEqual(["both"]);
  });
});

describe("buildHeroItems — keeping the ring alive on a thin feed", () => {
  it("tops up from the newest stories when only one category is publishing", () => {
    // The reported case: every published story sits in a single category, so
    // the one-per-category rule alone would hand the reel a single card.
    const latest = ["n1", "n2", "n3", "n4", "n5"].map((id) => content(id, "c2"));

    const hero = buildHeroItems({ categories: cats, featured: [], latest }, 3);

    expect(ids(hero)).toEqual(["n1", "n2", "n3"]);
    expect(new Set(ids(hero)).size).toBe(3);
  });

  it("leaves a one-story site alone — one card is all there is to show", () => {
    const only = content("only", "c1");
    const hero = buildHeroItems({ categories: cats, featured: [], latest: [only] }, 3);

    expect(ids(hero)).toEqual(["only"]);
  });

  it("reaches the floor from the remaining newest stories", () => {
    const latest = [
      content("a1", "c1"),
      content("a2", "c1"),
      content("b1", "c3"),
      content("a3", "c1"),
    ];

    const hero = buildHeroItems({ categories: cats, featured: [], latest }, 5);

    expect(ids(hero)).toEqual(["a1", "b1", "a2", "a3"]);
  });

  it("stops at the floor instead of padding the ring", () => {
    const latest = cats.map((cat, i) => content(`s${i}`, cat.id));
    // Only two categories contributed, so the top-up adds the newest remaining
    // story and then stops — it does not sweep up the rest of the feed.
    const hero = buildHeroItems(
      { categories: [cats[0]!, cats[1]!], featured: [], latest },
      3,
    );

    expect(ids(hero)).toEqual(["s0", "s1", "s2"]);
  });

  it("returns an empty feed untouched", () => {
    expect(buildHeroItems({ categories: cats, featured: [], latest: [] }, 3)).toEqual([]);
  });

  it("never repeats a story, even when the pool runs dry", () => {
    const latest = [content("a1", "c1"), content("a2", "c1")];
    const hero = buildHeroItems({ categories: cats, featured: latest, latest }, 9);

    expect(ids(hero)).toEqual(["a1", "a2"]);
    expect(new Set(ids(hero)).size).toBe(2);
  });
});
