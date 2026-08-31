import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { MIN_CONFIDENCE } from "@/lib/alerts-rules";
import { broadcastTexts } from "@/lib/broadcast-copy";
import {
  BROADCAST_END_AFTER_HOURS,
  applyDailyLimit,
  downwindAdditions,
  fireSeverity,
  fuelLimitedCodes,
  planFireBroadcast,
  targetCommunes,
  type CommuneShape,
} from "@/lib/broadcast-rules";
import { buildBroadcastCap, type BroadcastPhase } from "@/lib/cap";
import { coordLabel, haversineKm } from "@/lib/nadhir";
import { fetchAllPages } from "@/lib/paginate";

import { algiersToday } from "./algiers-date";

export type BroadcastRun = { published: number; suppressed: number };

const OPEN_THREAD_WINDOW_DAYS = 30;
const GEOM_PREFILTER_KM = 80;

type ClusterRow = {
  id: string;
  short_id: string;
  state: string;
  lat: number;
  lon: number;
  confidence: number;
  detection_count: number;
  spread_bearing_deg: number | null;
  last_detected_at: string;
  nearest_settlement_id: string | null;
  nearest_settlement_km: number | null;
  commune_id: string | null;
};

type Unit = {
  id: string;
  code: string;
  name_fr: string;
  parent_id: string | null;
  lat: number;
  lon: number;
};

async function auditRow(row: {
  action: "published" | "suppressed";
  reason: string;
  kind?: string;
  cluster_id?: string | null;
  onm_vigilance_id?: string | null;
  phase?: string;
  severity?: string;
  commune_codes?: string[];
  payload?: Json;
}) {
  const { error } = await supabaseAdmin.from("broadcast_audit").insert(row);
  if (error) throw new Error(`broadcast_audit insert failed: ${error.message}`);
}

export async function publishBroadcasts(): Promise<BroadcastRun> {
  // fail closed: a missing or unreadable kill-switch row must stop publishing
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("broadcast_settings")
    .select("enabled")
    .eq("id", true)
    .single();
  if (settingsError) throw new Error(settingsError.message);

  if (settings.enabled !== true) {
    // one audit row per outage, not one per 15-minute run
    const { data: last } = await supabaseAdmin
      .from("broadcast_audit")
      .select("action, reason")
      .order("at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!(last?.action === "suppressed" && last.reason === "kill_switch"))
      await auditRow({ action: "suppressed", reason: "kill_switch" });
    return { published: 0, suppressed: 1 };
  }

  const windowStart = new Date(
    Date.now() - OPEN_THREAD_WINDOW_DAYS * 86400_000,
  ).toISOString();
  const recent = await fetchAllPages<{
    cluster_id: string | null;
    phase: string;
    severity: string;
    commune_codes: string[];
    created_at: string;
  }>((from, to) =>
    supabaseAdmin
      .from("broadcasts")
      .select("cluster_id, phase, severity, commune_codes, created_at")
      .eq("kind", "fire")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  const latestByCluster = new Map<
    string,
    { phase: string; severity: string; communeCodes: string[] }
  >();
  for (const b of recent) {
    if (!b.cluster_id || latestByCluster.has(b.cluster_id)) continue;
    latestByCluster.set(b.cluster_id, {
      phase: b.phase,
      severity: b.severity,
      communeCodes: b.commune_codes,
    });
  }
  const openClusterIds = [...latestByCluster.entries()]
    .filter(([, b]) => b.phase === "initial" || b.phase === "update")
    .map(([id]) => id);

  const clusterFields =
    "id, short_id, state, lat, lon, confidence, detection_count, spread_bearing_deg, last_detected_at, nearest_settlement_id, nearest_settlement_km, commune_id";
  const { data: confirmed, error: confirmedError } = await supabaseAdmin
    .from("fire_clusters")
    .select(clusterFields)
    .eq("state", "active")
    .gte("confidence", MIN_CONFIDENCE);
  if (confirmedError) throw new Error(confirmedError.message);

  const byId = new Map<string, ClusterRow>(
    (confirmed ?? []).map((c) => [c.id, c]),
  );
  const missingOpen = openClusterIds.filter((id) => !byId.has(id));
  if (missingOpen.length) {
    const { data: openRows, error: openError } = await supabaseAdmin
      .from("fire_clusters")
      .select(clusterFields)
      .in("id", missingOpen);
    if (openError) throw new Error(openError.message);
    for (const c of openRows ?? []) byId.set(c.id, c);
  }
  const clusters = [...byId.values()];
  if (!clusters.length) {
    const relayed =
      (await relayOnmWarnings()) + (await relayAuthorityWarnings());
    return { published: relayed, suppressed: 0 };
  }

  const units = await fetchAllPages<Unit & { level: string }>((from, to) =>
    supabaseAdmin
      .from("admin_units")
      .select("id, code, name_fr, parent_id, lat, lon, level")
      .range(from, to),
  );
  const communes = units.filter((u) => u.level === "commune");
  const unitById = new Map(units.map((u) => [u.id, u]));

  const shortlist = communes.filter((c) =>
    clusters.some(
      (f) => haversineKm(f.lat, f.lon, c.lat, c.lon) <= GEOM_PREFILTER_KM,
    ),
  );
  const geomById = new Map<string, CommuneShape["geom"]>();
  const landcoverById = new Map<
    string,
    Parameters<typeof fuelLimitedCodes>[0][number]["landcover"]
  >();
  for (let i = 0; i < shortlist.length; i += 50) {
    const ids = shortlist.slice(i, i + 50).map((c) => c.id);
    const { data, error } = await supabaseAdmin
      .from("admin_units")
      .select("id, geom, landcover")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      geomById.set(row.id, row.geom as CommuneShape["geom"]);
      landcoverById.set(
        row.id,
        row.landcover as Parameters<
          typeof fuelLimitedCodes
        >[0][number]["landcover"],
      );
    }
  }
  const shapes: (CommuneShape & { id: string })[] = shortlist.map((c) => ({
    id: c.id,
    code: c.code,
    lat: c.lat,
    lon: c.lon,
    geom: geomById.get(c.id) ?? null,
  }));
  const shapeByCode = new Map(shapes.map((s) => [s.code, s]));
  const fuelLimited = fuelLimitedCodes(
    shortlist.map((c) => ({
      code: c.code,
      landcover: landcoverById.get(c.id) ?? null,
    })),
  );

  const settlementIds = clusters
    .map((c) => c.nearest_settlement_id)
    .filter((id): id is string => id !== null);
  const settlementName = new Map<string, string>();
  if (settlementIds.length) {
    const { data } = await supabaseAdmin
      .from("settlements")
      .select("id, name")
      .in("id", settlementIds);
    for (const s of data ?? []) settlementName.set(s.id, s.name);
  }

  const { data: todayRows, error: todayError } = await supabaseAdmin
    .from("broadcasts")
    .select("commune_codes")
    .eq("kind", "fire")
    .in("phase", ["initial", "update"])
    .gte("created_at", `${algiersToday()}T00:00:00+01:00`);
  if (todayError) throw new Error(todayError.message);
  const sentToday = new Map<string, number>();
  for (const row of todayRows ?? [])
    for (const code of row.commune_codes)
      sentToday.set(code, (sentToday.get(code) ?? 0) + 1);

  const chains = new Map<string, { identifier: string; sent: string }[]>();
  const { data: capRows, error: capError } = await supabaseAdmin
    .from("cap_alerts")
    .select("cluster_id, identifier, sent")
    .in(
      "cluster_id",
      clusters.map((c) => c.id),
    )
    .like("identifier", "nadhir-brd-%")
    .order("sent", { ascending: true });
  if (capError) throw new Error(capError.message);
  for (const row of capRows ?? []) {
    if (!row.cluster_id) continue;
    const chain = chains.get(row.cluster_id) ?? [];
    chain.push({ identifier: row.identifier, sent: row.sent });
    chains.set(row.cluster_id, chain);
  }

  let published = 0;
  let suppressed = 0;
  const errors: string[] = [];
  const now = Date.now();

  for (const cluster of clusters) {
    const open = latestByCluster.get(cluster.id) ?? null;
    const severity = fireSeverity(cluster.nearest_settlement_km);
    const targets = targetCommunes(
      {
        lat: cluster.lat,
        lon: cluster.lon,
        communeCode: cluster.commune_id
          ? (unitById.get(cluster.commune_id)?.code ?? null)
          : null,
      },
      shapes,
    );
    const additions = open
      ? downwindAdditions(
          {
            lat: cluster.lat,
            lon: cluster.lon,
            spreadBearing: cluster.spread_bearing_deg,
          },
          open.communeCodes,
          targets,
          shapeByCode,
        )
      : [];

    const plan = planFireBroadcast({
      state: cluster.state,
      confidence: cluster.confidence,
      lastDetectedMs: Date.parse(cluster.last_detected_at),
      nowMs: now,
      severity,
      open,
      targets,
      additions,
      fuelLimited,
    });
    if (!plan) continue;

    // one failing cluster must not silence the clusters after it, nor skip the relays
    try {
      const phase: BroadcastPhase = plan.action;
      const closed = phase === "end" || phase === "cancel";
      const messageSeverity = closed
        ? ((open?.severity ?? severity) as "Extreme" | "Severe")
        : severity;
      const wanted =
        plan.action === "initial" || plan.action === "update"
          ? plan.codes
          : (open?.communeCodes ?? []);
      const { allowed, dropped } = applyDailyLimit(
        wanted,
        sentToday,
        closed || messageSeverity === "Extreme",
      );
      if (!allowed.length) {
        suppressed += 1;
        await auditRow({
          action: "suppressed",
          reason: "rate_limit",
          kind: "fire",
          cluster_id: cluster.id,
          phase,
          severity: messageSeverity,
          commune_codes: dropped,
        });
        continue;
      }

      const commune = cluster.commune_id
        ? unitById.get(cluster.commune_id)
        : null;
      const wilaya = commune?.parent_id
        ? unitById.get(commune.parent_id)
        : null;
      const place =
        (cluster.nearest_settlement_id
          ? settlementName.get(cluster.nearest_settlement_id)
          : null) ??
        commune?.name_fr ??
        coordLabel(cluster.lat, cluster.lon);

      const chain = chains.get(cluster.id) ?? [];
      const cap = buildBroadcastCap({
        shortId: cluster.short_id,
        seq: chain.length + 1,
        phase,
        lat: cluster.lat,
        lon: cluster.lon,
        severity: messageSeverity,
        confidence: cluster.confidence,
        areaDesc:
          [commune?.name_fr, wilaya?.name_fr].filter(Boolean).join(", ") ||
          place,
        sentAt: new Date(),
        texts: broadcastTexts(phase, {
          place,
          wilaya: wilaya?.name_fr ?? "",
          km: cluster.nearest_settlement_km,
          bearingDeg: cluster.spread_bearing_deg,
          hotspots: cluster.detection_count,
          hours: BROADCAST_END_AFTER_HOURS,
        }),
        references: chain,
      });

      const { data: capRow, error: capInsertError } = await supabaseAdmin
        .from("cap_alerts")
        .insert({
          identifier: cap.identifier,
          sender: cap.sender,
          sent: cap.sent,
          status: cap.status,
          msg_type: cap.msgType,
          scope: cap.scope,
          cap_references: cap.references ?? null,
          cluster_id: cluster.id,
          info: cap.info,
        })
        .select("id")
        .single();
      if (capInsertError)
        throw new Error(`cap_alerts insert failed: ${capInsertError.message}`);

      const { error: broadcastError } = await supabaseAdmin
        .from("broadcasts")
        .insert({
          kind: "fire",
          phase,
          cluster_id: cluster.id,
          cap_alert_id: capRow.id,
          severity: messageSeverity,
          commune_codes: allowed,
        });
      if (broadcastError)
        throw new Error(`broadcasts insert failed: ${broadcastError.message}`);

      published += 1;
      if (!closed)
        for (const code of allowed)
          sentToday.set(code, (sentToday.get(code) ?? 0) + 1);
      await auditRow({
        action: "published",
        reason: phase,
        kind: "fire",
        cluster_id: cluster.id,
        phase,
        severity: messageSeverity,
        commune_codes: allowed,
        payload: {
          identifier: cap.identifier,
          ...(dropped.length ? { rate_limited: dropped } : {}),
          ...(phase === "update" && plan.action === "update"
            ? { added: plan.added }
            : {}),
        },
      });
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : `cluster ${cluster.short_id}`,
      );
    }
  }

  published += await relayOnmWarnings();
  published += await relayAuthorityWarnings();

  if (errors.length)
    throw new Error(
      `${errors.length} clusters failed to publish: ${errors[0]}`,
    );

  return { published, suppressed };
}

async function relayAuthorityWarnings(): Promise<number> {
  // recent window: unbounded growth would eventually hit the 1000-row page cap
  const { data: warnings, error } = await supabaseAdmin
    .from("authority_warnings")
    .select("id, severity, wilaya_id, commune_codes")
    .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString());
  if (error) throw new Error(error.message);
  if (!warnings?.length) return 0;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("broadcasts")
    .select("authority_warning_id")
    .eq("kind", "authority")
    .in(
      "authority_warning_id",
      warnings.map((w) => w.id),
    );
  if (existingError) throw new Error(existingError.message);
  const done = new Set((existing ?? []).map((b) => b.authority_warning_id));
  const pending = warnings.filter((w) => !done.has(w.id));
  if (!pending.length) return 0;

  const communes = await fetchAllPages<{
    code: string;
    parent_id: string | null;
  }>((from, to) =>
    supabaseAdmin
      .from("admin_units")
      .select("code, parent_id")
      .eq("level", "commune")
      .range(from, to),
  );
  const codesByWilaya = new Map<string, string[]>();
  for (const c of communes) {
    if (!c.parent_id) continue;
    const bucket = codesByWilaya.get(c.parent_id) ?? [];
    bucket.push(c.code);
    codesByWilaya.set(c.parent_id, bucket);
  }

  let published = 0;
  for (const warning of pending) {
    const codes = warning.commune_codes?.length
      ? warning.commune_codes
      : warning.wilaya_id
        ? (codesByWilaya.get(warning.wilaya_id) ?? [])
        : [];
    if (!codes.length) continue;
    const severity = warning.severity as "Extreme" | "Severe";
    const { error: insertError } = await supabaseAdmin
      .from("broadcasts")
      .insert({
        kind: "authority",
        phase: "initial",
        authority_warning_id: warning.id,
        severity,
        commune_codes: codes,
      });
    if (insertError)
      throw new Error(
        `authority broadcast insert failed: ${insertError.message}`,
      );
    published += 1;
    await auditRow({
      action: "published",
      reason: "authority_relay",
      kind: "authority",
      severity,
      commune_codes: codes,
      payload: { authority_warning_id: warning.id },
    });
  }
  return published;
}

async function relayOnmWarnings(): Promise<number> {
  const { data: warnings, error } = await supabaseAdmin
    .from("onm_vigilance")
    .select("id, severity, wilaya_id, expires")
    .in("severity", ["Severe", "Extreme"])
    .not("wilaya_id", "is", null)
    .or(`expires.is.null,expires.gt.${new Date().toISOString()}`);
  if (error) throw new Error(error.message);
  if (!warnings?.length) return 0;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("broadcasts")
    .select("onm_vigilance_id")
    .eq("kind", "onm")
    .in(
      "onm_vigilance_id",
      warnings.map((w) => w.id),
    );
  if (existingError) throw new Error(existingError.message);
  const done = new Set((existing ?? []).map((b) => b.onm_vigilance_id));
  const pending = warnings.filter((w) => !done.has(w.id));
  if (!pending.length) return 0;

  const communes = await fetchAllPages<{
    code: string;
    parent_id: string | null;
  }>((from, to) =>
    supabaseAdmin
      .from("admin_units")
      .select("code, parent_id")
      .eq("level", "commune")
      .range(from, to),
  );
  const codesByWilaya = new Map<string, string[]>();
  for (const c of communes) {
    if (!c.parent_id) continue;
    const bucket = codesByWilaya.get(c.parent_id) ?? [];
    bucket.push(c.code);
    codesByWilaya.set(c.parent_id, bucket);
  }

  let published = 0;
  for (const warning of pending) {
    const codes = codesByWilaya.get(warning.wilaya_id!) ?? [];
    if (!codes.length) continue;
    const severity = warning.severity as "Extreme" | "Severe";
    const { error: insertError } = await supabaseAdmin
      .from("broadcasts")
      .insert({
        kind: "onm",
        phase: "initial",
        onm_vigilance_id: warning.id,
        severity,
        commune_codes: codes,
      });
    if (insertError)
      throw new Error(`onm broadcast insert failed: ${insertError.message}`);
    published += 1;
    await auditRow({
      action: "published",
      reason: "onm_relay",
      kind: "onm",
      onm_vigilance_id: warning.id,
      severity,
      commune_codes: codes,
    });
  }
  return published;
}
