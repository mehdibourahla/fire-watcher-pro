import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  NOTE_MAX,
  REVIEWABLE,
  SUGGESTION_MAX,
  type ReviewableLocale,
} from "@/lib/translate";

export type IncomingSuggestion = {
  keyPath: string;
  sourceText: string;
  currentText: string;
  suggestion?: string | null | undefined;
  verdict: string;
  note?: string | null | undefined;
};

export type SubmitResult =
  | { ok: true; saved: number }
  | {
      ok: false;
      reason: "locale" | "empty" | "tooMany" | "rateLimited" | "failed";
    };

const MAX_PER_BATCH = 200;

export async function submitSuggestions(
  locale: string,
  reviewerKey: string,
  reviewerName: string | null,
  rows: IncomingSuggestion[],
  ip: string,
): Promise<SubmitResult> {
  if (!REVIEWABLE.includes(locale as ReviewableLocale))
    return { ok: false, reason: "locale" };
  if (reviewerKey.length < 8 || reviewerKey.length > 64)
    return { ok: false, reason: "failed" };
  if (rows.length === 0) return { ok: false, reason: "empty" };
  if (rows.length > MAX_PER_BATCH) return { ok: false, reason: "tooMany" };

  if (!(await consume(`translate:${ip}`, 20, 3600)))
    return { ok: false, reason: "rateLimited" };

  const clean = rows
    .filter((r) => r.verdict === "suggested" || r.verdict === "confirmed")
    .map((r) => ({
      locale,
      key_path: r.keyPath.slice(0, 200),
      source_text: r.sourceText,
      current_text: r.currentText,
      suggestion:
        r.verdict === "confirmed"
          ? null
          : (r.suggestion ?? "").trim().slice(0, SUGGESTION_MAX) || null,
      verdict: r.verdict,
      note: r.note ? r.note.trim().slice(0, NOTE_MAX) : null,
      reviewer_key: reviewerKey,
      reviewer_name: reviewerName ? reviewerName.trim().slice(0, 80) : null,
    }))
    .filter((r) => r.verdict === "confirmed" || r.suggestion !== null);

  if (clean.length === 0) return { ok: false, reason: "empty" };

  // one reviewer holds one opinion per string; re-submitting replaces it
  const { error } = await supabaseAdmin
    .from("translation_suggestions")
    .upsert(clean, { onConflict: "locale,key_path,reviewer_key" });

  if (error) return { ok: false, reason: "failed" };
  return { ok: true, saved: clean.length };
}

export type MyRow = {
  keyPath: string;
  status: string;
  suggestion: string | null;
  moderationNote: string | null;
};

/** A reviewer's own submissions, keyed by the browser key they carry. Runs
 * server-side because anon deliberately cannot read the table. */
export async function readMySuggestions(
  locale: string,
  reviewerKey: string,
): Promise<MyRow[]> {
  if (!REVIEWABLE.includes(locale as ReviewableLocale)) return [];
  if (reviewerKey.length < 8 || reviewerKey.length > 64) return [];

  const { data, error } = await supabaseAdmin
    .from("translation_suggestions")
    .select("key_path, status, suggestion, moderation_note")
    .eq("locale", locale)
    .eq("reviewer_key", reviewerKey)
    .limit(1000);

  if (error || !data) return [];
  return data.map((row) => ({
    keyPath: row.key_path,
    status: row.status,
    suggestion: row.suggestion,
    moderationNote: row.moderation_note,
  }));
}

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
