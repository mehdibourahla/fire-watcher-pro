import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fcmMessagesForFire,
  fcmMessagesForOnm,
  type FcmMessage,
} from "@/lib/fcm";

import { fcmConfigured, fcmSend } from "./fcm.server";

export type DeliveryRun = {
  rows: number;
  sent: number;
  configured: boolean;
};

const RETRY_WINDOW_H = 24;
const FCM_SEND_BUDGET = 500;

type PendingRow = {
  id: string;
  kind: string;
  severity: string;
  commune_codes: string[];
  cluster_id: string | null;
  cap_alert_id: string | null;
  onm_vigilance_id: string | null;
};

async function markSource(ok: boolean, note: string) {
  await supabaseAdmin
    .from("data_sources")
    .update({
      status: ok ? "ok" : "degraded",
      note,
      updated_at: new Date().toISOString(),
      ...(ok ? { last_ok_at: new Date().toISOString() } : {}),
    })
    .eq("name", "broadcast");
}

export async function deliverBroadcasts(): Promise<DeliveryRun> {
  if (!fcmConfigured()) {
    await markSource(
      false,
      "FIREBASE_SERVICE_ACCOUNT not configured — broadcasts stored, none delivered.",
    );
    return { rows: 0, sent: 0, configured: false };
  }

  const windowStart = new Date(
    Date.now() - RETRY_WINDOW_H * 3600_000,
  ).toISOString();
  const { data: pending, error } = await supabaseAdmin
    .from("broadcasts")
    .select(
      "id, kind, severity, commune_codes, cluster_id, cap_alert_id, onm_vigilance_id",
    )
    .is("fcm_delivered_at", null)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!pending?.length) {
    await markSource(true, "No broadcasts pending delivery.");
    return { rows: 0, sent: 0, configured: true };
  }

  const capIds = pending
    .map((p) => p.cap_alert_id)
    .filter((id): id is string => id !== null);
  const infoByCap = new Map<
    string,
    { language: string; headline: string; description: string }[]
  >();
  if (capIds.length) {
    const { data } = await supabaseAdmin
      .from("cap_alerts")
      .select("id, info")
      .in("id", capIds);
    for (const row of data ?? [])
      infoByCap.set(
        row.id,
        row.info as {
          language: string;
          headline: string;
          description: string;
        }[],
      );
  }

  const clusterIds = pending
    .map((p) => p.cluster_id)
    .filter((id): id is string => id !== null);
  const shortIdByCluster = new Map<string, string>();
  if (clusterIds.length) {
    const { data } = await supabaseAdmin
      .from("fire_clusters")
      .select("id, short_id")
      .in("id", clusterIds);
    for (const row of data ?? []) shortIdByCluster.set(row.id, row.short_id);
  }

  const onmIds = pending
    .map((p) => p.onm_vigilance_id)
    .filter((id): id is string => id !== null);
  const onmById = new Map<
    string,
    { title: string; headline_fr: string | null; sent: string }
  >();
  if (onmIds.length) {
    const { data } = await supabaseAdmin
      .from("onm_vigilance")
      .select("id, title, headline_fr, sent")
      .in("id", onmIds);
    for (const row of data ?? []) onmById.set(row.id, row);
  }

  let sent = 0;
  let rowsDone = 0;
  for (const row of pending as PendingRow[]) {
    const messages = messagesFor(row, infoByCap, shortIdByCluster, onmById);
    if (messages === null) continue;
    if (sent + messages.length > FCM_SEND_BUDGET) break;
    for (const message of messages) {
      await fcmSend(message);
      sent += 1;
    }
    const { error: stampError } = await supabaseAdmin
      .from("broadcasts")
      .update({
        fcm_topics: messages.length,
        fcm_delivered_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (stampError) throw new Error(stampError.message);
    rowsDone += 1;
  }

  await markSource(
    true,
    `${sent} topic sends across ${rowsDone} broadcasts this run`,
  );
  return { rows: rowsDone, sent, configured: true };
}

function messagesFor(
  row: PendingRow,
  infoByCap: Map<
    string,
    { language: string; headline: string; description: string }[]
  >,
  shortIdByCluster: Map<string, string>,
  onmById: Map<
    string,
    { title: string; headline_fr: string | null; sent: string }
  >,
): FcmMessage[] | null {
  if (row.kind === "fire") {
    const info = row.cap_alert_id ? infoByCap.get(row.cap_alert_id) : null;
    const shortId = row.cluster_id
      ? shortIdByCluster.get(row.cluster_id)
      : null;
    if (!info || !shortId) return null;
    return fcmMessagesForFire({
      broadcastId: row.id,
      severity: row.severity,
      communeCodes: row.commune_codes,
      shortId,
      info,
    });
  }
  if (row.kind === "onm") {
    const onm = row.onm_vigilance_id ? onmById.get(row.onm_vigilance_id) : null;
    if (!onm) return null;
    return fcmMessagesForOnm({
      broadcastId: row.id,
      severity: row.severity,
      communeCodes: row.commune_codes,
      title: onm.title,
      headlineFr: onm.headline_fr,
      sent: onm.sent,
    });
  }
  return null;
}
