// FCM web-push client — import only from Client Components ("use client").
// Pinned to firebase v11 token API: getToken + onMessage (stable, documented).
// Docs: https://firebase.google.com/docs/cloud-messaging/web/get-started
"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";

export const PUSH_TOPICS = [
  "announcements",
  "breaking",
  "sports",
  "technology",
] as const;
export type PushTopic = (typeof PUSH_TOPICS)[number];

function firebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  };
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window &&
    "PushManager" in window
  );
}

function getApp(): FirebaseApp {
  const apps = getApps();
  return apps.length ? apps[0]! : initializeApp(firebaseConfig());
}

/** Request permission + get FCM token. Must be called from a user click. */
export async function enablePush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  if (Notification.permission === "denied") return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  // Lazy-load messaging so SSR / non-push pages never pull it in.
  const { getMessaging, getToken } = await import("firebase/messaging");
  await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = getMessaging(getApp());
  const token = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!,
  });
  return token || null;
}

/** Delete the current FCM token (unsubscribe on this device). */
export async function disablePush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const { getMessaging, getToken, deleteToken } = await import(
      "firebase/messaging"
    );
    const messaging = getMessaging(getApp());
    const current = await getToken(messaging).catch(() => null);
    if (current) await deleteToken(messaging);
    return true;
  } catch {
    return false;
  }
}

/** Foreground messages (page open): call once in a top-level client effect. */
export async function listenForeground(
  onPayload: (payload: { title?: string; body?: string; link?: string }) => void
): Promise<() => void> {
  const { getMessaging, onMessage } = await import("firebase/messaging");
  const unsubscribe = onMessage(getMessaging(getApp()), (payload) => {
    onPayload({
      title: payload.notification?.title,
      body: payload.notification?.body,
      link:
        payload.fcmOptions?.link ??
        (payload.data?.link as string | undefined),
    });
  });
  return unsubscribe;
}

/** Bengali labels for the topic picker, in PUSH_TOPICS order. */
export const PUSH_TOPIC_LABELS: Record<PushTopic, string> = {
  announcements: "ঘোষণা",
  breaking: "ব্রেকিং নিউজ",
  sports: "খেলাধুলা",
  technology: "প্রযুক্তি",
};

const WELCOME_TITLE = "🎉 অভিনন্দন! বিজ্ঞপ্তি চালু হয়েছে";
const WELCOME_BODY =
  "বাছাই করা বিষয়ে নতুন খবর এলেই আপনি জানতে পারবেন।";

/**
 * The first-run sample notification, shown locally the moment a reader
 * subscribes: it proves the channel works while teaching what it is for.
 * Goes through the registered service worker so it looks exactly like a
 * real push (same icon, same tap-to-open behaviour).
 */
export async function showWelcomeNotification(): Promise<boolean> {
  try {
    if (!isPushSupported() || Notification.permission !== "granted") {
      return false;
    }
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(WELCOME_TITLE, {
      body: WELCOME_BODY,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { link: "/" },
    });
    return true;
  } catch {
    return false;
  }
}
