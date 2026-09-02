/* Forecast days are labelled in Africa/Algiers (UTC+1, no DST); using the UTC
 * date shifts "today" by one for runs between 23:00 and 00:00 UTC. */
export function algiersToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
  }).format(now);
}

/** "02/09 20:00" — a bulletin's own as-of stamp, never the moment we relayed it. */
export function algiersClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Algiers",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(",", "");
}
