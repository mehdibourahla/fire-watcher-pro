import { fcmTopic } from "@/lib/fcm";

/* Public web-app config for the nadhir-dz Firebase project (not secrets). The
 * config is duplicated in public/firebase-messaging-sw.js; the VAPID key is the
 * project's Web Push certificate, public by design. */
export const FIREBASE_WEB_CONFIG = {
  apiKey: "AIzaSyA2claby2DpwxxJ4JKZ6TeJSQXAOnpSyCY",
  authDomain: "nadhir-dz.firebaseapp.com",
  projectId: "nadhir-dz",
  messagingSenderId: "1038175256338",
  appId: "1:1038175256338:web:39579a97bd7e255211bdcb",
};
export const VAPID_PUBLIC_KEY =
  "BNSuPFS5kXKkDygPlttxgL2raelotr2S4ilm-lXmV2kc7zSI_DL4x_awEAyIkWvWCgi7hT4haUAOoVxXqt4tGH4";

export type PushSubscriptionState = {
  communes: string[];
  lang: string;
};

const STORAGE_KEY = "nadhir.push.v1";
export const INVITE_SEEN_KEY = "nadhir.push.invited";
export const MAX_COMMUNES = 10;

export function pushConfigured(): boolean {
  return Boolean(FIREBASE_WEB_CONFIG.apiKey && VAPID_PUBLIC_KEY);
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

export function readSubscription(): PushSubscriptionState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PushSubscriptionState;
    return Array.isArray(parsed.communes) && typeof parsed.lang === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function writeSubscription(state: PushSubscriptionState | null) {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage can be unavailable (private mode); subscription still lives in FCM
  }
}

async function registrationToken(): Promise<string> {
  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, getToken } = await import("firebase/messaging");
  // getToken is "deprecated" in favor of FID registration, but topic
  // subscribe/unsubscribe (ADR-0004) only accepts registration tokens.
  // No explicit SW registration: the SDK registers firebase-messaging-sw.js
  // under its own scope, so it cannot displace the root-scope /sw.js.
  const app = getApps()[0] ?? initializeApp(FIREBASE_WEB_CONFIG);
  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_PUBLIC_KEY,
  });
  if (!token) throw new Error("no registration token");
  return token;
}

async function callSubscribeApi(
  token: string,
  communes: string[],
  lang: string,
  action: "subscribe" | "unsubscribe",
): Promise<void> {
  const res = await fetch("/api/public/v1/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, communes, lang, action }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `subscribe API failed (${res.status})`);
  }
}

export async function subscribeToCommunes(
  communes: string[],
  lang: string,
): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission_denied");
  const token = await registrationToken();
  const previous = readSubscription();
  await callSubscribeApi(token, communes, lang, "subscribe");
  // drop topics that are no longer selected, or whose language changed
  if (previous) {
    const next = new Set(communes.map((c) => fcmTopic(c, lang)));
    const stale = previous.communes.filter(
      (c) => !next.has(fcmTopic(c, previous.lang)),
    );
    // before writeSubscription: a failure here surfaces and a retry redoes both
    // calls (idempotent), instead of silently leaving stale-language topics live
    if (stale.length)
      await callSubscribeApi(token, stale, previous.lang, "unsubscribe");
  }
  writeSubscription({ communes, lang });
}

export async function unsubscribeAll(): Promise<void> {
  const current = readSubscription();
  if (!current) return;
  const token = await registrationToken();
  await callSubscribeApi(token, current.communes, current.lang, "unsubscribe");
  writeSubscription(null);
}

/* ADR-0004: the server keeps no per-subscriber state, so the client re-asserts
 * its topics on load — this is also how a rotated FCM token rejoins them. */
export async function syncSubscription(): Promise<void> {
  if (!pushConfigured() || !pushSupported()) return;
  const current = readSubscription();
  if (!current || Notification.permission !== "granted") return;
  const token = await registrationToken();
  await callSubscribeApi(token, current.communes, current.lang, "subscribe");
}
