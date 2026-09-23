import { z } from "zod/v4";

export const CivilDecisionSchema = z
  .object({
    outcome: z.enum(["publish", "hold", "discard", "review"]),
    reason: z.string().min(1).max(2000),
    area_id: z.uuid().nullable(),
    hazard: z.enum(["fire", "weather", "flood", "road", "other"]),
    summary: z.string().min(1).max(2000),
    location_evidence: z.string().min(1).max(2000).nullable(),
    expires_at: z.iso.datetime({ offset: true }).nullable(),
    duplicate_id: z.uuid().nullable(),
    official_match: z
      .object({
        incident_id: z.uuid(),
        mention_id: z.uuid(),
        relationship: z.enum(["duplicate", "context", "conflict"]),
        reason: z.string().min(1).max(2000),
        source_quote: z.string().min(1).max(2000),
        official_quote: z.string().min(1).max(2000),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type CivilDecision = z.infer<typeof CivilDecisionSchema>;
// Immutable v1 decisions predate official-source comparisons.
export const StoredCivilDecisionSchema = CivilDecisionSchema.extend({
  official_match: CivilDecisionSchema.shape.official_match
    .optional()
    .default(null),
});
export type CivilArea = {
  id: string;
  name_fr: string;
  name_ar: string;
  level: string;
  parent_id: string | null;
  wilaya?: string | null;
  matched?: string;
};
export type CivilAgentTrace = {
  action: "search_areas" | "recent_publications" | "official_reports";
  query: string | null;
  parent_id: string | null;
  results:
    | CivilArea[]
    | CivilOfficialEvidence[]
    | {
        id: string;
        summary: string;
        source_published_at: string;
        area_id: string;
      }[];
};

export type CivilOfficialEvidence = {
  id: string;
  mention_id: string;
  evidence: string;
  status: string;
  as_of: string;
  kind: string;
  place_text: string | null;
  wilaya_id: string;
  commune_id: string | null;
  source_url: string;
  source_published_at: string;
};
