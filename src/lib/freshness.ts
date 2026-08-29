import type { DataSource } from "@/lib/nadhir";

/* Health rows are written BY the pipeline, so a dead scheduler leaves them green
 * forever. Staleness must therefore be computed at read time by the display. */
export const SOURCE_MAX_AGE_MIN: Record<string, number> = {
  firms: 60,
  fci: 60,
  geo: 60,
  openmeteo: 60,
  local_fwi: 30 * 60,
};

export function sourceStale(
  source: Pick<DataSource, "name" | "status" | "last_ok_at">,
  now: number = Date.now(),
): boolean {
  if (source.status === "unavailable") return false;
  const maxMin = SOURCE_MAX_AGE_MIN[source.name];
  if (!maxMin) return false;
  if (!source.last_ok_at) return true;
  return now - new Date(source.last_ok_at).getTime() > maxMin * 60_000;
}
