export type AirportWeather = {
  station: string;
  name: string | null;
  lat: number;
  lon: number;
  observed_at: string;
  temp_c: number | null;
  wind_kt: number | null;
  gust_kt: number | null;
  visibility_m: number | null;
  weather: string | null;
  raw: string;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

// Algerian METARs give visibility in metres right after the wind group; the JSON field is miles
function visibilityMetres(raw: string, miles: unknown): number | null {
  const group = /KT(?:\s+\d{3}V\d{3})?\s+(\d{4}|CAVOK)\b/.exec(raw)?.[1];
  if (group === "CAVOK") return 9999;
  if (group) return Number(group);
  if (typeof miles === "string" && miles.endsWith("+")) return 9999;
  return finite(miles) ? Math.round(miles * 1609.34) : null;
}

export function parseMetar(body: unknown): AirportWeather[] {
  if (!Array.isArray(body))
    throw new Error("aviationweather returned an unexpected shape");
  const latest = new Map<string, AirportWeather>();
  for (const row of body as Record<string, unknown>[]) {
    const station = row["icaoId"];
    const raw = row["rawOb"];
    if (
      typeof station !== "string" ||
      !/^DA[A-Z]{2}$/.test(station) ||
      typeof raw !== "string" ||
      !finite(row["obsTime"]) ||
      !finite(row["lat"]) ||
      !finite(row["lon"])
    )
      continue;
    const observed_at = new Date(row["obsTime"] * 1000).toISOString();
    const previous = latest.get(station);
    if (previous && previous.observed_at >= observed_at) continue;
    latest.set(station, {
      station,
      name:
        typeof row["name"] === "string"
          ? row["name"].split(",")[0]!.trim()
          : null,
      lat: row["lat"],
      lon: row["lon"],
      observed_at,
      temp_c: finite(row["temp"]) ? row["temp"] : null,
      wind_kt: finite(row["wspd"]) ? row["wspd"] : null,
      gust_kt: finite(row["wgst"])
        ? row["wgst"]
        : Number(/\d{3}\d{2}G(\d{2})KT/.exec(raw)?.[1]) || null,
      visibility_m: visibilityMetres(raw, row["visib"]),
      weather: typeof row["wxString"] === "string" ? row["wxString"] : null,
      raw,
    });
  }
  return [...latest.values()];
}

// WMO dust and sand phenomena; under 1 km is a duststorm or sandstorm, above it haze
const DUST = /(?:^|\s)[+-]?(?:BL|DR)?(?:DS|SS|SA|DU)\b/;

export function isSandstorm(observation: {
  weather: string | null;
  visibility_m: number | null;
}): boolean {
  return (
    DUST.test(observation.weather ?? "") &&
    observation.visibility_m !== null &&
    observation.visibility_m < 1000
  );
}
