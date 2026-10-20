// Supabase persistence for FCM tokens.
// Uses the app's shared browser singleton (lib/supabase.ts) so sign-in state
// is shared and no extra GoTrue client is created.
// Table: public.push_subscriptions (see supabase/migrations/*push*.sql)
"use client";

import { supabaseBrowser } from "@/lib/supabase";

/** Save/refresh this device's FCM token. Safe to call on every sign-in. */
export async function savePushToken(token: string): Promise<void> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getUser();
  const { error } = await sb.from("push_subscriptions").upsert(
    {
      token,
      user_id: data.user?.id ?? null,
      user_agent:
        typeof navigator !== "undefined"
          ? navigator.userAgent.slice(0, 255)
          : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) throw error;
}

/** Remove this device's token (unsubscribe). Never throws for missing rows. */
export async function removePushToken(token: string): Promise<void> {
  const sb = supabaseBrowser();
  const { error } = await sb
    .from("push_subscriptions")
    .delete()
    .eq("token", token);
  if (error) throw error;
}
