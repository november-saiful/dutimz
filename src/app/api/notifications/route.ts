export const runtime = "edge";

import { NextRequest } from "next/server";

/**
 * GET /api/notifications
 *   → fetch the current user's notifications (newest first).
 * PATCH /api/notifications
 *   → { id } marks one as read; { all: true } marks all as read.
 *
 * Falls back to generating notifications from recent content when the user
 * is not signed in or Supabase is unavailable.
 */

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // No Supabase — generate notifications from recent content.
    return json({ notifications: generateFromRecentContent() });
  }

  // Try to get the current user from cookies.
  const { createServerClient } = await import("@supabase/ssr");
  const cookieStore = request.headers.get("cookie") ?? "";
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.split(";").map((c) => {
          const [name, ...rest] = c.split("=");
          return { name: (name ?? "").trim(), value: rest.join("=") };
        });
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not signed in — generate from recent content.
    return json({ notifications: generateFromRecentContent() });
  }

  // Fetch notifications from the database.
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("Notifications fetch error:", error);
    return json({ notifications: generateFromRecentContent() });
  }

  if (data && data.length > 0) {
    return json({ notifications: data as NotificationRow[] });
  }

  // No notifications in DB yet — generate from recent content as a seed.
  return json({ notifications: generateFromRecentContent() });
}

export async function PATCH(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ ok: true });
  }

  const { createServerClient } = await import("@supabase/ssr");
  const cookieStore = request.headers.get("cookie") ?? "";
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.split(";").map((c) => {
          const [name, ...rest] = c.split("=");
          return { name: (name ?? "").trim(), value: rest.join("=") };
        });
      },
      setAll() {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: true });

  let body: { id?: string; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.all) {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    return json({ ok: true });
  }

  if (body.id) {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", body.id)
      .eq("user_id", user.id);
    return json({ ok: true });
  }

  return json({ error: "Provide `id` or `all: true`" }, { status: 400 });
}

/**
 * Generate notifications from recent published content — used as a fallback
 * when the user is not signed in or the notifications table is empty.
 */
async function generateFromRecentContent(): Promise<NotificationRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return [];

  try {
    const rest =
      `${supabaseUrl}/rest/v1/contents?select=id,slug,title_bn,content_type,is_breaking,published_at` +
      `&status=eq.published&order=published_at.desc&limit=10`;

    const res = await fetch(rest, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!res.ok) return [];
    const items = (await res.json()) as {
      id: string;
      slug: string;
      title_bn: string;
      content_type: string;
      is_breaking: boolean;
      published_at: string;
    }[];

    return items.map((item) => ({
      id: `gen-${item.id}`,
      type: item.is_breaking ? "breaking" : "new_article",
      title: item.is_breaking ? `ব্রেকিং: ${item.title_bn}` : item.title_bn,
      body: null,
      data: { slug: item.slug, content_type: item.content_type },
      is_read: false,
      created_at: item.published_at ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}
