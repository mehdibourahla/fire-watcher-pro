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
  push_claimed_at: string;
};

type PushState = "sent" | "pending" | "failed";

const MAX_ATTEMPTS = 5;
const CLAIM_LOST = "alert push claim lost";

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
  finish: async (row: ClaimedPush, state: PushState) => {
    const { data, error } = await supabaseAdmin
      .from("alerts")
      .update({ push_state: state })
      .eq("id", row.id)
      .eq("push_claimed_at", row.push_claimed_at)
      .select("id");
    if (error) throw new Error(error.message);
    // another run reclaimed this alert after our claim went stale
    if (!data?.length) throw new Error(CLAIM_LOST);
  },
};

export async function drainAlertPushes(
  dependencies: Partial<typeof store> = {},
) {
  const deps = { ...store, ...dependencies };
  if (!deps.configured()) return { pushed: 0, pushFailed: 0, claimsLost: 0 };
  let pushed = 0;
  let pushFailed = 0;
  let claimsLost = 0;
  for (const row of await deps.claim()) {
    let state: PushState = "sent";
    try {
      await deps.send(row);
    } catch {
      pushFailed++;
      state = row.push_attempts >= MAX_ATTEMPTS ? "failed" : "pending";
    }
    try {
      await deps.finish(row, state);
      if (state === "sent") pushed++;
    } catch (failure) {
      if (!(failure instanceof Error && failure.message === CLAIM_LOST))
        throw failure;
      claimsLost++;
    }
  }
  return { pushed, pushFailed, claimsLost };
}
