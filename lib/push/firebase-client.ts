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
