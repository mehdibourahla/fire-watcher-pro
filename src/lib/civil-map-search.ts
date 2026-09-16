export type MapSearch = {
  area?: string | undefined;
  event?: string | undefined;
  hazard: "all" | "fire" | "weather" | "road" | "other";
  ended: boolean;
  candidates: boolean;
};

export function parseMapSearch(input: Record<string, unknown>): MapSearch {
  const text = (value: unknown) =>
    typeof value === "string" && value.length > 0 && value.length <= 100
      ? value
      : undefined;
  const area = text(input["area"]);
  const event = text(input["event"]);
  const hazard = ["fire", "weather", "road", "other"].includes(
    String(input["hazard"]),
  )
    ? (input["hazard"] as MapSearch["hazard"])
    : "all";
  return {
    ...(area ? { area } : {}),
    ...(event ? { event } : {}),
    hazard,
    ended: input["ended"] === true || input["ended"] === "true",
    candidates: input["candidates"] === true || input["candidates"] === "true",
  };
}
