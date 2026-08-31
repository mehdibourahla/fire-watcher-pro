import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export const LANES = [
  "local",
  "language",
  "audio",
  "institutional",
  "science",
  "research",
  "coordination",
  "testing",
  "code",
  "other",
] as const;
export type Lane = (typeof LANES)[number];

export const IDEA_MIN = 25;
export const IDEA_MAX = 2000;
export const CONTACT_MAX = 200;

export type IdeaStatus = "pending" | "published" | "rejected" | "spam";

export type ContributionIdea = {
  id: string;
  created_at: string;
  lane: Lane;
  message: string;
  contact: string | null;
  locale: string;
  status: IdeaStatus;
  score: number;
  published_at: string | null;
  moderation_note: string | null;
};

export type PublishedIdea = Pick<
  ContributionIdea,
  "id" | "lane" | "message" | "score" | "published_at"
>;

export type NewIdea = {
  lane: string;
  message: string;
  contact?: string | null | undefined;
  locale?: string | undefined;
  /** Must stay empty — a filled value means a bot completed every field. */
  website?: string | undefined;
};

export type IdeaRejection =
  "honeypot" | "lane" | "tooShort" | "tooLong" | "contactTooLong";

export function validateIdea(input: NewIdea): IdeaRejection | null {
  if (input.website) return "honeypot";
  if (!LANES.includes(input.lane as Lane)) return "lane";
  const message = input.message.trim();
  if (message.length < IDEA_MIN) return "tooShort";
  if (message.length > IDEA_MAX) return "tooLong";
  if ((input.contact ?? "").length > CONTACT_MAX) return "contactTooLong";
  return null;
}

const VOTER_KEY_STORAGE = "nadhir.voterKey";

/** Anonymous and per-browser: registration is unreachable, so a vote cannot be
 * tied to an account. Clearing storage earns another vote — deliberately cheap. */
export function readVoterKey(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    const existing = localStorage.getItem(VOTER_KEY_STORAGE);
    if (existing && existing.length >= 8) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(VOTER_KEY_STORAGE, fresh);
    return fresh;
  } catch {
    return "";
  }
}

export type Deficits = {
  openAreasTotal: number;
  openAreasVerified: number;
  communesTotal: number;
  communesWithFuel: number;
  alertsDelivered: number;
  localesShipped: number;
  localesReviewed: number;
  measuredAt: string;
};

export function percent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

export const publishedIdeasQuery = queryOptions({
  queryKey: ["contribution-ideas", "published"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("contribution_ideas")
      .select("id, lane, message, score, published_at")
      .eq("status", "published")
      .order("score", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PublishedIdea[];
  },
});

export const ideaQueueQuery = queryOptions({
  queryKey: ["contribution-ideas", "queue"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("contribution_ideas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ContributionIdea[];
  },
});

export async function moderateIdea(
  id: string,
  status: IdeaStatus,
  note?: string,
) {
  const { error } = await supabase
    .from("contribution_ideas")
    .update({
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      moderation_note: note ?? null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
