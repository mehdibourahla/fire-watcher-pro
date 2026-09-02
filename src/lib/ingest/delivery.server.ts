import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fcmMessagesForAuthority,
  fcmMessagesForFire,
  fcmMessagesForOfficial,
  fcmMessagesForOnm,
  type FcmMessage,
} from "@/lib/fcm";
import {
  telegramAuthorityHtml,
  telegramFireHtml,
  telegramOnmHtml,
  telegramSeverityAllowed,
} from "@/lib/telegram";

import { fcmConfigured, fcmSend } from "./fcm.server";
import { sendTelegram, telegramConfigured } from "./telegram.server";

export type DeliveryRun = {
  rows: number;
  sent: number;
  telegramRows: number;
  telegramSent: number;
  telegramChannels: number;
  fcmConfigured: boolean;
  telegramConfigured: boolean;
  disabled: boolean;
};

const RETRY_WINDOW_H = 24;
const FCM_SEND_BUDGET = 500;

type PendingRow = {
  id: string;
  kind: string;
  severity: string;
  commune_codes: string[];
  push_codes: string[];
  cluster_id: string | null;
  cap_alert_id: string | null;
  onm_vigilance_id: string | null;
  authority_warning_id: string | null;
};

type CapText = { language: string; headline: string; description: string };

type DeliveryContext = {
  infoByCap: Map<string, CapText[]>;
  shortIdByCluster: Map<string, string>;
  onmById: Map<string, { title: string; headline_fr: string | null }>;
  authorityById: Map<string, { source: string; body: string }>;
};

async function pendingRows(channelColumn: string): Promise<PendingRow[]> {
  const windowStart = new Date(
    Date.now() - RETRY_WINDOW_H * 3600_000,
  ).toISOString();
  const { data, error } = await supabaseAdmin
    .from("broadcasts")
    .select(
      "id, kind, severity, commune_codes, push_codes, cluster_id, cap_alert_id, onm_vigilance_id, authority_warning_id",
    )
    .is(channelColumn, null)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingRow[];
}

async function loadContext(rows: PendingRow[]): Promise<DeliveryContext> {
  const context: DeliveryContext = {
    infoByCap: new Map(),
    shortIdByCluster: new Map(),
    onmById: new Map(),
    authorityById: new Map(),
  };

  const capIds = rows
    .map((p) => p.cap_alert_id)
    .filter((id): id is string => id !== null);
  if (capIds.length) {
    const { data } = await supabaseAdmin
      .from("cap_alerts")
      .select("id, info")
      .in("id", capIds);
    for (const row of data ?? [])
      context.infoByCap.set(row.id, row.info as CapText[]);
  }

  const clusterIds = rows
    .map((p) => p.cluster_id)
    .filter((id): id is string => id !== null);
  if (clusterIds.length) {
    const { data } = await supabaseAdmin
      .from("fire_clusters")
      .select("id, short_id")
      .in("id", clusterIds);
    for (const row of data ?? [])
      context.shortIdByCluster.set(row.id, row.short_id);
  }

  const onmIds = rows
    .map((p) => p.onm_vigilance_id)
    .filter((id): id is string => id !== null);
  if (onmIds.length) {
    const { data } = await supabaseAdmin
      .from("onm_vigilance")
      .select("id, title, headline_fr")
      .in("id", onmIds);
    for (const row of data ?? []) context.onmById.set(row.id, row);
  }

  const authorityIds = rows
    .map((p) => p.authority_warning_id)
    .filter((id): id is string => id !== null);
  if (authorityIds.length) {
    const { data } = await supabaseAdmin
      .from("authority_warnings")
      .select("id, source, body")
      .in("id", authorityIds);
    for (const row of data ?? []) context.authorityById.set(row.id, row);
  }

  return context;
}

function fcmMessagesFor(
  row: PendingRow,
  context: DeliveryContext,
): FcmMessage[] | null {
  if (row.kind === "fire") {
    const info = row.cap_alert_id
      ? context.infoByCap.get(row.cap_alert_id)
      : null;
    const shortId = row.cluster_id
      ? context.shortIdByCluster.get(row.cluster_id)
      : null;
    if (!info || !shortId) return null;
    return fcmMessagesForFire({
      broadcastId: row.id,
      severity: row.severity,
      communeCodes: row.push_codes,
      shortId,
      info,
    });
  }
  if (row.kind === "onm") {
    const onm = row.onm_vigilance_id
      ? context.onmById.get(row.onm_vigilance_id)
      : null;
    if (!onm) return null;
    return fcmMessagesForOnm({
      broadcastId: row.id,
      severity: row.severity,
      communeCodes: row.push_codes,
      title: onm.title,
      headlineFr: onm.headline_fr,
    });
  }
  if (row.kind === "official") {
    const info = row.cap_alert_id
      ? context.infoByCap.get(row.cap_alert_id)
      : null;
    if (!info) return null;
    return fcmMessagesForOfficial({
      broadcastId: row.id,
      severity: row.severity,
      communeCodes: row.push_codes,
      info,
    });
  }
  if (row.kind === "authority") {
    const warning = row.authority_warning_id
      ? context.authorityById.get(row.authority_warning_id)
      : null;
    if (!warning) return null;
    return fcmMessagesForAuthority({
      broadcastId: row.id,
      severity: row.severity,
      communeCodes: row.push_codes,
      source: warning.source,
      body: warning.body,
    });
  }
  return null;
}

async function deliverFcm(errors: string[]): Promise<{
  rows: number;
  sent: number;
}> {
  const pending = await pendingRows("fcm_delivered_at");
  if (!pending.length) return { rows: 0, sent: 0 };
  const context = await loadContext(pending);

  let sent = 0;
  let rows = 0;
  for (const row of pending) {
    const messages = fcmMessagesFor(row, context);
    if (messages === null) continue;
    if (sent + messages.length > FCM_SEND_BUDGET) break;
    // one persistently rejected row must not silence every other pending alert
    try {
      for (const message of messages) {
        await fcmSend(message);
        sent += 1;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "fcm send failed");
      continue;
    }
    const { error } = await supabaseAdmin
      .from("broadcasts")
      .update({
        fcm_topics: messages.length,
        fcm_delivered_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    rows += 1;
  }
  return { rows, sent };
}

function telegramHtmlFor(
  row: PendingRow,
  context: DeliveryContext,
): string | null {
  if (!telegramSeverityAllowed(row.severity)) return null;
  if (row.kind === "fire") {
    const info = row.cap_alert_id
      ? context.infoByCap.get(row.cap_alert_id)
      : null;
    const shortId = row.cluster_id
      ? context.shortIdByCluster.get(row.cluster_id)
      : null;
    // French block: the wilaya channels are shared surfaces, one language each
    const fr = info?.find((i) => i.language.startsWith("fr")) ?? info?.[0];
    if (!fr || !shortId) return null;
    return telegramFireHtml({
      headline: fr.headline,
      description: fr.description,
      shortId,
    });
  }
  if (row.kind === "onm") {
    const onm = row.onm_vigilance_id
      ? context.onmById.get(row.onm_vigilance_id)
      : null;
    if (!onm) return null;
    return telegramOnmHtml({
      title: onm.title,
      headlineFr: onm.headline_fr,
    });
  }
  if (row.kind === "official") {
    const info = row.cap_alert_id
      ? context.infoByCap.get(row.cap_alert_id)
      : null;
    const block =
      info?.find((i) => i.language.startsWith("fr")) ?? info?.[0] ?? null;
    return block
      ? telegramAuthorityHtml({
          source: block.headline,
          body: block.description,
        })
      : null;
  }
  if (row.kind === "authority") {
    const warning = row.authority_warning_id
      ? context.authorityById.get(row.authority_warning_id)
      : null;
    if (!warning) return null;
    return telegramAuthorityHtml({
      source: warning.source,
      body: warning.body,
    });
  }
  return null;
}

async function deliverTelegram(errors: string[]): Promise<{
  rows: number;
  sent: number;
  channels: number;
}> {
  const { data: channels, error: channelsError } = await supabaseAdmin
    .from("telegram_channels")
    .select("wilaya_id, chat_id");
  if (channelsError) throw new Error(channelsError.message);
  if (!channels?.length) return { rows: 0, sent: 0, channels: 0 };
  const chatByWilaya = new Map(channels.map((c) => [c.wilaya_id, c.chat_id]));

  const pending = await pendingRows("telegram_delivered_at");
  if (!pending.length) return { rows: 0, sent: 0, channels: channels.length };
  const context = await loadContext(pending);

  const { data: communes, error: communesError } = await supabaseAdmin
    .from("admin_units")
    .select("code, parent_id")
    .eq("level", "commune")
    .in("code", [...new Set(pending.flatMap((p) => p.push_codes))]);
  if (communesError) throw new Error(communesError.message);
  const wilayaByCode = new Map(
    (communes ?? []).map((c) => [c.code, c.parent_id]),
  );

  let sent = 0;
  let rows = 0;
  for (const row of pending) {
    const html = telegramHtmlFor(row, context);
    const wilayaIds = html
      ? [
          ...new Set(
            row.push_codes
              .map((code) => wilayaByCode.get(code))
              .filter((id): id is string => Boolean(id)),
          ),
        ]
      : [];
    // distinct chats, not distinct wilayas: several wilayas may share one
    // channel (a national channel maps every wilaya to the same chat)
    const chats = [
      ...new Set(
        wilayaIds
          .map((id) => chatByWilaya.get(id))
          .filter((chat): chat is string => Boolean(chat)),
      ),
    ];
    try {
      for (const chat of chats) {
        await sendTelegram(chat, html!);
        sent += 1;
      }
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "telegram send failed",
      );
      continue;
    }
    // stamped even with zero matching channels: nothing further to deliver
    const { error } = await supabaseAdmin
      .from("broadcasts")
      .update({
        telegram_channels: chats.length,
        telegram_delivered_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    rows += 1;
  }
  return { rows, sent, channels: channels.length };
}

export async function deliverBroadcasts(): Promise<DeliveryRun> {
  // the kill-switch promise is "nothing goes out", so it gates fan-out of
  // already-published rows too, and fails closed like the publisher's gate
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("broadcast_settings")
    .select("enabled")
    .eq("id", true)
    .single();
  if (settingsError) throw new Error(settingsError.message);
  if (settings.enabled !== true) {
    return {
      rows: 0,
      sent: 0,
      telegramRows: 0,
      telegramSent: 0,
      telegramChannels: 0,
      fcmConfigured: fcmConfigured(),
      telegramConfigured: telegramConfigured(),
      disabled: true,
    };
  }

  const errors: string[] = [];
  const fcmOn = fcmConfigured();
  const fcm = fcmOn ? await deliverFcm(errors) : { rows: 0, sent: 0 };

  const telegramOn = telegramConfigured();
  const telegram = telegramOn
    ? await deliverTelegram(errors)
    : { rows: 0, sent: 0, channels: 0 };

  if (errors.length)
    throw new Error(`${errors.length} delivery rows failed: ${errors[0]}`);

  return {
    rows: fcm.rows,
    sent: fcm.sent,
    telegramRows: telegram.rows,
    telegramSent: telegram.sent,
    telegramChannels: telegram.channels,
    fcmConfigured: fcmOn,
    telegramConfigured: telegramOn,
    disabled: false,
  };
}
