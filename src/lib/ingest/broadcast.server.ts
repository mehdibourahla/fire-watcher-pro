import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { MIN_CONFIDENCE } from "@/lib/alerts-rules";
import {
  broadcastTexts,
  officialTexts,
  type OfficialVars,
} from "@/lib/broadcast-copy";
import {
  BROADCAST_END_AFTER_HOURS,
  REOPEN_WINDOW_HOURS,
  applyDailyLimit,
  coverageOf,
  downwindAdditions,
  fireSeverity,
  fuelLimitedCodes,
  insideCommunes,
  onmRelayPlan,
  planFireBroadcast,
  pushCodesFor,
  setThreadCoverage,
  targetCommunes,
  type CommuneShape,
  type OnmWarning,
  type OpenThread,
} from "@/lib/broadcast-rules";
import {
  buildBroadcastCap,
  buildOfficialCap,
  type BroadcastPhase,
} from "@/lib/cap";
import { coordLabel, haversineKm } from "@/lib/nadhir";
import { fetchAllPages } from "@/lib/paginate";

import { algiersClock, algiersToday } from "./algiers-date";
import { PIXEL_GRID } from "./fusion-geometry";

export type BroadcastRun = { published: number; suppressed: number };

const OPEN_THREAD_WINDOW_DAYS = 30;
const GEOM_PREFILTER_KM = 80;
const FRESH_DETECTIONS_MIN = 30;
const ONM_RELAYED_LOOKBACK_HOURS = 72;
const HOUR = 3600_000;

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
  max_frp_mw: number | null;
  confirmed_at: string | null;
};

type Unit = {
  id: string;
  code: string;
  name_fr: string;
  name_ar: string;
  name_en: string;
  name_kab: string;
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
    inside_codes: string[];
    created_at: string;
  }>((from, to) =>
    supabaseAdmin
      .from("broadcasts")
      .select(
        "cluster_id, phase, severity, commune_codes, inside_codes, created_at",
      )
      .eq("kind", "fire")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  const now = Date.now();
  const latestByCluster = new Map<string, OpenThread>();
  for (const b of recent) {
    if (!b.cluster_id || latestByCluster.has(b.cluster_id)) continue;
    latestByCluster.set(b.cluster_id, {
      phase: b.phase,
      severity: b.severity,
      communeCodes: b.commune_codes,
      insideCodes: b.inside_codes,
      atMs: Date.parse(b.created_at),
    });
  }
  const openClusterIds = [...latestByCluster.entries()]
    .filter(
      ([, b]) =>
        b.phase === "initial" ||
        b.phase === "update" ||
        (b.phase === "end" && now - b.atMs < REOPEN_WINDOW_HOURS * HOUR),
    )
    .map(([id]) => id);
  const coverage = coverageOf(latestByCluster);

  const clusterFields =
    "id, short_id, state, lat, lon, confidence, detection_count, spread_bearing_deg, last_detected_at, nearest_settlement_id, nearest_settlement_km, commune_id, max_frp_mw, confirmed_at";
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
      (await relayOnmWarnings()) +
      (await relayAuthorityWarnings()) +
      (await relayOfficialIncidents());
    return { published: relayed, suppressed: 0 };
  }

  const units = await fetchAllPages<Unit & { level: string }>((from, to) =>
    supabaseAdmin
      .from("admin_units")
      .select(
        "id, code, name_fr, name_ar, name_en, name_kab, parent_id, lat, lon, level",
      )
      .range(from, to),
  );
  const communes = units.filter((u) => u.level === "commune");
  const unitById = new Map(units.map((u) => [u.id, u]));
  const unitByCode = new Map(units.map((u) => [u.code, u]));
  const nameOf = (
    code: string,
    field: "name_ar" | "name_fr" | "name_en" | "name_kab",
  ) => unitByCode.get(code)?.[field] || unitByCode.get(code)?.name_fr || code;

  const pointsByCluster = new Map<string, { lat: number; lon: number }[]>();
  {
    const ids = clusters.map((c) => c.id);
    const since = new Date(now - FRESH_DETECTIONS_MIN * 60_000).toISOString();
    for (let i = 0; i < ids.length; i += 100) {
      const rows = await fetchAllPages<{
        cluster_id: string;
        lat: number;
        lon: number;
      }>((from, to) =>
        supabaseAdmin
          .from("detections")
          .select("cluster_id, lat, lon")
          .in("cluster_id", ids.slice(i, i + 100))
          .gte("created_at", since)
          .order("id")
          .range(from, to),
      );
      const seen = new Set<string>();
      for (const r of rows) {
        const key = `${r.cluster_id}:${Math.round(r.lat / PIXEL_GRID)}:${Math.round(r.lon / PIXEL_GRID)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const bucket = pointsByCluster.get(r.cluster_id) ?? [];
        bucket.push({ lat: r.lat, lon: r.lon });
        pointsByCluster.set(r.cluster_id, bucket);
      }
    }
  }

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
    .select("push_codes")
    .eq("kind", "fire")
    .in("phase", ["initial", "update"])
    .gte("created_at", `${algiersToday()}T00:00:00+01:00`);
  if (todayError) throw new Error(todayError.message);
  const sentToday = new Map<string, number>();
  for (const row of todayRows ?? [])
    for (const code of row.push_codes)
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
  const errors: string[] = [];

  for (const cluster of clusters) {
    const open = latestByCluster.get(cluster.id) ?? null;
    const severity = fireSeverity(
      cluster.nearest_settlement_km,
      cluster.max_frp_mw,
    );
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
    const inside = insideCommunes(
      pointsByCluster.get(cluster.id) ?? [],
      targets,
      shapeByCode,
    );
    const additions =
      open && (open.phase === "initial" || open.phase === "update")
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
      inside,
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
      const covered =
        plan.action === "initial" || plan.action === "update"
          ? plan.codes
          : (open?.communeCodes ?? []);
      const insideCodes =
        plan.action === "initial" || plan.action === "update"
          ? plan.inside
          : (open?.insideCodes ?? []);
      const rose = pushCodesFor({
        clusterId: cluster.id,
        action: plan.action,
        codes: covered,
        inside: insideCodes,
        previous: open,
        coverage,
      });
      const { allowed: pushed, dropped } = applyDailyLimit(
        rose,
        sentToday,
        closed || messageSeverity === "Extreme",
      );

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
        confirmed: cluster.confirmed_at !== null,
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
          inside: {
            ar: insideCodes.map((code) => nameOf(code, "name_ar")),
            fr: insideCodes.map((code) => nameOf(code, "name_fr")),
            en: insideCodes.map((code) => nameOf(code, "name_en")),
            kab: insideCodes.map((code) => nameOf(code, "name_kab")),
          },
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
          commune_codes: covered,
          push_codes: pushed,
          inside_codes: insideCodes,
        });
      if (broadcastError)
        throw new Error(`broadcasts insert failed: ${broadcastError.message}`);

      published += 1;
      const thread: OpenThread = {
        phase,
        severity: messageSeverity,
        communeCodes: covered,
        insideCodes,
        atMs: now,
      };
      latestByCluster.set(cluster.id, thread);
      setThreadCoverage(coverage, cluster.id, thread);
      if (!closed)
        for (const code of pushed)
          sentToday.set(code, (sentToday.get(code) ?? 0) + 1);
      await auditRow({
        action: "published",
        reason: pushed.length ? phase : "silent",
        kind: "fire",
        cluster_id: cluster.id,
        phase,
        severity: messageSeverity,
        commune_codes: covered,
        payload: {
          identifier: cap.identifier,
          pushed,
          ...(dropped.length ? { rate_limited: dropped } : {}),
          ...(plan.action === "update"
            ? { added: plan.added, inside: plan.inside }
            : {}),
          ...(plan.action === "initial" ? { inside: plan.inside } : {}),
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
  published += await relayOfficialIncidents();

  if (errors.length)
    throw new Error(
      `${errors.length} clusters failed to publish: ${errors[0]}`,
    );

  return { published, suppressed: 0 };
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
        push_codes: codes,
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

const OFFICIAL_FRESH_HOURS = 24;
const OFFICIAL_COVERED_HOURS = 12;

/* Decision 2026-09-02: an incident the authority named and no satellite saw is the one
 * case where the relay beats silence. It carries the bulletin's own "as of", never the
 * push time, and it is skipped when a live thread already put a fire inside that commune. */
async function relayOfficialIncidents(): Promise<number> {
  const since = new Date(
    Date.now() - OFFICIAL_FRESH_HOURS * HOUR,
  ).toISOString();
  const { data: incidents, error } = await supabaseAdmin
    .from("official_incidents")
    .select(
      "id, commune_id, wilaya_id, status, as_of, evidence, unlisted_at, latest_mention_id",
    )
    .not("commune_id", "is", null)
    .is("unlisted_at", null)
    .neq("status", "extinguished")
    .gte("as_of", since);
  if (error) throw new Error(error.message);
  if (!incidents?.length) return 0;

  const { data: already, error: alreadyError } = await supabaseAdmin
    .from("broadcasts")
    .select("official_incident_id")
    .eq("kind", "official")
    .in(
      "official_incident_id",
      incidents.map((i) => i.id),
    );
  if (alreadyError) throw new Error(alreadyError.message);
  const done = new Set((already ?? []).map((b) => b.official_incident_id));
  const pending = incidents.filter((i) => !done.has(i.id));
  if (!pending.length) return 0;

  const units = await fetchAllPages<{
    id: string;
    code: string;
    name_fr: string;
    name_ar: string;
    name_en: string;
    name_kab: string | null;
  }>((from, to) =>
    supabaseAdmin
      .from("admin_units")
      .select("id, code, name_fr, name_ar, name_en, name_kab")
      .range(from, to),
  );
  const unitById = new Map(units.map((u) => [u.id, u]));

  const coveredSince = new Date(
    Date.now() - OFFICIAL_COVERED_HOURS * HOUR,
  ).toISOString();
  const { data: liveThreads, error: liveError } = await supabaseAdmin
    .from("broadcasts")
    .select("inside_codes")
    .eq("kind", "fire")
    .in("phase", ["initial", "update"])
    .gte("created_at", coveredSince);
  if (liveError) throw new Error(liveError.message);
  const covered = new Set(
    (liveThreads ?? []).flatMap((row) => row.inside_codes ?? []),
  );

  const sourceLabel = new Map<string, string>();
  const mentionIds = pending
    .map((i) => i.latest_mention_id)
    .filter((id): id is string => id !== null);
  if (mentionIds.length) {
    const { data } = await supabaseAdmin
      .from("incident_mentions")
      .select("id, text_sources(label)")
      .in("id", mentionIds);
    for (const row of data ?? [])
      if (row.text_sources?.label)
        sourceLabel.set(row.id, row.text_sources.label);
  }

  let published = 0;
  for (const incident of pending) {
    const commune = unitById.get(incident.commune_id!);
    const wilaya = unitById.get(incident.wilaya_id);
    if (!commune) continue;
    if (covered.has(commune.code)) {
      await auditRow({
        action: "suppressed",
        reason: "already_detected",
        kind: "official",
        commune_codes: [commune.code],
        payload: { official_incident_id: incident.id },
      });
      continue;
    }
    const label =
      (incident.latest_mention_id
        ? sourceLabel.get(incident.latest_mention_id)
        : null) ?? "Protection Civile";
    const texts = officialTexts(
      {
        commune: commune.name_fr,
        wilaya: wilaya?.name_fr ?? "",
        source: label,
        asOf: algiersClock(incident.as_of),
        status: incident.status as OfficialVars["status"],
      },
      false,
    );
    const cap = buildOfficialCap({
      incidentId: incident.id,
      areaDesc: [commune.name_fr, wilaya?.name_fr].filter(Boolean).join(", "),
      sentAt: new Date(),
      asOf: new Date(incident.as_of),
      texts,
    });
    const { data: capRow, error: capError } = await supabaseAdmin
      .from("cap_alerts")
      .insert({
        identifier: cap.identifier,
        sender: cap.sender,
        sent: cap.sent,
        status: cap.status,
        msg_type: cap.msgType,
        scope: cap.scope,
        info: cap.info,
      })
      .select("id")
      .single();
    if (capError)
      throw new Error(`official cap insert failed: ${capError.message}`);
    const { data: row, error: insertError } = await supabaseAdmin
      .from("broadcasts")
      .insert({
        kind: "official",
        phase: "initial",
        official_incident_id: incident.id,
        cap_alert_id: capRow.id,
        severity: "Severe",
        commune_codes: [commune.code],
        push_codes: [commune.code],
      })
      .select("id")
      .single();
    if (insertError)
      throw new Error(
        `official broadcast insert failed: ${insertError.message}`,
      );
    published += 1;
    await auditRow({
      action: "published",
      reason: "official_relay",
      kind: "official",
      severity: "Severe",
      commune_codes: [commune.code],
      payload: {
        official_incident_id: incident.id,
        broadcast_id: row.id,
        headline: texts[0]?.headline ?? "",
      },
    });
  }
  return published;
}

async function relayOnmWarnings(): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: warnings, error } = await supabaseAdmin
    .from("onm_vigilance")
    .select("id, severity, wilaya_id, event, sent, onset, expires")
    .in("severity", ["Severe", "Extreme"])
    .not("wilaya_id", "is", null)
    .or(`expires.is.null,expires.gt.${nowIso}`);
  if (error) throw new Error(error.message);
  if (!warnings?.length) return 0;

  const toWarning = (row: {
    id: string;
    severity: string;
    wilaya_id: string | null;
    event: string | null;
    sent: string;
    onset: string | null;
    expires: string | null;
  }): OnmWarning => ({
    id: row.id,
    wilayaId: row.wilaya_id!,
    event: row.event ?? "",
    severity: row.severity,
    sentMs: Date.parse(row.sent),
    onsetMs: row.onset === null ? null : Date.parse(row.onset),
    expiresMs: row.expires === null ? null : Date.parse(row.expires),
  });

  const relayedSince = new Date(
    Date.now() - ONM_RELAYED_LOOKBACK_HOURS * HOUR,
  ).toISOString();
  const { data: relayedRows, error: relayedError } = await supabaseAdmin
    .from("broadcasts")
    .select(
      "onm_vigilance_id, onm_vigilance(id, severity, wilaya_id, event, sent, onset, expires)",
    )
    .eq("kind", "onm")
    .gte("created_at", relayedSince);
  if (relayedError) throw new Error(relayedError.message);
  const relayed = (relayedRows ?? [])
    .map((row) => row.onm_vigilance)
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .map(toWarning);
  const relayedIds = new Set(relayed.map((w) => w.id));

  const { relay, suppressed } = onmRelayPlan(
    warnings.filter((w) => !relayedIds.has(w.id)).map(toWarning),
    relayed,
  );
  for (const warning of suppressed)
    await auditRow({
      action: "suppressed",
      reason: "onm_duplicate",
      kind: "onm",
      onm_vigilance_id: warning.id,
      severity: warning.severity,
    });
  if (!relay.length) return 0;

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
  for (const warning of relay) {
    const codes = codesByWilaya.get(warning.wilayaId) ?? [];
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
        push_codes: codes,
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
