import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";

type AlertRow = { id: string; title: string; body: string; severity: number };

/**
 * Browser alert delivery: while the app is open, new rows in `alerts` for the
 * signed-in user raise a desktop notification (when the user granted permission
 * in settings) and refresh the alerts feed.
 */
export function AlertNotifier() {
  const qc = useQueryClient();

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user || cancelled) return;

      channel = supabase
        .channel(`alerts-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "alerts", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const alert = payload.new as AlertRow;
            void qc.invalidateQueries({ queryKey: ["alerts"] });
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              try {
                new Notification(alert.title, { body: alert.body, tag: alert.id });
              } catch {
                /* notifications unavailable */
              }
            }
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [qc]);

  return null;
}

/** Asks the browser for notification permission; returns the resulting state. */
export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}
