import { archivedFetch } from "@/lib/source-archive.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllPages } from "@/lib/paginate";
import { getSourceArchiveContext } from "@/lib/source-archive-context.server";
import type { Json } from "@/integrations/supabase/types";

import { parseDgpcBulletin, type DgpcBulletin } from "./dgpc-template";
import {
  extractMentionsWithLlm,
  type LlmExtractionInput,
  type LlmExtractionResult,
  type LlmMention,
} from "./extract-llm.server";
import {
  mergeDecision,
  nextIncidentState,
  type AuthorityTier,
  type IncidentKind,
  type IncidentStatus,
  type IncidentUpdate,
  type MergeMention,
  type OpenIncident,
} from "./merge";
import {
  resolveCommune,
  resolveWilaya,
  type CommuneCandidate,
} from "./normalize";
import { fetchNewTelegramPosts, type TelegramPost } from "./telegram-public";

export type TextSource = {
  id: string;
  key: string;
  kind: "telegram_public";
  url: string;
  authority_tier: AuthorityTier;
  language: string;
  wilaya_id: string | null;
  template: "dgpc_bulletin" | null;
};

export type DocumentInsert = {
  text_source_id: string;
  external_id: string;
  url: string;
  published_at: string;
  content_hash: string;
  body: string;
};

export type MentionInsert = {
  document_id: string;
  text_source_id: string;
  wilaya_id: string;
  commune_id: string | null;
  place_text: string | null;
  kind: IncidentKind;
  status: IncidentStatus;
  fire_count: number;
  as_of: string;
  precision: "commune" | "wilaya" | "place";
  evidence: string;
  extractor: "template" | "llm";
};

export type IncidentInsert = {
  wilaya_id: string;
  commune_id: string | null;
  kind: IncidentKind;
  status: IncidentStatus;
  precision: "commune" | "wilaya" | "place";
  authority_tier: AuthorityTier;
  place_text: string | null;
  first_reported_at: string;
  last_reported_at: string;
  as_of: string;
  latest_mention_id: string;
  evidence: string;
};

export type Gazetteer = {
  wilayas: { id: string; name_ar: string }[];
  communesByWilaya: Map<string, CommuneCandidate[]>;
};

export type TextSourceStore = {
  loadSource: (key: string) => Promise<TextSource | null>;
  knownExternalIds: (sourceId: string) => Promise<Set<string>>;
  insertDocuments: (
    rows: DocumentInsert[],
  ) => Promise<(DocumentInsert & { id: string })[]>;
  loadGazetteer: () => Promise<Gazetteer>;
  insertMentions: (
    rows: MentionInsert[],
  ) => Promise<(MentionInsert & { id: string; inserted: boolean })[]>;
  openIncidents: (areaIds: string[], since: string) => Promise<OpenIncident[]>;
  applyMention: (
    mentionId: string,
    change:
      | { incidentId: string; update: IncidentUpdate }
      | { insert: IncidentInsert },
  ) => Promise<{ id: string; applied: boolean }>;
  pendingCount: (sourceId: string) => Promise<number>;
  listedIncidents: (
    before: string,
  ) => Promise<{ id: string; area_id: string }[]>;
  markUnlisted: (ids: string[], asOf: string) => Promise<void>;
  confirmClusters: (
    rows: { communeId: string; asOf: string; mentionId: string }[],
  ) => Promise<number>;
  retryableDocuments: (
    sourceId: string,
  ) => Promise<(DocumentInsert & { id: string })[]>;
  recordExtractionFailure: (
    documentId: string,
    message: string,
  ) => Promise<void>;
  clearExtractionFailure: (documentId: string) => Promise<void>;
};

export type TextSourcePipelineDependencies = {
  now?: () => Date;
  store: TextSourceStore;
  fetchPosts: (
    source: TextSource,
    known: Set<string>,
  ) => Promise<TelegramPost[]>;
  extractLlm: (input: LlmExtractionInput) => Promise<LlmExtractionResult>;
};

export type TextSourceRun = {
  fetched: number;
  stored: number;
  skippedPosts: number;
  mentions: number;
  resolved: number;
  unresolved: number;
  incidentsCreated: number;
  incidentsUpdated: number;
  incidentsUnlisted: number;
  gated: number;
  clustersConfirmed: number;
  retried: number;
  llmSkipped: boolean;
  llmFailed: number;
  error?: string;
};

const AGRICULTURAL = /محاصيل|تبن|أشجار مثمرة|نخيل|حبوب|قش|بساتين|زيتون/;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function kindOf(line: string): IncidentKind {
  return AGRICULTURAL.test(line) ? "agricultural" : "vegetation";
}

type Draft = Omit<MentionInsert, "document_id" | "text_source_id">;

function resolveLlmMention(
  m: LlmMention,
  asOf: string,
  gazetteer: Gazetteer,
  fallbackWilaya: string | null,
): Draft | null {
  if (m.kind === "urban") return null;
  let wilayaId =
    (m.wilaya ? resolveWilaya(m.wilaya, gazetteer.wilayas) : null) ??
    fallbackWilaya;
  let commune =
    wilayaId && m.commune
      ? resolveCommune(
          m.commune,
          gazetteer.communesByWilaya.get(wilayaId) ?? [],
        )
      : null;
  if (m.commune && !commune) {
    // the hinted wilaya can be wrong (new wilayas, national bulletins); accept a
    // name that is unambiguous nationally
    const hits = [...gazetteer.communesByWilaya.entries()].flatMap(
      ([w, cs]) => {
        const hit = resolveCommune(m.commune!, cs);
        return hit && hit.via !== "fuzzy" ? [{ w, hit }] : [];
      },
    );
    if (hits.length !== 1) return null;
    wilayaId = hits[0]!.w;
    commune = hits[0]!.hit;
  }
  if (!wilayaId) return null;
  return {
    wilaya_id: wilayaId,
    commune_id: commune?.id ?? null,
    place_text: m.place,
    kind: m.kind,
    status: m.status,
    fire_count: m.count,
    as_of: asOf,
    precision: commune ? "commune" : m.place ? "place" : "wilaya",
    evidence: m.evidence,
    extractor: "llm",
  };
}

function wilayaDraft(
  wilayaId: string,
  entry: { raw: string },
  count: number,
  asOf: string,
): Draft {
  return {
    wilaya_id: wilayaId,
    commune_id: null,
    place_text: null,
    kind: kindOf(entry.raw),
    status: "ongoing",
    fire_count: count,
    as_of: asOf,
    precision: "wilaya",
    evidence: entry.raw,
    extractor: "template",
  };
}

// The distribution lines are the authority's own per-wilaya count of ongoing fires. A
// commune the model names outside that list, or in excess of it, cannot Confirm anything.
function gateByDistribution(
  drafts: Draft[],
  parsed: Pick<DgpcBulletin, "wilayaCounts" | "totals">,
  gazetteer: Gazetteer,
  asOf: string,
): { drafts: Draft[]; gated: number } {
  const total = parsed.totals?.ongoing ?? null;
  const counts = new Map<string, { count: number; raw: string }>();
  for (const c of parsed.wilayaCounts) {
    const id = resolveWilaya(c.wilaya, gazetteer.wilayas);
    if (id) counts.set(id, { count: c.count, raw: c.raw });
  }
  const sum = [...counts.values()].reduce((n, e) => n + e.count, 0);
  // the header counts every fire not yet extinguished, mop-up included, as ongoing
  const live = (d: Draft) => d.status !== "extinguished";
  // a distribution that outnumbers its own header, or none at all, leaves only the total
  if (!counts.size || (total !== null && sum > total)) {
    if (total === null) return { drafts, gated: 0 };
    const ongoing = drafts.filter(live);
    if (ongoing.length <= total) return { drafts, gated: 0 };
    return { drafts: drafts.filter((d) => !live(d)), gated: ongoing.length };
  }
  const out = drafts.filter((d) => !live(d));
  const ongoing = new Map<string, Draft[]>();
  for (const d of drafts)
    if (live(d))
      ongoing.set(d.wilaya_id, [...(ongoing.get(d.wilaya_id) ?? []), d]);
  let gated = 0;
  for (const [wilayaId, group] of ongoing) {
    const entry = counts.get(wilayaId);
    if (!entry) {
      gated += group.length;
      continue;
    }
    if (group.length > entry.count) {
      gated += group.length;
      out.push(wilayaDraft(wilayaId, entry, entry.count, asOf));
      continue;
    }
    out.push(...group);
    if (entry.count > group.length)
      out.push(wilayaDraft(wilayaId, entry, entry.count - group.length, asOf));
  }
  for (const [wilayaId, entry] of counts)
    if (!ongoing.has(wilayaId))
      out.push(wilayaDraft(wilayaId, entry, entry.count, asOf));
  return { drafts: out, gated };
}

async function mergeMentions(
  rows: (MentionInsert & { id: string })[],
  source: TextSource,
  store: TextSourceStore,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  if (!rows.length) return { created, updated };
  const areaIds = [...new Set(rows.map((r) => r.commune_id ?? r.wilaya_id))];
  const earliest = rows.map((r) => r.as_of).sort()[0]!;
  const since = new Date(Date.parse(earliest) - 96 * 3_600_000).toISOString();
  const open = await store.openIncidents(areaIds, since);
  for (const row of rows.sort((a, b) => a.as_of.localeCompare(b.as_of))) {
    const mention: MergeMention = {
      id: row.id,
      area_id: row.commune_id ?? row.wilaya_id,
      commune_id: row.commune_id,
      kind: row.kind,
      status: row.status,
      precision: row.precision,
      authority_tier: source.authority_tier,
      as_of: row.as_of,
      evidence: row.evidence,
      place_text: row.place_text,
    };
    const decision = mergeDecision(mention, open);
    if (decision.action === "attach") {
      const current = open.find((i) => i.id === decision.incidentId)!;
      const next = nextIncidentState(current, mention);
      const applied = await store.applyMention(row.id, {
        incidentId: current.id,
        update: next,
      });
      if (!applied.applied) continue;
      Object.assign(current, next, {
        area_id: next.commune_id ?? current.area_id,
      });
      updated += 1;
      continue;
    }
    const applied = await store.applyMention(row.id, {
      insert: {
        wilaya_id: row.wilaya_id,
        commune_id: row.commune_id,
        kind: row.kind,
        status: row.status,
        precision: row.precision,
        authority_tier: source.authority_tier,
        place_text: row.place_text,
        first_reported_at: row.as_of,
        last_reported_at: row.as_of,
        as_of: row.as_of,
        latest_mention_id: row.id,
        evidence: row.evidence,
      },
    });
    if (!applied.applied) continue;
    const id = applied.id;
    open.push({
      id,
      area_id: mention.area_id,
      kind: row.kind,
      status: row.status,
      precision: row.precision,
      commune_id: row.commune_id,
      authority_tier: source.authority_tier,
      first_reported_at: row.as_of,
      last_reported_at: row.as_of,
      as_of: row.as_of,
      place_text: row.place_text,
    });
    created += 1;
  }
  return { created, updated };
}

export async function runTextSourceWith(
  key: string,
  deps: TextSourcePipelineDependencies,
): Promise<TextSourceRun> {
  const run: TextSourceRun = {
    fetched: 0,
    stored: 0,
    skippedPosts: 0,
    mentions: 0,
    resolved: 0,
    unresolved: 0,
    incidentsCreated: 0,
    incidentsUpdated: 0,
    incidentsUnlisted: 0,
    gated: 0,
    clustersConfirmed: 0,
    retried: 0,
    llmSkipped: false,
    llmFailed: 0,
  };
  const now = (deps.now?.() ?? new Date()).getTime();
  let lastLlmError: string | null = null;
  const source = await deps.store.loadSource(key);
  if (!source) return { ...run, error: `text source ${key} is not registered` };

  const known = await deps.store.knownExternalIds(source.id);
  const posts = await deps.fetchPosts(source, known);
  run.fetched = posts.length;
  const retryable = await deps.store.retryableDocuments(source.id);
  run.retried = retryable.length;
  if (!posts.length && !retryable.length) {
    const pending = await deps.store.pendingCount(source.id);
    if (pending)
      run.error = `text extraction backlog: ${pending} documents require recovery`;
    return run;
  }

  const stored = await deps.store.insertDocuments(
    await Promise.all(
      posts.map(async (p) => ({
        text_source_id: source.id,
        external_id: p.externalId,
        url: p.url,
        published_at: p.publishedAt,
        content_hash: await sha256(p.text),
        body: p.text,
      })),
    ),
  );
  run.stored = stored.length;
  const documents = [...retryable, ...stored].slice(0, 5);
  const fresh = new Set(stored.map((d) => d.id));
  const gazetteer = await deps.store.loadGazetteer();
  const inserts: MentionInsert[] = [];
  const retriedOk: string[] = [];
  const bulletins: { asOf: string; areaIds: Set<string> }[] = [];
  for (const doc of documents) {
    const parsed =
      source.template === "dgpc_bulletin"
        ? parseDgpcBulletin(doc.body, doc.published_at)
        : null;
    if (parsed && parsed.kind !== "bulletin" && parsed.kind !== "incident") {
      run.skippedPosts += 1;
      retriedOk.push(doc.id);
      continue;
    }
    const asOf = parsed?.asOf ?? doc.published_at;
    // a full bulletin is the authority's complete list of notable fires, so what it
    // omits is no longer listed; a single-incident post says nothing about the rest
    const publishedAt = Date.parse(doc.published_at);
    const asOfTime = Date.parse(asOf);
    // Daily bulletins older than 24 hours cannot establish current absence.
    const timely =
      publishedAt <= now &&
      asOfTime <= publishedAt &&
      asOfTime <= now &&
      now - asOfTime <= 24 * 60 * 60_000;
    const coverage =
      parsed?.kind === "bulletin" && fresh.has(doc.id) && timely
        ? { asOf, areaIds: new Set<string>() }
        : null;

    let result: LlmExtractionResult;
    try {
      result = await deps.extractLlm({
        text: doc.body,
        wilayaHint: null,
        language: source.language,
      });
    } catch (error) {
      run.llmFailed += 1;
      run.unresolved += 1;
      lastLlmError = error instanceof Error ? error.message : String(error);
      await deps.store.recordExtractionFailure(doc.id, lastLlmError);
      continue;
    }
    if (result.skipped) {
      run.llmSkipped = true;
      run.unresolved += 1;
      await deps.store.recordExtractionFailure(doc.id, result.reason);
      continue;
    }

    let drafts: Draft[] = [];
    const unresolvedNames: string[] = [];
    for (const m of result.mentions) {
      // wilaya-only lines are the distribution, read deterministically by the template
      if (m.kind === "urban") continue;
      if (!m.commune) {
        unresolvedNames.push(m.wilaya ?? "unnamed location");
        run.unresolved++;
        continue;
      }
      const draft = resolveLlmMention(m, asOf, gazetteer, source.wilaya_id);
      if (!draft) {
        run.unresolved += 1;
        unresolvedNames.push(m.commune);
        continue;
      }
      if (drafts.some((d) => d.commune_id === draft.commune_id)) continue;
      drafts.push(draft);
    }
    let gated = 0;
    if (parsed?.kind === "bulletin") {
      const gate = gateByDistribution(drafts, parsed, gazetteer, asOf);
      drafts = gate.drafts;
      run.gated += gate.gated;
      gated = gate.gated;
    }
    const incompleteBulletin =
      parsed?.kind === "bulletin" &&
      (!parsed.totals ||
        parsed.totals.total !==
          parsed.totals.extinguished + parsed.totals.ongoing ||
        parsed.wilayaCounts.reduce((sum, row) => sum + row.count, 0) !==
          parsed.totals.ongoing ||
        drafts.some((d) => d.extractor === "template") ||
        (parsed.totals?.ongoing != null &&
          drafts
            .filter((d) => d.status !== "extinguished")
            .reduce((n, d) => n + d.fire_count, 0) !== parsed.totals.ongoing) ||
        parsed.wilayaCounts.some(
          (c) => resolveWilaya(c.wilaya, gazetteer.wilayas) === null,
        ));
    if (incompleteBulletin && !unresolvedNames.length && !gated)
      run.unresolved++;
    // an alias added after this document was first seen can resolve it later;
    // an LLM-call failure is not the only reason a document deserves another try
    if (unresolvedNames.length || gated || incompleteBulletin)
      await deps.store.recordExtractionFailure(
        doc.id,
        `incomplete interpretation: ${unresolvedNames.join(", ") || "distribution conflict"}`,
      );
    else retriedOk.push(doc.id);
    if (
      coverage &&
      !unresolvedNames.length &&
      !gated &&
      !incompleteBulletin &&
      parsed?.totals?.ongoing != null &&
      drafts.every((d) => d.commune_id !== null) &&
      drafts
        .filter((d) => d.status !== "extinguished")
        .reduce((n, d) => n + d.fire_count, 0) === parsed.totals.ongoing &&
      parsed.wilayaCounts.every(
        (c) => resolveWilaya(c.wilaya, gazetteer.wilayas) !== null,
      )
    ) {
      for (const d of drafts) coverage.areaIds.add(d.commune_id ?? d.wilaya_id);
      bulletins.push(coverage);
    }
    inserts.push(
      ...drafts.map((d) => ({
        ...d,
        document_id: doc.id,
        text_source_id: source.id,
      })),
    );
  }

  if (run.llmFailed || run.llmSkipped || run.unresolved || run.gated)
    run.error = run.llmSkipped
      ? "LLM credentials missing"
      : `incomplete llm extraction: ${lastLlmError ?? "unresolved or gated mentions"}`;
  const rows = inserts.length ? await deps.store.insertMentions(inserts) : [];
  run.mentions = rows.filter((row) => row.inserted).length;
  run.resolved = rows.length;
  run.clustersConfirmed = await deps.store.confirmClusters(
    rows
      .filter((r) => r.commune_id !== null)
      .map((r) => ({
        communeId: r.commune_id!,
        asOf: r.as_of,
        mentionId: r.id,
      })),
  );
  const merged = await mergeMentions(rows, source, deps.store);
  run.incidentsCreated = merged.created;
  run.incidentsUpdated = merged.updated;

  for (const bulletin of bulletins.sort((a, b) =>
    a.asOf.localeCompare(b.asOf),
  )) {
    const listed = await deps.store.listedIncidents(bulletin.asOf);
    const dropped = listed
      .filter((i) => !bulletin.areaIds.has(i.area_id))
      .map((i) => i.id);
    if (!dropped.length) continue;
    await deps.store.markUnlisted(dropped, bulletin.asOf);
    run.incidentsUnlisted += dropped.length;
  }
  for (const id of retriedOk) await deps.store.clearExtractionFailure(id);
  const pending = await deps.store.pendingCount(source.id);
  if (pending) run.error ??= `text extraction backlog: ${pending} documents`;
  return run;
}

function must<T>(
  result: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what}: no data`);
  return result.data;
}

function createSupabaseStore(key: string): TextSourceStore {
  async function write<T>(operation: string, payload: unknown): Promise<T> {
    const context = getSourceArchiveContext();
    const { data, error } = await supabaseAdmin.rpc("write_text_source", {
      _key: key,
      _operation: operation,
      _payload: payload as Json,
      ...(context ? { _job: context.jobId, _attempt: context.attempt } : {}),
    });
    if (error) throw new Error(`text source ${operation}: ${error.message}`);
    return data as T;
  }
  return {
    loadSource: async (key) => {
      const { data, error } = await supabaseAdmin
        .from("text_sources")
        .select(
          "id, key, kind, url, authority_tier, language, wilaya_id, template",
        )
        .eq("key", key)
        .eq("enabled", true)
        .maybeSingle();
      if (error) throw new Error(`text source load failed: ${error.message}`);
      return (data as TextSource | null) ?? null;
    },
    knownExternalIds: async (sourceId) => {
      const data = must(
        await supabaseAdmin
          .from("source_documents")
          .select("external_id")
          .eq("text_source_id", sourceId)
          .order("published_at", { ascending: false })
          .limit(500),
        "known documents",
      );
      return new Set(data.map((d) => d.external_id));
    },
    insertDocuments: (rows) => write("documents", rows),
    loadGazetteer: async () => {
      const [rows, aliasRows] = await Promise.all([
        fetchAllPages<{
          id: string;
          level: string;
          name_ar: string;
          parent_id: string | null;
        }>((from, to) =>
          supabaseAdmin
            .from("admin_units")
            .select("id, level, name_ar, parent_id")
            .in("level", ["wilaya", "commune"])
            .order("code")
            .range(from, to),
        ),
        fetchAllPages<{ admin_unit_id: string; alias_ar: string }>((from, to) =>
          supabaseAdmin
            .from("admin_unit_aliases")
            .select("admin_unit_id, alias_ar")
            .order("admin_unit_id")
            .range(from, to),
        ),
      ]);
      const aliasById = new Map<string, string[]>();
      for (const a of aliasRows)
        aliasById.set(a.admin_unit_id, [
          ...(aliasById.get(a.admin_unit_id) ?? []),
          a.alias_ar,
        ]);
      const communesByWilaya = new Map<string, CommuneCandidate[]>();
      for (const u of rows) {
        if (u.level !== "commune" || !u.parent_id) continue;
        const list = communesByWilaya.get(u.parent_id) ?? [];
        list.push({
          id: u.id,
          name_ar: u.name_ar,
          aliases: aliasById.get(u.id) ?? [],
        });
        communesByWilaya.set(u.parent_id, list);
      }
      return {
        wilayas: rows
          .filter((u) => u.level === "wilaya")
          .map((u) => ({ id: u.id, name_ar: u.name_ar })),
        communesByWilaya,
      };
    },
    insertMentions: (rows) => write("mentions", rows),
    openIncidents: async (areaIds, since) => {
      const data = must(
        await supabaseAdmin
          .from("official_incidents")
          .select(
            "id, wilaya_id, commune_id, kind, status, precision, authority_tier, first_reported_at, last_reported_at, as_of, place_text",
          )
          .gte("last_reported_at", since)
          .or(
            `commune_id.in.(${areaIds.join(",")}),wilaya_id.in.(${areaIds.join(",")})`,
          ),
        "open incidents",
      );
      return data.map((i) => ({
        ...(i as Omit<OpenIncident, "area_id"> & { wilaya_id: string }),
        area_id: i.commune_id ?? i.wilaya_id,
      })) as OpenIncident[];
    },
    applyMention: (mentionId, change) =>
      write("apply_mention", { mentionId, ...change }),
    pendingCount: async (sourceId) => {
      const { count, error } = await supabaseAdmin
        .from("document_extractions")
        .select("document_id,source_documents!inner(text_source_id)", {
          count: "exact",
          head: true,
        })
        .eq("source_documents.text_source_id", sourceId);
      if (error) throw new Error(`pending documents: ${error.message}`);
      return count ?? 0;
    },
    listedIncidents: async (before) => {
      const data = must(
        await supabaseAdmin
          .from("official_incidents")
          .select("id, commune_id, wilaya_id")
          .is("unlisted_at", null)
          .lt("last_reported_at", before),
        "listed incidents",
      );
      return data.map((row) => ({
        id: row.id,
        area_id: row.commune_id ?? row.wilaya_id,
      }));
    },
    retryableDocuments: async (sourceId) => {
      const data = must(
        await supabaseAdmin
          .from("document_extractions")
          .select(
            "document_id, attempts, source_documents!inner(id, text_source_id, external_id, url, published_at, content_hash, body)",
          )
          .lt("attempts", 4)
          .eq("source_documents.text_source_id", sourceId)
          .order("updated_at")
          .limit(5),
        "retryable documents",
      );
      return data.flatMap((row) =>
        row.source_documents ? [row.source_documents] : [],
      );
    },
    recordExtractionFailure: (documentId, message) =>
      write("failure", { documentId, message }),
    clearExtractionFailure: (documentId) => write("complete", { documentId }),
    confirmClusters: (rows) => write("confirm", rows),
    markUnlisted: (ids, asOf) => write("unlist", { ids, asOf }),
  };
}

export function runTextSource(key: string): Promise<TextSourceRun> {
  return runTextSourceWith(key, {
    store: createSupabaseStore(key),
    fetchPosts: (source, known) =>
      fetchNewTelegramPosts(source.url, known, (input, init) =>
        archivedFetch(
          source.key,
          "public_preview",
          input,
          { ...init, signal: AbortSignal.timeout(20_000) },
          {
            requestParams: {
              before: new URL(String(input)).searchParams.get("before"),
            },
          },
        ),
      ),
    extractLlm: extractMentionsWithLlm,
  });
}
