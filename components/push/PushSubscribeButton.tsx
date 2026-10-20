// Push opt-in button — glass-morphism to match the Dutimz design system.
// Only renders in the browser; safe to place in nav/footer or a settings page.
// No props required: wires FCM + Supabase via the lib helpers above.
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  disablePush,
  enablePush,
  isPushSupported,
  type PushTopic,
} from "@/lib/push/firebase-client";
import { removePushToken, savePushToken } from "@/lib/push/supabase-store";

type State = "unsupported" | "off" | "loading" | "on" | "blocked";

export default function PushSubscribeButton({
  topics = [] as PushTopic[],
  className = "",
}: {
  topics?: PushTopic[];
  className?: string;
}) {
  const [state, setState] = useState<State>("off");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported()) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") setState("blocked");
    else if (localStorage.getItem("dutimz-push-token")) setState("on");
  }, []);

  const subscribe = useCallback(async () => {
    setState("loading");
    try {
      const t = await enablePush();
      if (!t) {
        setState(Notification.permission === "denied" ? "blocked" : "off");
        return;
      }
      await savePushToken(t);
      // Topic prefs are enforced server-side at send time: the sender
      // subscribes stored tokens via the FCM topic API (scripts/send-push.mjs).
      void topics;
      localStorage.setItem("dutimz-push-token", t);
      setToken(t);
      setState("on");
    } catch {
      setState("off");
    }
  }, [topics]);

  const unsubscribe = useCallback(async () => {
    setState("loading");
    try {
      const t = token ?? localStorage.getItem("dutimz-push-token");
      if (t) await removePushToken(t).catch(() => undefined);
      await disablePush();
      localStorage.removeItem("dutimz-push-token");
      setToken(null);
      setState("off");
    } catch {
      setState("on");
    }
  }, [token]);

  if (state === "unsupported") return null;

  return (
    <button
      type="button"
      onClick={state === "on" ? unsubscribe : subscribe}
      disabled={state === "loading" || state === "blocked"}
      title={
        state === "blocked"
          ? "Notifications are blocked — allow them in your browser site settings"
          : state === "on"
            ? "Turn off breaking-news push notifications"
            : "Get breaking-news push notifications"
      }
      aria-pressed={state === "on"}
      className={`glass-card inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      style={{
        background: "rgba(255,255,255,0.65)",
        backdropFilter: "blur(20px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.3)",
      }}
    >
      <span aria-hidden>{state === "on" ? "🔕" : "🔔"}</span>
      {state === "loading"
        ? "…"
        : state === "on"
          ? "Push on"
          : state === "blocked"
            ? "Blocked in browser"
            : "Enable push"}
    </button>
  );
}
