export const CIVIL_PUBLICATION_MAX_AGE_HOURS = 72;
export type CivilHazard = "fire" | "weather" | "flood" | "road" | "other";

export type CivilPublication = {
  id: string;
  ita_report_id: string;
  incident_index: number;
  hazard: CivilHazard;
  summary: string;
  area_id: string;
  source_name: string;
  source_url: string;
  source_published_at: string;
  expires_at: string;
  state: "published" | "withdrawn";
  revision: number;
  cap_references: { revision: number; sent: string }[];
  published_at: string;
  updated_at: string;
  area: {
    id: string;
    code: string;
    level: string;
    parent_id: string | null;
    lat: number;
    lon: number;
    name_fr: string;
    name_ar: string;
    name_en: string;
    name_kab: string | null;
  } | null;
};

export function civilPublicationLifecycle(
  publication: Pick<CivilPublication, "state" | "expires_at">,
  now = Date.now(),
): "active" | "expired" | "withdrawn" {
  if (publication.state === "withdrawn") return "withdrawn";
  return Date.parse(publication.expires_at) > now ? "active" : "expired";
}

export function isCivilPublicationActive(
  publication: Pick<CivilPublication, "state" | "expires_at">,
  now = Date.now(),
) {
  return civilPublicationLifecycle(publication, now) === "active";
}
