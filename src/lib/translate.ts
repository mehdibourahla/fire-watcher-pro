import { queryOptions } from "@tanstack/react-query";

import { ar } from "@/i18n/locales/ar";
import { en } from "@/i18n/locales/en";
import { fr } from "@/i18n/locales/fr";
import { kab } from "@/i18n/locales/kab";
import { supabase } from "@/integrations/supabase/client";

export const REVIEWABLE = ["ar", "fr", "kab"] as const;
export type ReviewableLocale = (typeof REVIEWABLE)[number];

export const SUGGESTION_MAX = 2000;
export const NOTE_MAX = 1000;

type Tree = { [key: string]: string | Tree };

const TREES: Record<ReviewableLocale, Tree> = {
  ar: ar as unknown as Tree,
  fr: fr as unknown as Tree,
  kab: kab as unknown as Tree,
};

export type StringRow = {
  path: string;
  group: string;
  source: string;
  current: string;
};

function walk(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string"
      ? [[path, value] as [string, string]]
      : walk(value, path);
  });
}

export function rowsFor(locale: ReviewableLocale): StringRow[] {
  const target = new Map(walk(TREES[locale]));
  return walk(en as unknown as Tree).map(([path, source]) => ({
    path,
    group: path.split(".")[0] ?? "",
    source,
    current: target.get(path) ?? "",
  }));
}

export type Group = { key: string; rows: StringRow[] };

export function groupRows(rows: StringRow[]): Group[] {
  const byKey = new Map<string, StringRow[]>();
  for (const row of rows) {
    const bucket = byKey.get(row.group);
    if (bucket) bucket.push(row);
    else byKey.set(row.group, [row]);
  }
  return [...byKey.entries()].map(([key, list]) => ({ key, rows: list }));
}

export type Verdict = "suggested" | "confirmed";

export type Draft = {
  verdict: Verdict;
  suggestion?: string;
  note?: string;
  /** Kept after sending rather than deleted, so a reviewer can see their own work. */
  sent?: boolean;
};

export type DraftMap = Record<string, Draft>;

export function isSubmittable(draft: Draft): boolean {
  if (draft.sent) return false;
  if (draft.verdict === "confirmed") return true;
  const text = (draft.suggestion ?? "").trim();
  return text.length > 0 && text.length <= SUGGESTION_MAX;
}

export function countSubmittable(drafts: DraftMap): number {
  return Object.values(drafts).filter(isSubmittable).length;
}

export function markSent(drafts: DraftMap): DraftMap {
  const next: DraftMap = {};
  for (const [path, draft] of Object.entries(drafts)) {
    next[path] = isSubmittable(draft) ? { ...draft, sent: true } : draft;
  }
  return next;
}

export type MyStatus = {
  status: SuggestionStatus;
  suggestion: string | null;
  moderationNote: string | null;
};

export type MyStatusMap = Record<string, MyStatus>;

export function summarise(drafts: DraftMap, statuses: MyStatusMap) {
  let accepted = 0;
  let rejected = 0;
  let awaiting = 0;
  let unsent = 0;
  for (const [path, draft] of Object.entries(drafts)) {
    if (!draft.sent) {
      unsent += 1;
      continue;
    }
    const status = statuses[path]?.status;
    if (status === "accepted") accepted += 1;
    else if (status === "rejected") rejected += 1;
    else awaiting += 1;
  }
  return {
    reviewed: Object.keys(drafts).length,
    accepted,
    rejected,
    awaiting,
    unsent,
  };
}

/** A review of every string is not one sitting, so drafts survive a closed tab. */
export function draftStorageKey(locale: string) {
  return `nadhir.translate.${locale}`;
}

export function readDrafts(locale: string): DraftMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(draftStorageKey(locale));
    return raw ? (JSON.parse(raw) as DraftMap) : {};
  } catch {
    return {};
  }
}

export function writeDrafts(locale: string, drafts: DraftMap) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(draftStorageKey(locale), JSON.stringify(drafts));
  } catch {
    // a full or blocked store must not break the page
  }
}

const REVIEWER_KEY = "nadhir.reviewerKey";

export function readReviewerKey(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    const existing = localStorage.getItem(REVIEWER_KEY);
    if (existing && existing.length >= 8) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(REVIEWER_KEY, fresh);
    return fresh;
  } catch {
    return "";
  }
}

export type SuggestionStatus = "pending" | "accepted" | "rejected";

export type TranslationSuggestion = {
  id: string;
  created_at: string;
  locale: string;
  key_path: string;
  source_text: string;
  current_text: string;
  suggestion: string | null;
  verdict: Verdict;
  note: string | null;
  reviewer_name: string | null;
  status: SuggestionStatus;
};

export const suggestionQueueQuery = queryOptions({
  queryKey: ["translation-suggestions", "queue"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("translation_suggestions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as TranslationSuggestion[];
  },
});

export async function moderateSuggestion(id: string, status: SuggestionStatus) {
  const { error } = await supabase
    .from("translation_suggestions")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
