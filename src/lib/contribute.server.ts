import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  validateIdea,
  type Deficits,
  type IdeaRejection,
  type NewIdea,
} from "@/lib/contribute";

/** -1 marks a count that could not be read, so the card renders a dash instead
 * of a wrong number on a page whose whole argument is that the numbers are real. */
export const UNKNOWN = -1;

async function count(
  query: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  try {
    const { count: n, error } = await query;
    if (error) return UNKNOWN;
    return n ?? 0;
  } catch {
    return UNKNOWN;
  }
}

export async function readDeficits(): Promise<Deficits> {
  const head = { count: "exact" as const, head: true };
  const [
    openAreasTotal,
    openAreasVerified,
    communesTotal,
    communesWithFuel,
    alertsDelivered,
  ] = await Promise.all([
    count(supabaseAdmin.from("open_areas").select("id", head)),
    count(
      supabaseAdmin
        .from("open_areas")
        .select("id", head)
        .not("verified_at", "is", null),
    ),
    count(
      supabaseAdmin
        .from("admin_units")
        .select("id", head)
        .eq("level", "commune"),
    ),
    count(
      supabaseAdmin
        .from("admin_units")
        .select("id", head)
        .eq("level", "commune")
        .gt("forest_fraction", 0),
    ),
    count(supabaseAdmin.from("alerts").select("id", head)),
  ]);

  return {
    openAreasTotal,
    openAreasVerified,
    communesTotal,
    communesWithFuel,
    alertsDelivered,
    localesShipped: 4,
    localesReviewed: 3,
    measuredAt: new Date().toISOString(),
  };
}

export type SubmitOutcome =
  | { ok: true; id: string }
  | { ok: false; reason: IdeaRejection | "rateLimited" | "failed" };

export async function submitIdea(
  input: NewIdea,
  ip: string,
): Promise<SubmitOutcome> {
  const rejection = validateIdea(input);
  if (rejection) return { ok: false, reason: rejection };

  if (!(await consume(`contribute-idea:${ip}`, 5, 3600)))
    return { ok: false, reason: "rateLimited" };

  const { data, error } = await supabaseAdmin
    .from("contribution_ideas")
    .insert({
      lane: input.lane,
      message: input.message.trim(),
      contact: input.contact?.trim() || null,
      locale: input.locale ?? "en",
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, reason: "failed" };
  return { ok: true, id: data.id };
}

export type VoteOutcome =
  { ok: true; score: number } | { ok: false; reason: "rateLimited" | "failed" };

export async function castVote(
  ideaId: string,
  voterKey: string,
  value: number,
  ip: string,
): Promise<VoteOutcome> {
  if (voterKey.length < 8 || voterKey.length > 64)
    return { ok: false, reason: "failed" };
  if (value !== 1 && value !== -1) return { ok: false, reason: "failed" };

  if (!(await consume(`contribute-vote:${ip}`, 60, 3600)))
    return { ok: false, reason: "rateLimited" };

  const { data, error } = await supabaseAdmin.rpc("vote_on_idea", {
    _idea: ideaId,
    _voter: voterKey,
    _value: value,
  });
  if (error) return { ok: false, reason: "failed" };
  return { ok: true, score: Number(data ?? 0) };
}

// Fails open: an unreachable limiter must not take submissions down with it, and
// moderation is what actually decides whether anything reaches the board.
async function consume(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("consume_rate_limit", {
    _bucket: bucket,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) return true;
  return data !== false;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return (
    request.headers.get("cf-connecting-ip") ||
    forwarded.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
