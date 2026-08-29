import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ALERTING_STATES,
  DOWNWIND_HALF_ANGLE_DEG,
  LIVE_STATES,
  MIN_CONFIDENCE,
  SETTLEMENT_EMERGENCY_KM,
  SEVERITY,
  compass,
  downwindOf,
  inQuietHours,
} from "@/lib/alerts-rules";
import { buildFireCap, fireCapIdentifier } from "@/lib/cap";
import { bearingBetween, coordLabel, haversineKm } from "@/lib/nadhir";
import { fetchAllPages } from "@/lib/paginate";

type Copy = {
  fireTitle: string;
  fireBody: string;
  urgentTitle: string;
  urgentBody: string;
  clearTitle: string;
  clearBody: string;
  riskTitle: string;
  riskBody: string;
  capEvent: string;
  capDescription: string;
  capInstruction: string;
};

/** RFC 3066 tags for the CAP <language> element. */
const CAP_LANGUAGE: Record<string, string> = {
  ar: "ar-DZ",
  fr: "fr-DZ",
  en: "en",
  kab: "kab",
};

const COPY: Record<string, Copy> = {
  ar: {
    fireTitle: "حريق قرب {{zone}}",
    fireBody:
      "تم رصد حريق على بعد {{km}} كم من {{zone}}. تابع التعليمات وابتعد عن مسار الدخان.",
    urgentTitle: "عاجل: حريق يقترب من {{zone}}",
    urgentBody:
      "حريق على بعد {{km}} كم من {{zone}} والرياح تدفعه نحو {{bearing}}. استعد للإخلاء واتصل بالحماية المدنية على 14.",
    clearTitle: "انحسر الحريق قرب {{zone}}",
    clearBody:
      "لم يعد الحريق قرب {{zone}} نشطًا. ابقَ حذرًا حتى تأكيد الإطفاء.",
    riskTitle: "خطر حرائق مرتفع في {{zone}}",
    riskBody: "مستوى الخطر اليوم {{level}}/5 في {{zone}}. تجنّب إشعال النار.",
    capEvent: "حريق غابات",
    capDescription:
      "حريق مشتعل قرب {{place}}، تم رصده عبر الأقمار الاصطناعية وتجري متابعته.",
    capInstruction:
      "ابتعد عن الدخان، واتبع تعليمات السلطات المحلية، واتصل بالحماية المدنية على 14 إذا هدّد الحريق أشخاصًا أو منازل.",
  },
  fr: {
    fireTitle: "Incendie près de {{zone}}",
    fireBody:
      "Un foyer a été détecté à {{km}} km de {{zone}}. Restez à l'écart de la fumée.",
    urgentTitle: "Urgent : incendie approchant {{zone}}",
    urgentBody:
      "Incendie à {{km}} km de {{zone}}, poussé par le vent vers {{bearing}}. Préparez-vous à évacuer et appelez la Protection Civile au 14.",
    clearTitle: "Incendie maîtrisé près de {{zone}}",
    clearBody:
      "L'incendie près de {{zone}} n'est plus actif. Restez prudent jusqu'à extinction confirmée.",
    riskTitle: "Danger d'incendie élevé à {{zone}}",
    riskBody:
      "Niveau de danger {{level}}/5 aujourd'hui à {{zone}}. N'allumez aucun feu.",
    capEvent: "Feu de forêt",
    capDescription:
      "Un incendie brûle près de {{place}}. Il a été détecté par satellite et fait l'objet d'un suivi.",
    capInstruction:
      "Éloignez-vous de la fumée, suivez les consignes des autorités locales et appelez la Protection Civile au 14 si le feu menace des personnes ou des habitations.",
  },
  en: {
    fireTitle: "Fire near {{zone}}",
    fireBody:
      "A fire was detected {{km}} km from {{zone}}. Stay clear of the smoke path.",
    urgentTitle: "Urgent: fire approaching {{zone}}",
    urgentBody:
      "Fire {{km}} km from {{zone}}, wind pushing it {{bearing}}. Prepare to leave and call Civil Protection on 14.",
    clearTitle: "Fire near {{zone}} has eased",
    clearBody:
      "The fire near {{zone}} is no longer active. Stay alert until extinction is confirmed.",
    riskTitle: "High fire danger at {{zone}}",
    riskBody:
      "Today's danger level is {{level}}/5 at {{zone}}. Do not light any fire.",
    capEvent: "Wildfire",
    capDescription:
      "A fire is burning near {{place}}. It was detected by satellite and is being tracked.",
    capInstruction:
      "Stay away from the smoke, follow instructions from local authorities, and call Civil Protection on 14 if the fire threatens people or homes.",
  },
  kab: {
    fireTitle: "Times ɣer {{zone}}",
    fireBody:
      "Times tettwaf ɣef {{km}} km si {{zone}}. Ḥader iman-ik seg dexxan.",
    urgentTitle: "Aɣewwaṛ: times tettqerrib ɣer {{zone}}",
    urgentBody:
      "Times ɣef {{km}} km si {{zone}}, aḍu yessedday-itt ɣer {{bearing}}. Heggi iman-ik i tuffɣa, siwel i Tɣellist Tagdudant ɣef 14.",
    clearTitle: "Times ɣer {{zone}} tenqes",
    clearBody:
      "Times ɣer {{zone}} ur teddir ara tura. Qim d aɛessas alamma texsi.",
    riskTitle: "Ayefki n times ɣer {{zone}}",
    riskBody:
      "Aswir n uɣilif ass-a d {{level}}/5 deg {{zone}}. Ur sserɣay ara times.",
    capEvent: "Times n teẓgi",
    capDescription:
      "Times tettreɣ ɣer {{place}}. Tettwaf s uḍfar n igenwan yerna tettwaḍfaṛ.",
    capInstruction:
      "Ḥader iman-ik seg dexxan, ḍfer iwellihen n yidebbaren idiganen, tsiwleḍ i Tɣellist Tagdudant ɣef 14 ma tessexlaɛ times imdanen neɣ ixxamen.",
  },
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    String(vars[k] ?? ""),
  );
}

type CapEvent = {
  clusterId: string;
  shortId: string;
  lat: number;
  lon: number;
  confidence: number;
  urgent: boolean;
  place: string;
};

/** One CAP object per fire event, shared by every alert raised for it. */
async function ensureCapAlerts(
  events: CapEvent[],
): Promise<Map<string, string>> {
  if (!events.length) return new Map();
  const sentAt = new Date();

  const payload = events.map((event) => {
    const cap = buildFireCap({
      shortId: event.shortId,
      lat: event.lat,
      lon: event.lon,
      radiusKm: SETTLEMENT_EMERGENCY_KM,
      confidence: event.confidence,
      urgent: event.urgent,
      areaDesc: event.place,
      sentAt,
      texts: Object.entries(CAP_LANGUAGE).map(([locale, language]) => {
        const copy = COPY[locale] ?? COPY["ar"]!;
        return {
          language,
          event: copy.capEvent,
          headline: fill(event.urgent ? copy.urgentTitle : copy.fireTitle, {
            zone: event.place,
          }),
          description: fill(copy.capDescription, { place: event.place }),
          instruction: copy.capInstruction,
        };
      }),
    });

    return {
      identifier: cap.identifier,
      sender: cap.sender,
      sent: cap.sent,
      status: cap.status,
      msg_type: cap.msgType,
      scope: cap.scope,
      cluster_id: event.clusterId,
      info: cap.info,
    };
  });

  const { error } = await supabaseAdmin
    .from("cap_alerts")
    .upsert(payload, { onConflict: "identifier", ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  const { data, error: readError } = await supabaseAdmin
    .from("cap_alerts")
    .select("id, identifier")
    .in(
      "identifier",
      payload.map((p) => p.identifier),
    );
  if (readError) throw new Error(readError.message);

  return new Map((data ?? []).map((row) => [row.identifier, row.id]));
}

export type AlertRun = {
  evaluated: number;
  created: number;
  suppressed: number;
  sent?: number;
  failed?: number;
};

export async function evaluateAlerts(userId?: string): Promise<AlertRun> {
  let zoneQuery = supabaseAdmin.from("zones").select("*").eq("active", true);
  if (userId) zoneQuery = zoneQuery.eq("user_id", userId);
  const { data: zones, error: zonesError } = await zoneQuery;
  if (zonesError) throw new Error(zonesError.message);
  if (!zones?.length) return { evaluated: 0, created: 0, suppressed: 0 };

  const userIds = [...new Set(zones.map((z) => z.user_id))];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .in("id", userIds);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: allLive } = await supabaseAdmin
    .from("fire_clusters")
    .select(
      "id, short_id, state, lat, lon, confidence, spread_bearing_deg, last_detected_at",
    )
    .in("state", LIVE_STATES);

  const alertable = (allLive ?? []).filter((c) =>
    ALERTING_STATES.includes(c.state),
  );

  // R3 gates on how close the fire actually is; the centroid understates that by
  // kilometres for a spread-out fire, which silently skips the emergency escalation.
  const frontByCluster = new Map<string, { lat: number; lon: number }[]>();
  if (alertable.length) {
    const points = await fetchAllPages<{
      cluster_id: string | null;
      lat: number;
      lon: number;
    }>((from, to) =>
      supabaseAdmin
        .from("detections")
        .select("cluster_id, lat, lon")
        .in(
          "cluster_id",
          alertable.map((c) => c.id),
        )
        .range(from, to),
    );
    for (const p of points) {
      if (!p.cluster_id) continue;
      const bucket = frontByCluster.get(p.cluster_id);
      if (bucket) bucket.push({ lat: p.lat, lon: p.lon });
      else frontByCluster.set(p.cluster_id, [{ lat: p.lat, lon: p.lon }]);
    }
  }

  const settlements = await fetchAllPages<{
    id: string;
    name: string;
    lat: number;
    lon: number;
  }>((from, to) =>
    supabaseAdmin
      .from("settlements")
      .select("id, name, lat, lon")
      .range(from, to),
  );

  const today = new Date().toISOString().slice(0, 10);
  const communeIds = [
    ...new Set(zones.map((z) => z.commune_id).filter(Boolean)),
  ] as string[];
  const { data: forecasts } = communeIds.length
    ? await supabaseAdmin
        .from("risk_forecasts")
        .select("commune_id, forecast_date, danger_level, fuel_limited")
        .eq("forecast_date", today)
        .eq("horizon_days", 0)
        .in("commune_id", communeIds)
    : {
        data: [] as {
          commune_id: string;
          danger_level: number;
          fuel_limited: boolean;
        }[],
      };
  const forecastByCommune = new Map(
    (forecasts ?? []).map((f) => [f.commune_id, f]),
  );

  const placeByCluster = new Map<string, string>();
  for (const cluster of alertable) {
    let best: { name: string; km: number } | null = null;
    for (const s of settlements) {
      const km = haversineKm(cluster.lat, cluster.lon, s.lat, s.lon);
      if (!best || km < best.km) best = { name: s.name, km };
    }
    placeByCluster.set(
      cluster.id,
      best ? best.name : coordLabel(cluster.lat, cluster.lon),
    );
  }

  const capEvents = new Map<string, CapEvent>();
  const rows: Record<string, unknown>[] = [];
  let suppressed = 0;

  for (const zone of zones) {
    const profile = profileById.get(zone.user_id);
    const copy = COPY[profile?.locale ?? "ar"] ?? COPY["ar"]!;
    const quiet = inQuietHours(
      profile?.quiet_hours_start ?? null,
      profile?.quiet_hours_end ?? null,
    );

    if (zone.notify_fires) {
      // spec R1: the floor is per-user; the column may predate its migration
      const floor =
        (profile as { min_confidence?: number } | undefined)?.min_confidence ??
        MIN_CONFIDENCE;
      for (const cluster of alertable) {
        if (cluster.confidence < floor) continue;
        const zoneFront = frontByCluster.get(cluster.id) ?? [
          { lat: cluster.lat, lon: cluster.lon },
        ];
        let km = Infinity;
        for (const p of zoneFront) {
          const one = haversineKm(zone.lat, zone.lon, p.lat, p.lon);
          if (one < km) km = one;
        }
        if (km > zone.radius_km) continue;

        // R3: nearest settlement inside the fire's downwind cone escalates to emergency
        let urgent: { name: string; bearing: number } | null = null;
        const front = frontByCluster.get(cluster.id) ?? [
          { lat: cluster.lat, lon: cluster.lon },
        ];
        for (const s of settlements) {
          let sKm = Infinity;
          for (const p of front) {
            const one = haversineKm(p.lat, p.lon, s.lat, s.lon);
            if (one < sKm) sKm = one;
          }
          if (sKm > SETTLEMENT_EMERGENCY_KM) continue;
          const bearing = bearingBetween(
            cluster.lat,
            cluster.lon,
            s.lat,
            s.lon,
          );
          if (!downwindOf(cluster.spread_bearing_deg, bearing)) continue;
          urgent = { name: s.name, bearing };
          break;
        }

        const severity = urgent ? SEVERITY.emergency : SEVERITY.warning;
        if (quiet && severity < SEVERITY.emergency) {
          suppressed += 1;
          continue;
        }

        const capIdentifier = fireCapIdentifier(cluster.short_id, !!urgent);
        if (!capEvents.has(capIdentifier)) {
          capEvents.set(capIdentifier, {
            clusterId: cluster.id,
            shortId: cluster.short_id,
            lat: cluster.lat,
            lon: cluster.lon,
            confidence: cluster.confidence,
            urgent: !!urgent,
            place: placeByCluster.get(cluster.id) ?? cluster.short_id,
          });
        }

        rows.push({
          cap_identifier: capIdentifier,
          user_id: zone.user_id,
          zone_id: zone.id,
          kind: "fire",
          severity,
          cluster_id: cluster.id,
          dedupe_key: `fire:${zone.id}:${cluster.id}:${urgent ? "urgent" : "new"}`,
          title: fill(urgent ? copy.urgentTitle : copy.fireTitle, {
            zone: zone.name,
          }),
          body: fill(urgent ? copy.urgentBody : copy.fireBody, {
            zone: zone.name,
            km: km.toFixed(1),
            bearing: urgent ? compass(urgent.bearing) : "",
          }),
          distance_km: km,
          payload: {
            short_id: cluster.short_id,
            state: cluster.state,
            confidence: cluster.confidence,
            ...(urgent ? { settlement: urgent.name } : {}),
          },
        });
      }
    }

    if (zone.notify_risk && zone.commune_id) {
      const forecast = forecastByCommune.get(zone.commune_id);
      const threshold = Math.max(
        zone.min_danger_level,
        profile?.min_danger_level ?? 1,
      );
      if (
        forecast &&
        !forecast.fuel_limited &&
        forecast.danger_level >= threshold
      ) {
        if (quiet) {
          suppressed += 1;
        } else {
          rows.push({
            user_id: zone.user_id,
            zone_id: zone.id,
            kind: "risk",
            severity: forecast.danger_level,
            commune_id: zone.commune_id,
            dedupe_key: `risk:${zone.id}:${today}:${forecast.danger_level}`,
            title: fill(copy.riskTitle, { zone: zone.name }),
            body: fill(copy.riskBody, {
              zone: zone.name,
              level: forecast.danger_level,
            }),
            payload: {
              forecast_date: today,
              danger_level: forecast.danger_level,
            },
          });
        }
      }
    }
  }

  if (!rows.length) return { evaluated: zones.length, created: 0, suppressed };

  const capIdByIdentifier = await ensureCapAlerts([...capEvents.values()]);
  const alertRows = rows.map((row) => {
    const { cap_identifier: identifier, ...rest } = row as {
      cap_identifier?: string;
    };
    return {
      ...rest,
      cap_alert_id: identifier
        ? (capIdByIdentifier.get(identifier) ?? null)
        : null,
    };
  });

  const { data: inserted, error } = await supabaseAdmin
    .from("alerts")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(alertRows as any, {
      onConflict: "user_id,dedupe_key",
      ignoreDuplicates: true,
    })
    .select("*");
  if (error) throw new Error(error.message);

  let delivered = { sent: 0, failed: 0 };
  if (inserted?.length) {
    const { dispatchWebhooks } = await import("@/lib/webhooks.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delivered = await dispatchWebhooks(inserted as any);
  }

  return {
    evaluated: zones.length,
    created: inserted?.length ?? 0,
    suppressed,
    ...delivered,
  };
}
