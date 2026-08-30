/* Forecast days are labelled in Africa/Algiers (UTC+1, no DST); using the UTC
 * date shifts "today" by one for runs between 23:00 and 00:00 UTC. */
export function algiersToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
  }).format(now);
}
