"use client";

import { useRouter } from "next/navigation";

/**
 * The front page's desk picker. It is a real navigation — the same destination
 * the nav row and the category pages use — so the address bar, the cache and
 * the back button all agree about where the reader ended up.
 */
export function DeskJump({
  sections,
}: {
  sections: { slug: string; label: string }[];
}) {
  const router = useRouter();

  return (
    <select
      className="np-select"
      aria-label="বিভাগ বেছে নিন"
      defaultValue=""
      onChange={(event) => {
        const slug = event.target.value;
        if (!slug) return;
        router.push(slug === "all" ? "/" : `/category/${slug}/`);
      }}
    >
      <option value="" disabled>
        বিভাগ বেছে নিন
      </option>
      {sections.map((section) => (
        <option key={section.slug} value={section.slug}>
          {section.label}
        </option>
      ))}
    </select>
  );
}
