import { fcmTopic } from "@/lib/fcm";
import { NATIVE, apiUrl } from "@/lib/platform";

/* Public web-app config for the nadhir-dz Firebase project (not secrets). The
 * config is duplicated in public/firebase-messaging-sw.js; the VAPID key is the
 * project's Web Push certificate, public by design. */
const FIREBASE_WEB_CONFIG = {
  apiKey: "AIzaSyA2claby2DpwxxJ4JKZ6TeJSQXAOnpSyCY",
  authDomain: "nadhir-dz.firebaseapp.com",
  projectId: "nadhir-dz",
  messagingSenderId: "1038175256338",
  appId: "1:1038175256338:web:39579a97bd7e255211bdcb",
};
const VAPID_PUBLIC_KEY =
  "BNSuPFS5kXKkDygPlttxgL2raelotr2S4ilm-lXmV2kc7zSI_DL4x_awEAyIkWvWCgi7hT4haUAOoVxXqt4tGH4";

export type PushSubscriptionState = {
  communes: string[];
  lang: string;
};

const STORAGE_KEY = "nadhir.push.v1";
export const MAX_COMMUNES = 10;

export function pushConfigured(): boolean {
  return Boolean(FIREBASE_WEB_CONFIG.apiKey && VAPID_PUBLIC_KEY);
}

export function pushSupported(): boolean {
  return (
    NATIVE ||
    (typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator)
  );
}

export type PushPermission = "granted" | "denied" | "prompt";

export type PushTransport = {
  permission(): Promise<PushPermission>;
  request(): Promise<boolean>;
  token(): Promise<string>;
  topics(communes: string[], lang: string, join: boolean): Promise<void>;
};

const webTransport: PushTransport = {
  async permission() {
    const state = Notification.permission;
    return state === "default" ? "prompt" : state;
  },
  async request() {
    return (await Notification.requestPermission()) === "granted";
  },
  token: () => registrationToken(),
  async topics(communes, lang, join) {
    await callSubscribeApi(
      await registrationToken(),
      communes,
      lang,
      join ? "subscribe" : "unsubscribe",
    );
  },
};

async function activeTransport(): Promise<PushTransport> {
  if (!NATIVE) return webTransport;
  return (await import("@/lib/push-native")).nativeTransport;
}

export async function requestNotificationPermission(): Promise<PushPermission> {
  const push = await activeTransport();
  await push.request();
  return push.permission();
}

export async function notificationPermission(
  transport?: PushTransport,
): Promise<PushPermission> {
  return (transport ?? (await activeTransport())).permission();
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

export class PushTestError extends Error {
  override name = "PushTestError";
}

export function pushTestErrorKey(status: number) {
  const reason =
    status === 401
      ? "signIn"
      : status === 403
        ? "forbidden"
        : status === 429
          ? "wait"
          : status === 400 || status === 413
            ? "invalid"
            : "unavailable";
  return `sources.pushTestErrors.${reason}`;
}

export async function testPushOnThisDevice(): Promise<string> {
  if (NATIVE || !pushSupported() || Notification.permission !== "granted")
    throw new PushTestError("sources.pushTestErrors.notifications");
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session)
    throw new PushTestError("sources.pushTestErrors.signIn");
  const token = await registrationToken();
  const response = await fetch(apiUrl("/api/private/push-test"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new PushTestError(pushTestErrorKey(response.status));
  return ((await response.json()) as { testId: string }).testId;
}

export async function pushTestArrival(testId: string) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase
    .from("push_test_receipts")
    .select("received_at")
    .eq("id", testId)
    .single();
  if (error) throw new Error(error.message);
  return data.received_at;
}

async function callSubscribeApi(
  token: string,
  communes: string[],
  lang: string,
  action: "subscribe" | "unsubscribe",
): Promise<void> {
  const res = await fetch(apiUrl("/api/public/v1/subscribe"), {
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
  transport?: PushTransport,
): Promise<void> {
  const push = transport ?? (await activeTransport());
  if (!(await push.request())) throw new Error("permission_denied");
  const previous = readSubscription();
  await push.topics(communes, lang, true);
  // drop topics that are no longer selected, or whose language changed
  if (previous) {
    const next = new Set(communes.map((c) => fcmTopic(c, lang)));
    const stale = previous.communes.filter(
      (c) => !next.has(fcmTopic(c, previous.lang)),
    );
    // before writeSubscription: a failure here surfaces and a retry redoes both
    // calls (idempotent), instead of silently leaving stale-language topics live
    if (stale.length) await push.topics(stale, previous.lang, false);
  }
  writeSubscription({ communes, lang });
}

export async function unsubscribeAll(transport?: PushTransport): Promise<void> {
  const current = readSubscription();
  if (!current) return;
  const push = transport ?? (await activeTransport());
  await push.topics(current.communes, current.lang, false);
  writeSubscription(null);
}

/* ADR-0004: the server keeps no per-subscriber state, so the client re-asserts
 * its topics on load — this is also how a rotated FCM token rejoins them. */
export async function syncSubscription(): Promise<void> {
  if (!pushConfigured() || !pushSupported()) return;
  const current = readSubscription();
  if (!current) return;
  const push = await activeTransport();
  if ((await push.permission()) !== "granted") return;
  await push.topics(current.communes, current.lang, true);
}

const USER_PUSH_KEY = "nadhir.userpush.v1";

export function userPushEnabled(): boolean {
  try {
    return localStorage.getItem(USER_PUSH_KEY) === "on";
  } catch {
    return false;
  }
}

async function callUserPush(
  action: "subscribe" | "unsubscribe",
  push: PushTransport,
) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("no_session");
  const token = await push.token();
  const res = await fetch(apiUrl("/api/private/user-push"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ token, action }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `user push failed (${res.status})`);
  }
}

export async function setUserPush(
  enabled: boolean,
  transport?: PushTransport,
): Promise<void> {
  const push = transport ?? (await activeTransport());
  if (enabled && !(await push.request())) throw new Error("permission_denied");
  await callUserPush(enabled ? "subscribe" : "unsubscribe", push);
  try {
    if (enabled) localStorage.setItem(USER_PUSH_KEY, "on");
    else localStorage.removeItem(USER_PUSH_KEY);
  } catch {
    // storage can be unavailable (private mode); the topic membership still holds
  }
}

export async function leaveUserPush(): Promise<void> {
  if (!pushSupported() || !userPushEnabled()) return;
  await setUserPush(false);
}

export async function syncUserPush(): Promise<void> {
  if (!pushConfigured() || !pushSupported() || !userPushEnabled()) return;
  const push = await activeTransport();
  if ((await push.permission()) !== "granted") return;
  await callUserPush("subscribe", push);
}
