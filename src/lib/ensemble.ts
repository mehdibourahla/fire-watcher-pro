export const ENSEMBLE_VARIABLES = {
  temperature_2m: "°C",
  precipitation: "mm",
  wind_speed_10m: "km/h",
} as const;

export type EnsembleVariable = keyof typeof ENSEMBLE_VARIABLES;
export type MemberRange = { values: number[]; min: number; max: number };
export type EnsembleHour = { valid_at: string } & Record<
  EnsembleVariable,
  MemberRange
>;
export type EnsembleForecast = {
  model: "icon_global";
  member_count: 40;
  grid: { latitude: number; longitude: number };
  hours: EnsembleHour[];
};
export type EnsemblePreview = EnsembleForecast & {
  commune: { code: string; name_fr: string };
  fetched_at: string;
  model_run_at: null;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid ensemble object");
  return value as Record<string, unknown>;
}

export function parseEnsemble(
  payload: unknown,
  date: string,
): EnsembleForecast {
  const root = record(payload);
  const hourly = record(root["hourly"]);
  const units = record(root["hourly_units"]);
  if (root["utc_offset_seconds"] !== 0 || units["time"] !== "iso8601")
    throw new Error("Invalid ensemble timezone");
  const latitude = root["latitude"];
  const longitude = root["longitude"];
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  )
    throw new Error("Invalid ensemble grid");
  const times = hourly["time"];
  if (!Array.isArray(times) || times.length !== 24)
    throw new Error("Incomplete ensemble day");
  const hours = times.map((time, i) => {
    const expected = `${date}T${String(i).padStart(2, "0")}:00`;
    if (
      time !== expected ||
      new Date(`${time}:00Z`).toISOString().slice(0, 16) !== time
    )
      throw new Error("Invalid ensemble valid time");
    const ranges = {} as Record<EnsembleVariable, MemberRange>;
    for (const variable of Object.keys(
      ENSEMBLE_VARIABLES,
    ) as EnsembleVariable[]) {
      const values = Array.from({ length: 40 }, (_, member) => {
        const key =
          member === 0
            ? variable
            : `${variable}_member${String(member).padStart(2, "0")}`;
        const series = hourly[key];
        if (
          units[key] !== ENSEMBLE_VARIABLES[variable] ||
          !Array.isArray(series) ||
          series.length !== 24
        )
          throw new Error("Incomplete ensemble members or units");
        const value: unknown = series[i];
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          (variable !== "temperature_2m" && value < 0)
        )
          throw new Error("Invalid ensemble member value");
        return value;
      });
      ranges[variable] = {
        values,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }
    return { valid_at: `${time}:00Z`, ...ranges };
  });
  return {
    model: "icon_global",
    member_count: 40,
    grid: { latitude, longitude },
    hours,
  };
}
