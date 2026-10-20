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

/**
 * Replace this device's topic choices. Works signed-in (rows carry the user
 * id, covered by the owner RLS policy) and anonymous (rows carry a null user
 * id, covered by the anon insert/delete policies). Never throws for missing
 * rows; callers surface real failures to the reader.
 */
export async function saveTopicPrefs(
  token: string,
  topics: string[]
): Promise<void> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getUser();
  const user_id = data.user?.id ?? null;
  const scrub = await sb
    .from("push_topic_prefs")
    .delete()
    .eq("token", token);
  if (scrub.error) throw scrub.error;
  if (topics.length === 0) return;
  const { error } = await sb
    .from("push_topic_prefs")
    .insert(topics.map((topic) => ({ token, topic, user_id })));
  if (error) throw error;
}
