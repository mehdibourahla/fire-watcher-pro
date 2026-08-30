export type WebPushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type WebPushNotification = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    url?: string;
    alertId?: string;
    severity?: number;
  };
};

/**
 * Builds standard Web Push notification payload formatted for Nadhir Service Worker.
 */
export function buildPushPayload(notification: WebPushNotification): string {
  return JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: notification.icon ?? "/favicon.svg",
    badge: notification.badge ?? "/favicon.svg",
    tag: notification.data?.alertId ?? "nadhir-alert",
    renotify: true,
    data: {
      url: notification.data?.url ?? "/survival",
      alertId: notification.data?.alertId,
      severity: notification.data?.severity ?? 4,
      timestamp: Date.now(),
    },
  });
}

/**
 * Dispatches Web Push notification to a target browser endpoint.
 */
export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: string,
  _options?: {
    vapidPublicKey?: string;
    vapidPrivateKey?: string;
    vapidSubject?: string;
  },
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  try {
    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        TTL: "86400",
      },
      body: payload,
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok || res.status === 201) {
      return {
        ok: true,
        statusCode: res.status,
      };
    }

    return {
      ok: false,
      statusCode: res.status,
      error: `Push service returned ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "push send failed",
    };
  }
}
