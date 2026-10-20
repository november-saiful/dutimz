// FCM background service worker — served at /firebase-messaging-sw.js
// Uses compat builds so the worker needs NO bundler. Keep the SDK version
// in sync with the `firebase` version in package.json (v11.x).
// Docs: https://firebase.google.com/docs/cloud-messaging/web/receive-messages
//
// SETUP: replace each __FIREBASE_*__ token below with your Firebase web
// config (same values as NEXT_PUBLIC_FIREBASE_* in .env.local). Static SW
// files cannot read process.env at runtime, so the values are inlined.
// The GitHub sender workflow never touches this file.

importScripts(
  "https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
});

const messaging = firebase.messaging();

// Background messages (tab closed): show the notification from payload.
// FCM topic sends that include `notification: {title, body}` display
// automatically; this handler adds click-through link support.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Dutimz";
  const options = {
    body: payload.notification?.body || "",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: { link: payload.fcmOptions?.link || payload.data?.link || "/" },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const win of windows) {
          if (new URL(win.url).pathname === link) return win.focus();
        }
        return clients.openWindow(link);
      })
  );
});
