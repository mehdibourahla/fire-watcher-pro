import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fcmMessageForAlert } from "@/lib/fcm";
import { fcmConfigured, fcmSend } from "@/lib/ingest/fcm.server";

export type ClaimedPush = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  source_id: string | null;
  cluster_id: string | null;
  payload: unknown;
  push_attempts: number;
};

type PushState = "sent" | "pending" | "failed";

const MAX_ATTEMPTS = 5;

const store = {
  configured: fcmConfigured,
  claim: async (): Promise<ClaimedPush[]> => {
    const { data, error } = await supabaseAdmin.rpc("claim_alert_pushes", {
      _limit: 50,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as ClaimedPush[];
  },
  send: (row: ClaimedPush) => fcmSend(fcmMessageForAlert(row)),
  finish: async (id: string, state: PushState) => {
    const { error } = await supabaseAdmin
      .from("alerts")
      .update({ push_state: state })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};

export async function drainAlertPushes(
  dependencies: Partial<typeof store> = {},
) {
  const deps = { ...store, ...dependencies };
  if (!deps.configured()) return { pushed: 0, pushFailed: 0 };
  let pushed = 0;
  let pushFailed = 0;
  for (const row of await deps.claim()) {
    try {
      await deps.send(row);
      await deps.finish(row.id, "sent");
      pushed++;
    } catch {
      pushFailed++;
      await deps.finish(
        row.id,
        row.push_attempts >= MAX_ATTEMPTS ? "failed" : "pending",
      );
    }
  }
  return { pushed, pushFailed };
}
