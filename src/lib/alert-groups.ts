import type { Alert } from "./alerts";
import { firePhase, type Phase } from "./incident-lifecycle";

export type AlertGroup = {
  key: string;
  latest: Alert;
  messages: Alert[];
  unread: number;
};

const algiersDay = (at: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(
    new Date(at),
  );

function groupKey(alert: Alert) {
  if (alert.kind === "fire" && alert.cluster_id)
    return `fire:${alert.cluster_id}`;
  if (alert.kind === "risk")
    return `risk:${alert.zone_id}:${algiersDay(alert.created_at)}`;
  if (alert.source_id) return `${alert.kind}:${alert.source_id}`;
  return `alert:${alert.id}`;
}

export function groupAlerts(alerts: readonly Alert[]): AlertGroup[] {
  const groups = new Map<string, Alert[]>();
  for (const alert of alerts) {
    const key = groupKey(alert);
    groups.set(key, [...(groups.get(key) ?? []), alert]);
  }
  return [...groups]
    .map(([key, messages]) => {
      const sorted = [...messages].sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
      );
      return {
        key,
        latest: sorted[0]!,
        messages: sorted,
        unread: sorted.filter((m) => !m.read_at).length,
      };
    })
    .sort(
      (a, b) =>
        Date.parse(b.latest.created_at) - Date.parse(a.latest.created_at),
    );
}

export function groupPhase(
  group: AlertGroup,
  fires: ReadonlyMap<
    string,
    { state: string; last_detected_at: string; resolved_at: string | null }
  >,
  now: number,
): Phase {
  const { latest } = group;
  if (latest.kind === "risk")
    return algiersDay(latest.created_at) === algiersDay(now)
      ? "live"
      : "archived";
  // an expiry is the end of the notice period, never an all-clear
  const expires = latest.payload?.expires_at;
  if (latest.kind !== "fire")
    return expires && Date.parse(expires) > now ? "live" : "archived";
  const fire = latest.cluster_id ? fires.get(latest.cluster_id) : undefined;
  return fire ? firePhase(fire, now) : "archived";
}
