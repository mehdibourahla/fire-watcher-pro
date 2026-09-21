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
  })
  .strict();
export type CivilDecision = z.infer<typeof CivilDecisionSchema>;
export type CivilArea = {
  id: string;
  name_fr: string;
  name_ar: string;
  level: string;
  parent_id: string | null;
};
export type CivilAgentTrace = {
  action: "search_areas" | "recent_publications";
  query: string | null;
  parent_id: string | null;
  results:
    | CivilArea[]
    | {
        id: string;
        summary: string;
        source_published_at: string;
        area_id: string;
      }[];
};
