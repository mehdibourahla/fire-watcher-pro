import { haversineKm } from "@/lib/nadhir";

export type EmscEvent = {
  id: string;
  occurred_at: string;
  lat: number;
  lon: number;
  depth_km: number | null;
  magnitude: number;
  magnitude_type: string | null;
  region: string | null;
  network: string | null;
  updated_at: string;
};

// known and suspected earthquakes; blasts and unknown events are not earthquakes
const EARTHQUAKE_TYPES = new Set(["ke", "se"]);

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function parseEmsc(body: unknown): EmscEvent[] {
  // FDSN answers 204 with no body when nothing matched
  if (body === null || body === undefined) return [];
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features))
    throw new Error("EMSC returned an unexpected shape");
  return features.flatMap((feature) => {
    const p = (feature as { properties?: Record<string, unknown> }).properties;
    if (
      !p ||
      typeof p["unid"] !== "string" ||
      typeof p["time"] !== "string" ||
      !finite(p["lat"]) ||
      !finite(p["lon"]) ||
      !finite(p["mag"]) ||
      !EARTHQUAKE_TYPES.has(String(p["evtype"] ?? "ke"))
    )
      return [];
    return [
      {
        id: p["unid"],
        occurred_at: p["time"],
        lat: p["lat"],
        lon: p["lon"],
        depth_km: finite(p["depth"]) ? p["depth"] : null,
        magnitude: Math.round(p["mag"] * 10) / 10,
        magnitude_type: typeof p["magtype"] === "string" ? p["magtype"] : null,
        region:
          typeof p["flynn_region"] === "string" ? p["flynn_region"] : null,
        network: typeof p["auth"] === "string" ? p["auth"] : null,
        updated_at:
          typeof p["lastupdate"] === "string" ? p["lastupdate"] : p["time"],
      },
    ];
  });
}

export const NEAR_ALGERIA_KM = 100;

export function locateEvents(
  events: EmscEvent[],
  communes: readonly { id: string; lat: number; lon: number }[],
  maxKm = NEAR_ALGERIA_KM,
): (EmscEvent & { commune_id: string; offshore: boolean })[] {
  return events.flatMap((event) => {
    let nearest: { id: string; km: number } | null = null;
    for (const c of communes) {
      const km = haversineKm(event.lat, event.lon, c.lat, c.lon);
      if (!nearest || km < nearest.km) nearest = { id: c.id, km };
    }
    if (!nearest || nearest.km > maxKm) return [];
    return [
      {
        ...event,
        commune_id: nearest.id,
        offshore: /\bSEA\b|COAST/.test(event.region ?? ""),
      },
    ];
  });
}
