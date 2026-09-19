"use client";

import { useState, useEffect } from "react";
import { BellIcon, BellRingIcon } from "lucide-react";
import { subscribeToPush, VAPID_PUBLIC_KEY } from "@/lib/notifications/push";

/**
 * A small button that prompts the user to enable push notifications for
 * breaking news. Only shows when the browser supports push and no
 * subscription exists yet.
 */
export function PushSubscribePrompt() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(true); // assume subscribed until proven otherwise

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !VAPID_PUBLIC_KEY) {
      return;
    }
    setSupported(true);
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscribed(!!sub);
      });
    });
  }, []);

  if (!supported || subscribed) return null;

  async function handleSubscribe() {
    const sub = await subscribeToPush();
    if (sub) {
      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      setSubscribed(true);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleSubscribe()}
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition hover:opacity-80"
      style={{ background: "var(--md-sys-color-primary-container)", color: "var(--md-sys-color-on-primary-container)" }}
    >
      <BellRingIcon className="size-4" />
      ব্রেকিং নিউজ বিজ্ঞপ্তি চালু করুন
    </button>
  );
}
