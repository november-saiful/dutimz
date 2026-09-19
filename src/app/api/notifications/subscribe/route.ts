export const runtime = "edge";

import { json, jsonError, hasSupabase } from "@/lib/data/deskApi";

const mockSubscriptions: PushSubscriptionJSON[] = [];

/**
 * POST /api/notifications/subscribe — Store a push subscription.
 * In Supabase mode, persists to a push_subscriptions table.
 * In mock mode, keeps in-memory (for dev/testing).
 */
export async function POST(request: Request) {
  let body: { subscription?: PushSubscriptionJSON };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  if (!body.subscription) {
    return jsonError("subscription is required");
  }

  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseServerClient();

    // Upsert — one subscription per endpoint
    const endpoint = (body.subscription as Record<string, unknown>).endpoint;
    const { error } = await supabase
      .from("push_subscriptions" as never)
      .upsert(
        { endpoint, subscription: body.subscription, created_at: new Date().toISOString() } as never,
        { onConflict: "endpoint" } as never,
      );

    if (error) {
      // Table might not exist yet — gracefully degrade
      console.warn("push_subscriptions table missing or upsert failed:", error.message);
    }

    return json({ ok: true });
  }

  // Mock mode: store in memory
  mockSubscriptions.push(body.subscription);
  return json({ ok: true });
}

export async function GET() {
  if (hasSupabase()) {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = createSupabaseServerClient();
    const { data } = await supabase
      .from("push_subscriptions" as never)
      .select("subscription");
    return json({ subscriptions: data ?? [] });
  }

  return json({ subscriptions: mockSubscriptions });
}
