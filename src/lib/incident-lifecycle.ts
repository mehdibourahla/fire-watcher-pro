import {
  CIVIL_PUBLICATION_MAX_AGE_HOURS,
  type CivilHazard,
} from "./civil-publication";

export type Phase = "upcoming" | "live" | "fading" | "archived" | "ended";

const HOUR = 3_600_000;
export const FIRE_LEASE_HOURS = 6;
// fusion stops attaching new detections to a cluster silent this long
const FIRE_ARCHIVE_HOURS = 24;
const OFFICIAL_LEASE_HOURS = 24;
const ARCHIVE_HOURS = 72;
const REPORT_ARCHIVE_HOURS = 24;
const REPORT_LEGACY_LEASE_HOURS = 3;
const CIVIL_LEASE_HOURS: Record<CivilHazard, number> = {
  road: 2,
  fire: 3,
  flood: 6,
  weather: 6,
  other: 6,
};

export const civilLeaseHours = (hazard: CivilHazard) =>
  CIVIL_LEASE_HOURS[hazard];

export function civilDefaultExpiry(
  sourcePublishedAt: string,
  hazard: CivilHazard,
  now: number,
) {
  const source = Date.parse(sourcePublishedAt);
  return new Date(
    Math.min(
      Math.max(source, now) + civilLeaseHours(hazard) * HOUR,
      source + CIVIL_PUBLICATION_MAX_AGE_HOURS * HOUR,
    ),
  ).toISOString();
}

export const isVisibleByDefault = (phase: Phase) =>
  phase === "upcoming" || phase === "live";

function ageHours(at: string | null, now: number) {
  const time = at === null ? NaN : Date.parse(at);
  return Number.isFinite(time) ? (now - time) / HOUR : Infinity;
}

function byAge(age: number, lease: number, archive: number): Phase {
  if (age < lease) return "live";
  return age < archive ? "fading" : "archived";
}

export function firePhase(
  fire: { state: string; last_detected_at: string; resolved_at: string | null },
  now: number,
): Phase {
  if (fire.state === "extinguished" && fire.resolved_at !== null)
    return "ended";
  return byAge(
    ageHours(fire.last_detected_at, now),
    FIRE_LEASE_HOURS,
    FIRE_ARCHIVE_HOURS,
  );
}

export function officialPhase(
  incident: {
    status: string;
    last_reported_at: string;
    unlisted_at: string | null;
  },
  now: number,
): Phase {
  if (incident.status === "extinguished") return "ended";
  const phase = byAge(
    ageHours(incident.last_reported_at, now),
    OFFICIAL_LEASE_HOURS,
    ARCHIVE_HOURS,
  );
  return phase === "live" && incident.unlisted_at !== null ? "fading" : phase;
}

// witnesses extend a report, so its own expiry, not its age, decides its phase
export function reportPhase(
  report: { expires_at: string | null; observed_at: string },
  now: number,
): Phase {
  if (!report.expires_at)
    return byAge(
      ageHours(report.observed_at, now),
      REPORT_LEGACY_LEASE_HOURS,
      REPORT_ARCHIVE_HOURS,
    );
  const left = (Date.parse(report.expires_at) - now) / HOUR;
  if (left <= 0) return "archived";
  return left > 1 ? "live" : "fading";
}

export function publicationPhase(
  publication: {
    state: string;
    expires_at: string;
    source_published_at: string;
  },
  now: number,
): Phase {
  if (publication.state === "withdrawn") return "archived";
  if (ageHours(publication.expires_at, now) < 0) return "live";
  return ageHours(publication.source_published_at, now) < ARCHIVE_HOURS
    ? "fading"
    : "archived";
}

export function warningPhase(
  warning: {
    onset: string | null;
    expires: string | null;
    superseded_at: string | null;
  },
  now: number,
): Phase {
  if (warning.superseded_at !== null) return "archived";
  if (warning.expires !== null && !(ageHours(warning.expires, now) < 0))
    return "ended";
  if (warning.onset !== null && ageHours(warning.onset, now) < 0)
    return "upcoming";
  return "live";
}
