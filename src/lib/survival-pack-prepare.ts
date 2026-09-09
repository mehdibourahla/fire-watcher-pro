import type { QueryClient } from "@tanstack/react-query";
import type { Polygon, MultiPolygon } from "geojson";
import type { Locale } from "@/i18n";
import {
  adminUnitsQuery,
  clustersQuery,
  communeGeomsQuery,
  haversineKm,
  settlementsQuery,
} from "@/lib/nadhir";
import { openAreasQuery } from "@/lib/open-areas";
import { nearestThreat, positionCard } from "@/lib/survival";
import { deviceStorage, preparePack } from "@/lib/survival-pack";

export type PackZone = {
  name: string;
  lat: number;
  lon: number;
  commune_id: string | null;
  radius_km: number;
};

export async function prepareSurvivalShell(): Promise<void> {
  if (!navigator.onLine || !("serviceWorker" in navigator))
    throw new Error("survival.packUnavailable");
  const requested = await navigator.serviceWorker.register("/sw.js");
  const updating = requested.installing ?? requested.waiting;
  if (updating && updating.state !== "activated")
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("survival.packFailed")),
        60_000,
      );
      updating.addEventListener("statechange", () => {
        if (updating.state === "activated") {
          clearTimeout(timer);
          resolve();
        }
        if (updating.state === "redundant") {
          clearTimeout(timer);
          reject(new Error("survival.packFailed"));
        }
      });
    });
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("survival.packFailed")), 60_000),
    ),
  ]);
  if (!registration.active) throw new Error("survival.packFailed");
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("survival.packFailed"));
    }, 120_000);
    channel.port1.onmessage = (event: MessageEvent<{ ok: boolean }>) => {
      clearTimeout(timer);
      channel.port1.close();
      if (event.data.ok) resolve();
      else reject(new Error("survival.packFailed"));
    };
    registration.active!.postMessage({ type: "PREPARE_SURVIVAL" }, [
      channel.port2,
    ]);
  });
}

function boundedMap(geometry: Polygon | MultiPolygon): Polygon | MultiPolygon {
  let budget = 3000;
  const ring = (points: number[][]) => {
    const step = Math.max(1, Math.ceil(points.length / 500));
    const reduced = points
      .filter((_, i) => i % step === 0)
      .filter(() => --budget >= 0);
    if (reduced.length < 3) return [];
    return [...reduced, reduced[0]!];
  };
  const polygon = (rings: number[][][]) =>
    rings.map(ring).filter((r) => r.length >= 4);
  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: polygon(geometry.coordinates) }
    : {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map(polygon).filter((p) => p.length),
      };
}

export async function prepareZonePack(
  qc: QueryClient,
  zone: PackZone,
  locale: Locale,
) {
  return preparePack(
    deviceStorage,
    async () => {
      if (
        !Number.isFinite(zone.lat) ||
        !Number.isFinite(zone.lon) ||
        Math.abs(zone.lat) > 90 ||
        Math.abs(zone.lon) > 180
      )
        throw new Error("survival.packFailed");
      const [units, settlements, openAreas, clusters] = await Promise.all([
        qc.fetchQuery(adminUnitsQuery),
        qc.fetchQuery(settlementsQuery),
        qc.fetchQuery(openAreasQuery),
        qc.fetchQuery(clustersQuery),
      ]);
      const commune = units
        .filter((u) => u.level === "commune")
        .sort(
          (a, b) =>
            haversineKm(zone.lat, zone.lon, a.lat, a.lon) -
            haversineKm(zone.lat, zone.lon, b.lat, b.lon),
        )
        .find((u) => !zone.commune_id || u.id === zone.commune_id);
      if (
        !commune ||
        haversineKm(zone.lat, zone.lon, commune.lat, commune.lon) > 60
      )
        throw new Error("survival.packFailed");
      const geometries = await qc.fetchQuery(communeGeomsQuery([commune.id]));
      const geometry = geometries.get(commune.id);
      if (
        !geometry ||
        (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
      )
        throw new Error("survival.packFailed");
      const card = positionCard(zone.lat, zone.lon, units, settlements, locale);
      const threat = nearestThreat(zone.lat, zone.lon, clusters);
      return {
        ...card,
        saved_at: new Date().toISOString(),
        lat: zone.lat,
        lon: zone.lon,
        zone_name: zone.name,
        area_map: boundedMap(geometry),
        openAreas: openAreas
          .filter(
            (a) =>
              haversineKm(zone.lat, zone.lon, a.lat, a.lon) <=
              Math.min(60, Math.max(10, zone.radius_km)),
          )
          .sort(
            (a, b) =>
              haversineKm(zone.lat, zone.lon, a.lat, a.lon) -
              haversineKm(zone.lat, zone.lon, b.lat, b.lon),
          )
          .slice(0, 100),
        threats: threat
          ? [
              {
                km: threat.km,
                bearing: threat.bearing,
                last_detected_at: threat.cluster.last_detected_at,
              },
            ]
          : [],
      };
    },
    prepareSurvivalShell,
  );
}
