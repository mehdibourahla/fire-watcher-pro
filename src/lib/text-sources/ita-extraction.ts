import { z } from "zod/v4";
const Incident = z
  .object({
    kind: z.enum([
      "collision",
      "roadworks",
      "congestion",
      "road_hazard",
      "flooding",
      "fire",
      "weather",
      "other",
    ]),
    summary_fr: z.string(),
    evidence: z.string(),
    location_text: z.string().nullable(),
    location_evidence: z.string().nullable(),
    direction_text: z.string().nullable(),
    direction_evidence: z.string().nullable(),
    current_status: z.enum(["ongoing", "resolved", "unknown"]),
    status_evidence: z.string().nullable(),
    region_assessment: z.enum(["consistent", "conflicting", "unverified"]),
    review_reasons: z.array(z.string()),
  })
  .strict();
export const ItaExtractionSchema = z
  .object({
    disposition: z.enum(["incident_report", "general_information", "unclear"]),
    incidents: z.array(Incident),
    review_reasons: z.array(z.string()),
  })
  .strict();
export type ItaExtraction = z.infer<typeof ItaExtractionSchema>;
