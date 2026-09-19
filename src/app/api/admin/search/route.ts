export const runtime = "edge";

import { NextRequest } from "next/server";
import { json, jsonError, hasSupabase } from "@/lib/data/deskApi";
import { postgrestIlikePattern } from "@/lib/content/search";
import { getSettings } from "@/lib/data/adminMock";
import {
  listUsers,
  listCategories,
  listTags,
} from "@/lib/data/adminMock";

export interface SearchResult {
  type: "user" | "category" | "tag" | "content";
  id: string;
  title: string;
  subtitle: string;
  tab: string; // which admin tab to navigate to
}

/**
 * GET /api/admin/search?q=... — search across users, categories, tags, and content.
 * Returns grouped results with tab targets for navigation.
 */

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return json({ results: [], query: q ?? "" });
  }

  const query = q.toLowerCase();

  if (hasSupabase()) {
    const { requireAdmin } = await import("@/lib/auth/admin");
    const ctx = await requireAdmin();
    if (!ctx) return jsonError("Admin role required", 403);

    const results: SearchResult[] = [];
    const pattern = postgrestIlikePattern(q);

    // Search users (username, display_name, email)
    const { data: users } = await ctx.supabase
      .from("profiles")
      .select("id, username, display_name, email, role")
      .or(`username.ilike.${pattern},display_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(5);

    if (users) {
      for (const u of users) {
        results.push({
          type: "user",
          id: u.id,
          title: u.display_name ?? u.username,
          subtitle: `${u.email} · ${u.role}`,
          tab: "users",
        });
      }
    }

    // Search categories (name_bn, name_en, slug)
    const { data: categories } = await ctx.supabase
      .from("categories")
      .select("id, name_bn, name_en, slug")
      .or(`name_bn.ilike.${pattern},name_en.ilike.${pattern},slug.ilike.${pattern}`)
      .limit(5);

    if (categories) {
      for (const c of categories) {
        results.push({
          type: "category",
          id: c.id,
          title: `${c.name_bn} / ${c.name_en}`,
          subtitle: c.slug,
          tab: "categories",
        });
      }
    }

    // Search tags (name_bn, name_en, slug)
    const { data: tags } = await ctx.supabase
      .from("tags")
      .select("id, name_bn, name_en, slug")
      .or(`name_bn.ilike.${pattern},name_en.ilike.${pattern},slug.ilike.${pattern}`)
      .limit(5);

    if (tags) {
      for (const t of tags) {
        results.push({
          type: "tag",
          id: t.id,
          title: `${t.name_bn} / ${t.name_en}`,
          subtitle: t.slug,
          tab: "tags",
        });
      }
    }

    // Search content (title_bn, title_en, slug)
    const { data: contents } = await ctx.supabase
      .from("contents")
      .select("id, title_bn, title_en, slug, status, content_type")
      .or(`title_bn.ilike.${pattern},title_en.ilike.${pattern},slug.ilike.${pattern}`)
      .limit(5);

    if (contents) {
      for (const c of contents) {
        const title = c.title_bn || c.title_en || c.slug;
        results.push({
          type: "content",
          id: c.id,
          title,
          subtitle: `${c.content_type} · ${c.status}`,
          tab: "content",
        });
      }
    }

    return json({ results, query: q });
  }

  // Mock mode: search across mock data
  const results: SearchResult[] = [];

  // Search mock users
  const users = listUsers({ search: q, pageSize: 5 });
  for (const u of users.users) {
    results.push({
      type: "user",
      id: u.id,
      title: u.display_name ?? u.username,
      subtitle: `${u.email} · ${u.role}`,
      tab: "users",
    });
  }

  // Search mock categories
  const categories = listCategories();
  for (const c of categories) {
    if (
      c.name_bn.toLowerCase().includes(query) ||
      c.name_en.toLowerCase().includes(query) ||
      c.slug.includes(query)
    ) {
      results.push({
        type: "category",
        id: c.id,
        title: `${c.name_bn} / ${c.name_en}`,
        subtitle: c.slug,
        tab: "categories",
      });
    }
  }

  // Search mock tags
  const tags = listTags(q);
  for (const t of tags.slice(0, 5)) {
    results.push({
      type: "tag",
      id: t.id,
      title: `${t.name_bn} / ${t.name_en}`,
      subtitle: t.slug,
      tab: "tags",
    });
  }

  // Search mock content (import the mock contents)
  const { mockContents } = await import("@/lib/data/mock");
  for (const c of mockContents) {
    if (
      c.title_bn.toLowerCase().includes(query) ||
      (c.title_en ?? "").toLowerCase().includes(query) ||
      c.slug.includes(query)
    ) {
      results.push({
        type: "content",
        id: c.id,
        title: c.title_bn || c.title_en || c.slug,
        subtitle: `${c.content_type} · ${c.status}`,
        tab: "content",
      });
    }
  }

  return json({ results: results.slice(0, 20), query: q });
}
