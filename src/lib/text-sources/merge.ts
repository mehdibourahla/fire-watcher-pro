export type IncidentKind = "vegetation" | "agricultural" | "urban" | "unknown";
export type IncidentStatus =
  "ongoing" | "contained" | "extinguished" | "monitoring" | "unknown";
export type IncidentPrecision = "commune" | "wilaya" | "place";
export type AuthorityTier = "national" | "wilaya" | "forestry" | "media";

export type OpenIncident = {
  id: string;
  area_id: string;
  kind: IncidentKind;
  status: IncidentStatus;
  precision: IncidentPrecision;
  commune_id: string | null;
  authority_tier: AuthorityTier;
  first_reported_at: string;
  last_reported_at: string;
  as_of: string;
  place_text: string | null;
};

export type MergeMention = {
  id: string;
  area_id: string;
  commune_id: string | null;
  kind: IncidentKind;
  status: IncidentStatus;
  precision: IncidentPrecision;
  authority_tier: AuthorityTier;
  as_of: string;
  evidence: string;
  place_text: string | null;
};

export type MergeDecision =
  { action: "attach"; incidentId: string } | { action: "create" };

const MERGE_WINDOW_MS = 48 * 3_600_000;

export const TIER_RANK: Record<AuthorityTier, number> = {
  national: 3,
  wilaya: 3,
  forestry: 2,
  media: 1,
};

export function mergeDecision(
  mention: MergeMention,
  open: readonly OpenIncident[],
): MergeDecision {
  const asOf = Date.parse(mention.as_of);
  const candidates = open
    .filter(
      (i) =>
        i.area_id === mention.area_id &&
        i.kind === mention.kind &&
        Date.parse(i.last_reported_at) >= asOf - MERGE_WINDOW_MS &&
        Date.parse(i.first_reported_at) <= asOf + MERGE_WINDOW_MS,
    )
    .sort((a, b) => b.last_reported_at.localeCompare(a.last_reported_at));
  const best = candidates[0];
  return best
    ? { action: "attach", incidentId: best.id }
    : { action: "create" };
}

export type IncidentUpdate = Pick<
  OpenIncident,
  | "status"
  | "precision"
  | "commune_id"
  | "authority_tier"
  | "first_reported_at"
  | "last_reported_at"
  | "as_of"
  | "place_text"
> & {
  latest_mention_id: string | null;
  evidence: string | null;
  unlisted_at: null;
};

export function nextIncidentState(
  incident: OpenIncident,
  mention: MergeMention,
): IncidentUpdate {
  const outranked =
    TIER_RANK[mention.authority_tier] < TIER_RANK[incident.authority_tier];
  const newer = mention.as_of >= incident.as_of;
  const setsStatus = !outranked && newer;
  const gainsCommune =
    incident.commune_id === null && mention.commune_id !== null;
  return {
    // a fresh mention re-lists an incident an earlier bulletin had dropped
    unlisted_at: null,
    status: setsStatus ? mention.status : incident.status,
    authority_tier: setsStatus
      ? mention.authority_tier
      : incident.authority_tier,
    as_of: setsStatus ? mention.as_of : incident.as_of,
    latest_mention_id: setsStatus ? mention.id : null,
    evidence: setsStatus ? mention.evidence : null,
    place_text: setsStatus
      ? (mention.place_text ?? incident.place_text)
      : incident.place_text,
    commune_id: gainsCommune ? mention.commune_id : incident.commune_id,
    precision: gainsCommune ? "commune" : incident.precision,
    first_reported_at:
      mention.as_of < incident.first_reported_at
        ? mention.as_of
        : incident.first_reported_at,
    last_reported_at:
      mention.as_of > incident.last_reported_at
        ? mention.as_of
        : incident.last_reported_at,
  };
}
