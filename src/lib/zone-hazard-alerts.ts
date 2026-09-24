import {
  authorityConcernsZone,
  officialConcernsZone,
  roadConcernsZone,
  weatherConcernsZone,
  type ZoneArea,
} from "@/lib/zone-hazards";

export type HazardZone = {
  id: string;
  user_id: string;
  name: string;
  lat: number;
  lon: number;
  radius_km: number;
  commune_id: string | null;
  notify_weather: boolean;
  notify_official: boolean;
  notify_road: boolean;
};

export type HazardContext = {
  communes: Map<string, { code: string; wilayaId: string | null }>;
  weather: {
    id: string;
    severity: string;
    title: string;
    headline_fr: string | null;
    polygon: [number, number][] | null;
    wilaya_id: string | null;
    expires: string;
  }[];
  official: {
    id: string;
    commune_id: string | null;
    wilaya_id: string | null;
    place_text: string | null;
    last_reported_at: string;
  }[];
  authority: {
    id: string;
    source: string;
    body: string;
    severity: string;
    wilaya_id: string | null;
    commune_codes: string[] | null;
    created_at: string;
  }[];
  road: {
    id: string;
    summary: string;
    area_id: string;
    source_name: string;
    expires_at: string;
  }[];
};

export type HazardAlertRow = {
  user_id: string;
  zone_id: string;
  kind: "weather" | "official" | "road";
  severity: number;
  commune_id: string | null;
  dedupe_key: string;
  title: string;
  body: string;
  source_table: string;
  source_id: string;
  payload: Record<string, unknown>;
};

type Copy = Record<
  | "weatherTitle"
  | "weatherBody"
  | "officialTitle"
  | "officialBody"
  | "authorityTitle"
  | "authorityBody"
  | "roadTitle"
  | "roadBody",
  string
>;

const FR: Copy = {
  weatherTitle: "Vigilance ONM pour {{zone}}",
  weatherBody: "ONM : « {{text}} »",
  officialTitle: "Signalement de la Protection civile pour {{zone}}",
  officialBody: "La Protection civile signale un incident à {{place}}.",
  authorityTitle: "Avertissement officiel pour {{zone}}",
  authorityBody: "{{source}} : « {{text}} »",
  roadTitle: "Incident routier près de {{zone}}",
  roadBody:
    "« {{text}} » — signalé par {{source}}, vérifié par Nadhir. Information, pas une consigne officielle.",
};

const COPY: Record<string, Copy> = {
  en: {
    weatherTitle: "ONM warning for {{zone}}",
    weatherBody: "ONM: “{{text}}”",
    officialTitle: "Protection Civile report for {{zone}}",
    officialBody: "Protection Civile reports an incident in {{place}}.",
    authorityTitle: "Official warning for {{zone}}",
    authorityBody: "{{source}}: “{{text}}”",
    roadTitle: "Road incident near {{zone}}",
    roadBody:
      "“{{text}}” — reported by {{source}}, reviewed by Nadhir. Information, not an official order.",
  },
  fr: FR,
  kab: FR,
  ar: {
    weatherTitle: "تحذير الديوان الوطني للأرصاد الجوية لـ {{zone}}",
    weatherBody: "الديوان الوطني للأرصاد الجوية: «{{text}}»",
    officialTitle: "بلاغ الحماية المدنية بخصوص {{zone}}",
    officialBody: "تبلغ الحماية المدنية عن حادث في {{place}}.",
    authorityTitle: "تحذير رسمي بخصوص {{zone}}",
    authorityBody: "{{source}}: «{{text}}»",
    roadTitle: "حادث مروري قرب {{zone}}",
    roadBody:
      "«{{text}}» — أبلغ عنه {{source}} وراجعه نذير. معلومة وليست أمرًا رسميًا.",
  },
};

const ONM_SEVERITY: Record<string, number> = {
  Minor: 1,
  Moderate: 2,
  Severe: 3,
  Extreme: 4,
};
const AUTHORITY_SEVERITY: Record<string, number> = { Severe: 4, Extreme: 5 };

const HOUR = 3_600_000;
const later = (at: string, hours: number) =>
  new Date(Date.parse(at) + hours * HOUR).toISOString();

const fill = (template: string, vars: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");

export function hazardAlerts(
  zones: HazardZone[],
  context: HazardContext,
  profileOf: (userId: string) => { locale: string; quiet: boolean },
) {
  const rows: HazardAlertRow[] = [];
  let suppressed = 0;

  for (const zone of zones) {
    const { locale, quiet } = profileOf(zone.user_id);
    const copy = COPY[locale] ?? COPY["ar"]!;
    const commune = zone.commune_id
      ? context.communes.get(zone.commune_id)
      : undefined;
    const area: ZoneArea = {
      lat: zone.lat,
      lon: zone.lon,
      radius_km: zone.radius_km,
      commune_id: zone.commune_id,
      communeCode: commune?.code ?? null,
      wilayaId: commune?.wilayaId ?? null,
    };
    const add = (
      row: Omit<HazardAlertRow, "user_id" | "zone_id" | "commune_id">,
      breaksThrough: boolean,
    ) => {
      if (quiet && !breaksThrough) {
        suppressed += 1;
        return;
      }
      rows.push({
        ...row,
        user_id: zone.user_id,
        zone_id: zone.id,
        commune_id: zone.commune_id,
      });
    };

    if (zone.notify_weather)
      for (const warning of context.weather) {
        if (!weatherConcernsZone(area, warning)) continue;
        const severity = ONM_SEVERITY[warning.severity] ?? 2;
        add(
          {
            kind: "weather",
            severity,
            dedupe_key: `weather:${zone.id}:${warning.id}`,
            title: fill(copy.weatherTitle, { zone: zone.name }),
            body: fill(copy.weatherBody, {
              text: warning.headline_fr ?? warning.title,
            }),
            source_table: "onm_vigilance",
            source_id: warning.id,
            payload: {
              onm_severity: warning.severity,
              expires_at: warning.expires,
              map_event: `weather:${warning.id}`,
            },
          },
          warning.severity === "Extreme",
        );
      }

    if (zone.notify_official) {
      for (const incident of context.official) {
        if (!officialConcernsZone(area, incident)) continue;
        add(
          {
            kind: "official",
            severity: 4,
            dedupe_key: `official:${zone.id}:${incident.id}`,
            title: fill(copy.officialTitle, { zone: zone.name }),
            body: fill(copy.officialBody, {
              place: incident.place_text ?? zone.name,
            }),
            source_table: "official_incidents",
            source_id: incident.id,
            payload: {
              expires_at: later(incident.last_reported_at, 72),
              map_event: `official:${incident.id}`,
            },
          },
          true,
        );
      }
      for (const warning of context.authority) {
        if (!authorityConcernsZone(area, warning)) continue;
        add(
          {
            kind: "official",
            severity: AUTHORITY_SEVERITY[warning.severity] ?? 4,
            dedupe_key: `official:${zone.id}:${warning.id}`,
            title: fill(copy.authorityTitle, { zone: zone.name }),
            body: fill(copy.authorityBody, {
              source: warning.source,
              text: warning.body,
            }),
            source_table: "authority_warnings",
            source_id: warning.id,
            payload: {
              authority: warning.source,
              expires_at: later(warning.created_at, 24),
            },
          },
          true,
        );
      }
    }

    if (zone.notify_road)
      for (const publication of context.road) {
        if (!roadConcernsZone(area, publication)) continue;
        add(
          {
            kind: "road",
            severity: 2,
            dedupe_key: `road:${zone.id}:${publication.id}`,
            title: fill(copy.roadTitle, { zone: zone.name }),
            body: fill(copy.roadBody, {
              text: publication.summary,
              source: publication.source_name,
            }),
            source_table: "civil_publications",
            source_id: publication.id,
            payload: {
              expires_at: publication.expires_at,
              map_event: `civil:${publication.id}`,
            },
          },
          false,
        );
      }
  }

  return { rows, suppressed };
}
