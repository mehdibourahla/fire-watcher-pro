export type ZoneFireHistory = {
  id: string;
  user_id: string;
  zone_id: string | null;
  cluster_id: string | null;
  created_at: string;
  payload: unknown;
};

export type ZoneStateEvent = {
  id: string;
  cluster_id: string;
  event: string;
  at: string;
  payload: unknown;
};

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export function zoneLifecycle(
  cluster: {
    id: string;
    state: string;
    est_area_ha: number | null;
    max_frp_mw: number | null;
    last_detected_at: string;
  },
  history: ZoneFireHistory[],
  events: ZoneStateEvent[],
  userId: string,
  zoneId: string,
  now: Date,
): {
  phase: "growth" | "observation_ended";
  key: string;
  event_id?: string;
} | null {
  const previous = history
    .filter(
      (a) =>
        a.user_id === userId &&
        a.zone_id === zoneId &&
        a.cluster_id === cluster.id,
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const last = previous[0];
  if (!last) return null;
  const payload = object(last.payload);
  if (cluster.state === "contained_guess") {
    const event = events
      .filter(
        (e) =>
          e.cluster_id === cluster.id &&
          e.event === "state:contained_guess" &&
          object(e.payload)["from"] === "active",
      )
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    if (
      !event ||
      Date.parse(event.at) < Date.parse(last.created_at) ||
      Date.parse(event.at) < Date.parse(cluster.last_detected_at) ||
      Date.parse(event.at) > now.getTime() ||
      previous.some((a) => object(a.payload)["event_id"] === event.id)
    )
      return null;
    return {
      phase: "observation_ended",
      key: `ended:${zoneId}:${cluster.id}:${event.id}`,
      event_id: event.id,
    };
  }
  if (
    cluster.state !== "active" ||
    now.getTime() - Date.parse(last.created_at) < 45 * 60_000
  )
    return null;
  const observed = Date.parse(cluster.last_detected_at);
  const priorObserved = Date.parse(
    String(payload["last_detected_at"] ?? last.created_at),
  );
  if (
    !Number.isFinite(observed) ||
    !Number.isFinite(priorObserved) ||
    observed <= priorObserved ||
    observed > now.getTime()
  )
    return null;
  const doubles = (value: number | null, baseline: unknown) =>
    typeof baseline === "number" &&
    Number.isFinite(baseline) &&
    baseline > 0 &&
    value !== null &&
    Number.isFinite(value) &&
    value >= baseline * 2;
  if (
    !doubles(cluster.est_area_ha, payload["est_area_ha"]) &&
    !doubles(cluster.max_frp_mw, payload["max_frp_mw"])
  )
    return null;
  return { phase: "growth", key: `growth:${zoneId}:${cluster.id}:${last.id}` };
}
