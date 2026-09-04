import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ar } from "@/i18n/locales/ar";
import { fr } from "@/i18n/locales/fr";
import { kab } from "@/i18n/locales/kab";
import { sectionsFor } from "./admin-access";
import type { AppRole } from "./roles";

export type TriageInput = {
  killSwitchEngaged: boolean;
  staleSources: string[];
  riskUnpublished: boolean;
  firesAwaiting: number;
  translationsUnapplied: number;
  queueDepth: number;
};

export type TriageRow = { key: string; severity: 1 | 2 | 3; count?: number };

export function rankTriage(input: TriageInput): TriageRow[] {
  const rows: TriageRow[] = [];

  if (input.killSwitchEngaged) rows.push({ key: "killSwitch", severity: 1 });
  if (input.staleSources.length > 0)
    rows.push({
      key: "sourceStale",
      severity: 1,
      count: input.staleSources.length,
    });
  if (input.riskUnpublished) rows.push({ key: "riskUnpublished", severity: 1 });
  if (input.firesAwaiting > 0)
    rows.push({
      key: "firesAwaiting",
      severity: 2,
      count: input.firesAwaiting,
    });
  if (input.translationsUnapplied > 0)
    rows.push({
      key: "translationUnapplied",
      severity: 2,
      count: input.translationsUnapplied,
    });
  if (input.queueDepth > 0)
    rows.push({ key: "queueDepth", severity: 3, count: input.queueDepth });

  return rows.sort((a, b) => a.severity - b.severity);
}

const UNRESOLVED_FIRE_STATES = ["unconfirmed", "active", "contained_guess"];

const BUNDLES: Record<string, object> = { ar, fr, kab };

function readPath(tree: object, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      tree,
    );
}

async function operatorSignals() {
  const [settings, health, checkpoint, fires] = await Promise.all([
    supabase
      .from("broadcast_settings")
      .select("enabled")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("source_health")
      .select("key")
      .in("state", ["degraded", "stale"]),
    supabase
      .from("risk_publication_checkpoint")
      .select("base_date")
      .order("base_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("fire_clusters")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null)
      .gte("confidence", 0.6)
      .in("state", UNRESOLVED_FIRE_STATES),
  ]);

  for (const step of [settings, health, checkpoint, fires]) {
    if (step.error) throw new Error(step.error.message);
  }

  const today = new Date().toISOString().slice(0, 10);
  return {
    killSwitchEngaged: settings.data ? !settings.data.enabled : false,
    staleSources: (health.data ?? []).map((row) => row.key ?? "unknown"),
    riskUnpublished: checkpoint.data?.base_date !== today,
    firesAwaiting: fires.count ?? 0,
  };
}

async function queueSignals() {
  const [reports, suggestions] = await Promise.all([
    supabase
      .from("citizen_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.rpc("list_translation_suggestions_for_moderation"),
  ]);

  if (reports.error) throw new Error(reports.error.message);
  if (suggestions.error) throw new Error(suggestions.error.message);

  const rows = suggestions.data ?? [];

  // Accepted is not shipped: the text only lands when someone runs apply:translations.
  const unapplied = rows.filter((row) => {
    if (row.status !== "accepted" || !row.suggestion) return false;
    const bundle = BUNDLES[row.locale];
    return bundle ? readPath(bundle, row.key_path) !== row.suggestion : false;
  });

  return {
    translationsUnapplied: unapplied.length,
    queueDepth:
      (reports.count ?? 0) +
      rows.filter((row) => row.status === "pending").length,
  };
}

export function adminTriageQuery(roles: AppRole[]) {
  const reachable = new Set(sectionsFor(roles).map((section) => section.key));
  return queryOptions({
    queryKey: ["admin", "triage", [...reachable].sort()],
    queryFn: async (): Promise<TriageInput> => ({
      killSwitchEngaged: false,
      staleSources: [],
      riskUnpublished: false,
      firesAwaiting: 0,
      translationsUnapplied: 0,
      queueDepth: 0,
      ...(reachable.has("sources") ? await operatorSignals() : {}),
      ...(reachable.has("queues") ? await queueSignals() : {}),
    }),
    staleTime: 60_000,
  });
}
