import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";

import { CurrentCommune } from "@/lib/current-commune";
import { fcmTopic } from "@/lib/fcm";
import type { PushTransport } from "@/lib/push";

export const nativeTransport: PushTransport = {
  async permission() {
    const { receive } = await FirebaseMessaging.checkPermissions();
    return receive === "granted" || receive === "denied" ? receive : "prompt";
  },
  async request() {
    const { receive } = await FirebaseMessaging.requestPermissions();
    return receive === "granted";
  },
  async token() {
    const { token } = await FirebaseMessaging.getToken();
    if (!token) throw new Error("no registration token");
    return token;
  },
  async topics(communes, lang, join) {
    for (const code of communes) {
      const topic = fcmTopic(code, lang);
      if (join) await FirebaseMessaging.subscribeToTopic({ topic });
      else await FirebaseMessaging.unsubscribeFromTopic({ topic });
    }
  },
  async settled(communes, lang) {
    if ((await CurrentCommune.status()).enabled)
      await CurrentCommune.setPinned({ pinned: communes, lang });
  },
};

export function appLink(data: unknown): string | null {
  const link =
    data && typeof data === "object" && "link" in data ? data.link : null;
  return typeof link === "string" &&
    link.startsWith("/") &&
    !link.startsWith("//") &&
    !link.startsWith("/\\")
    ? link
    : null;
}

const CHANNEL = "alerts";

type NativePushOptions = {
  channelName: string;
  navigate: (path: string) => void;
  onToken: () => void;
};

let current: NativePushOptions | null = null;
let listening: Promise<void> | null = null;

function notificationId(key: string) {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

function open(data: unknown) {
  const link = appLink(data);
  if (link) current?.navigate(link);
}

async function listen() {
  await FirebaseMessaging.addListener("notificationActionPerformed", (event) =>
    open(event.notification.data),
  );
  await FirebaseMessaging.addListener("tokenReceived", () =>
    current?.onToken(),
  );
  if (Capacitor.getPlatform() !== "android") return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.addListener(
    "localNotificationActionPerformed",
    (event) => open(event.notification.extra),
  );
  // Android only raises an event for a push that arrives in the foreground
  await FirebaseMessaging.addListener("notificationReceived", (event) => {
    const { notification } = event;
    void LocalNotifications.schedule({
      notifications: [
        {
          id: notificationId(
            notification.tag ?? notification.id ?? String(Date.now()),
          ),
          title: notification.title ?? "",
          body: notification.body ?? "",
          channelId: CHANNEL,
          smallIcon: "ic_stat_nadhir",
          // the exact default opens the "Alarms & reminders" settings screen instead of notifying
          isExactNotification: false,
          extra: notification.data,
        },
      ],
    });
  });
}

export async function startNativePush(options: NativePushOptions) {
  current = options;
  listening ??= listen().catch((error: unknown) => {
    listening = null;
    throw error;
  });
  await listening;
  if (Capacitor.getPlatform() !== "android") return;
  await FirebaseMessaging.createChannel({
    id: CHANNEL,
    name: options.channelName,
    importance: 5,
    visibility: 1,
    vibration: true,
  });
}
