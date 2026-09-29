import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return (
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    !supabaseUrl.includes("YOUR_PROJECT_REF")
  );
}

/** Anonymous server-side client for public reads (same role as Pages Functions used). */
export function supabaseServer() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "dutimz-next" } },
  });
}

/** Browser client for signed-in actions (reactions, bookmarks, comments). */
export function supabaseBrowser() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export type DbCategory = { slug: string; title_bn: string };
export type DbProfile = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type Story = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body?: string;
  author_id?: string | null;
  is_anonymous: boolean;
  published_at: string;
  hero_media_key: string | null;
  article_media?: { media_id: string; position: number }[] | null;
  category: DbCategory | DbCategory[] | null;
  profiles: DbProfile | DbProfile[] | null;
};

export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function storyCategory(story: Story): DbCategory {
  return (
    one(story.category) ?? { slug: "campus", title_bn: "ক্যাম্পাস" }
  );
}

export type Credit = { name: string; href: string };

export const ANONYMOUS_BYLINE = "নাম প্রকাশে অনিচ্ছুক";

export function storyCredit(story: Story): Credit {
  const profile = one(story.profiles);
  if (story.is_anonymous || !profile?.username)
    return { name: ANONYMOUS_BYLINE, href: "" };
  const name =
    profile.display_name?.trim() || `@${profile.username || "পাঠক"}`;
  return { name, href: `/u/${encodeURIComponent(profile.username)}/` };
}
