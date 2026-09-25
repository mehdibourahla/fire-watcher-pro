import { ONM_EVENTS } from "@/lib/civil-map-geometry";
import { haversineKm } from "@/lib/nadhir";
import { isSandstorm } from "@/lib/ingest/metar";
import {
  officialConcernsZone,
  ONM_SEVERITY,
  roadConcernsZone,
  weatherConcernsZone,
  type ZoneArea,
} from "@/lib/zone-hazards";

export type LiveContext = {
  weather: {
    id: string;
    event: string;
    severity: string;
    expires: string;
    wilaya_id: string | null;
    polygon: [number, number][] | null;
  }[];
  official: {
    id: string;
    commune_id: string | null;
    wilaya_id: string | null;
    last_reported_at: string;
  }[];
  road: { id: string; area_id: string; summary: string; expires_at: string }[];
  citizen: {
    id: string;
    hazard: string | null;
    lat: number;
    lon: number;
    expires_at: string;
    witnesses: number;
  }[];
  stations: {
    station: string;
    name: string | null;
    lat: number;
    lon: number;
    observed_at: string;
    visibility_m: number | null;
    weather: string | null;
  }[];
};

export type ZoneStatus = {
  weather: { event: string; level: number; until: string }[];
  official: number;
  road: { id: string; summary: string }[];
  citizen: { id: string; hazard: string | null }[];
  sandstorms: { station: string; name: string; visibility_m: number }[];
};

// an official report stays current for 72 h, the same window its zone alert uses
const OFFICIAL_WINDOW_MS = 72 * 3_600_000;

export function zoneStatus(
  follows: {
    weather: boolean;
    official: boolean;
    road: boolean;
    citizen: boolean;
  },
  area: ZoneArea,
  context: LiveContext,
  nowMs: number,
): ZoneStatus {
  const weather = new Map<
    string,
    { event: string; level: number; until: string }
  >();
  if (follows.weather)
    for (const w of context.weather) {
      if (Date.parse(w.expires) <= nowMs || !weatherConcernsZone(area, w))
        continue;
      const event = ONM_EVENTS[w.event] ?? "other";
      const level = ONM_SEVERITY[w.severity] ?? 1;
      const key = `${event}|${level}`;
      const seen = weather.get(key);
      if (!seen || w.expires > seen.until)
        weather.set(key, { event, level, until: w.expires });
    }

  const official = follows.official
    ? context.official.filter(
        (o) =>
          Date.parse(o.last_reported_at) > nowMs - OFFICIAL_WINDOW_MS &&
          officialConcernsZone(area, o),
      ).length
    : 0;

  const road = follows.road
    ? context.road
        .filter(
          (r) => Date.parse(r.expires_at) > nowMs && roadConcernsZone(area, r),
        )
        .map((r) => ({ id: r.id, summary: r.summary }))
    : [];

  const citizen = follows.citizen
    ? context.citizen
        .filter(
          (c) =>
            c.witnesses > 0 &&
            Date.parse(c.expires_at) > nowMs &&
            haversineKm(area.lat, area.lon, c.lat, c.lon) <= area.radius_km,
        )
        .map((c) => ({ id: c.id, hazard: c.hazard }))
    : [];

  // an airport measurement is weather the zone may already be under, so it follows the weather switch
  const sandstorms = follows.weather
    ? context.stations
        .filter(
          (s) =>
            isSandstorm(s) &&
            Date.parse(s.observed_at) > nowMs - 3 * 3_600_000 &&
            haversineKm(area.lat, area.lon, s.lat, s.lon) <= 50,
        )
        .map((s) => ({
          station: s.station,
          name: s.name ?? s.station,
          visibility_m: s.visibility_m!,
        }))
    : [];

  return {
    weather: [...weather.values()].sort((a, b) => b.level - a.level),
    official,
    road,
    citizen,
    sandstorms,
  };
}
