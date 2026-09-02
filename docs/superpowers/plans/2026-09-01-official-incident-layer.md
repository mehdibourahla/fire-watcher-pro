# Official-Incident Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the source control plane reliable (P0), add an independent satellite sensor (P2), and ingest official text sources — DGPC Telegram first — through one shared, source-agnostic pipeline into merged `official_incidents` shown on the map and measured against clusters (P1/P3), then surface approved hazard reports (P4).

**Architecture:** Per-source knowledge lives in a `text_sources` registry row and a thin adapter that writes immutable `source_documents`; everything after that is shared: classify → extract (template first, one Claude structured-output call for the residue) → validate against the gazetteer + alias table → append-only `incident_mentions` → deterministic match & merge → `official_incidents`. Scheduling stays in Postgres (`source_contracts` / `source_jobs`); the fix for long jobs is a `pg_net` `repository_dispatch` instead of GitHub's cron, and the watchdog moves into the Worker cron with a Telegram DM on state transitions.

**Tech Stack:** TanStack Start on Cloudflare Workers, Supabase Postgres (pg_cron, pg_net, Vault), Bun, Vitest, MapLibre, `@anthropic-ai/sdk` (`claude-opus-5`, `output_config.format`).

## Global Constraints

- Zero comments/docstrings except a one-line non-obvious why. Minimal diffs. No back-compat shims: replaced paths are deleted in the same change.
- Every migration is forward-only SQL under `supabase/migrations/2026090[12]HHMMSS_<slug>.sql`; RLS on every new table; `service_role` writes only through the adapters; anon reads only where the page needs them.
- CI gates: `bunx tsc --noEmit`, `bun run test`, `bun run lint` (prettier). Locale parity test requires every new i18n key in `ar`, `fr`, `en`, `kab`.
- Prod mutations, secrets, merges and deploys are owner actions. Code must run without `ANTHROPIC_API_KEY` (LLM step skipped, logged) and without the operator chat id (notifier disabled, logged).
- Doctrine (`CONTEXT.md`): official incidents are Information, attributed and timestamped, never an Instruction; area-level rendering, never an invented point.

---

## Branch & PR shape

One branch per phase, PRs in order: `p0-runner-reliability`, `p2-sentinel3`, `p3-official-incidents`, `p4-hazard-reports-map`. Each PR green on CI before the next branches from it.

---

### Task 1 (P0): GitHub dispatch for `target = github` jobs

**Files:**
- Create: `supabase/migrations/20260902060000_dispatch_github_source_jobs.sql`
- Modify: `.github/workflows/risk-refresh.yml` (rename content to a dispatch-driven job)
- Test: pgTAP `supabase/tests/source_dispatch.test.sql` (marks `dispatched_at`; skips when Vault secret missing)

**Interfaces:**
- Produces: `source_jobs.dispatched_at timestamptz`; `private.dispatch_github_source_jobs(_now timestamptz) returns integer`; pg_cron job `nadhir-github-dispatch` every minute; Vault secrets `github_dispatch_token`, `github_repo` (owner sets).

- [ ] Migration: add column; function selects `queued` jobs with `execution_target='github'`, `available_at <= _now`, `dispatched_at is null or dispatched_at < _now - interval '20 minutes'`; for each, `net.http_post('https://api.github.com/repos/'||repo||'/dispatches', headers {Authorization: Bearer token, Accept: application/vnd.github+json, User-Agent: nadhir}, body {event_type:'source-job', client_payload:{contract, job_id}})`, then `update … set dispatched_at = _now`. If either secret is null: `raise warning` and return 0 (the watchdog's `queue_delayed` then tells the operator).
- [ ] Workflow: `on: repository_dispatch: types: [source-job]` and `workflow_dispatch: inputs: contract`; single job, contract from `github.event.client_payload.contract || inputs.contract`; keep the drain loop and per-contract concurrency; delete `schedule:` and the matrix.
- [ ] Commit.

### Task 2 (P0): Watchdog in the Worker cron with Telegram DM on transition

**Files:**
- Create: `src/lib/operator-alerts.ts` (pure), `src/lib/__tests__/operator-alerts.test.ts`, `src/lib/ingest/operator-alerts.server.ts`
- Create: `supabase/migrations/20260902060500_operator_alert_state.sql`
- Modify: `src/lib/source-scheduler.plugin.server.ts` (call notifier when minute % 5 == 0), `src/lib/source-scheduler.server.ts`
- Delete: `.github/workflows/source-watchdog.yml`, `scripts/source-watchdog.ts`, `package.json` script `watchdog:sources`

**Interfaces:**
- `watchdogTransition(previous: string | null, issues: SourceWatchdogIssue[]): { fingerprint: string; message: string | null }` — fingerprint = sorted `contract:issue` joined; message non-null only when fingerprint changed (red → lists issues; back to empty → "recovered").
- `notifyOperatorOnWatchdog(): Promise<{ issues: number; notified: boolean }>` — reads `source_watchdog`, `operator_alert_state('source_watchdog')`, sends via `sendTelegram(process.env.NADHIR_OPERATOR_CHAT_ID, html)`; disabled with a log line when chat id or bot token missing.
- Table `operator_alert_state(key text pk, fingerprint text not null, updated_at timestamptz)`.

- [ ] Failing tests for `watchdogTransition` (no change → null; new issues → message lists them; cleared → recovered).
- [ ] Implement; wire into the scheduler hook; migration; delete the GitHub watchdog path.
- [ ] Commit.

### Task 3 (P2): Sentinel-3 SLSTR FRP as a second WFS contract

**Files:**
- Modify: `src/lib/ingest/fci.server.ts` → generalise to `ingestWfsFire({ layer, source })`; export `ingestFci` and `ingestS3`
- Modify: `src/lib/ingest/source-runners.server.ts` (+`s3_slstr` runner), `src/integrations/supabase/types.ts` if needed
- Create: `supabase/migrations/20260902061000_s3_slstr_contract.sql` (contract row, cadence 60, `upstream_published_at`, warning 240, stale 720, target cloudflare)
- Test: extend `src/lib/__tests__/fci.test.ts` with an S3 feature fixture (properties verified against a live GetFeature sample before writing the fixture)

- [ ] Fetch one live S3 feature to learn property names; write fixture; failing test on `source: "s3"` rows.
- [ ] Implement; contract row; commit.

### Task 4 (P3): Schema for text sources, documents, mentions, incidents, aliases, recall

**Files:**
- Create: `supabase/migrations/20260902070000_official_incidents.sql`
- Modify: `src/integrations/supabase/types.ts` (hand-add table types matching the migration)

**Interfaces (tables):**
- `text_sources(id uuid pk, key text unique references source_contracts(key), kind text check in ('telegram_public','rss'), url text, authority_tier text check in ('national','wilaya','forestry','media'), language text, wilaya_id uuid null, template text null check in ('dgpc_bulletin'), enabled bool)`
- `source_documents(id, text_source_id, external_id, url, published_at, fetched_at, content_hash, body text, raw jsonb, unique(text_source_id, external_id))` + trigger rejecting update/delete.
- `incident_mentions(id, document_id, text_source_id, wilaya_id, commune_id null, place_text null, kind check in ('vegetation','agricultural','urban','unknown'), status check in ('ongoing','contained','extinguished','monitoring','unknown'), fire_count int default 1, as_of timestamptz, precision check in ('commune','wilaya','place'), evidence text, extractor check in ('template','llm'), incident_id uuid null, created_at)` + reject update except `incident_id` set once (trigger).
- `official_incidents(id, wilaya_id, commune_id null, kind, status, precision, authority_tier, first_reported_at, last_reported_at, as_of, mention_count, latest_mention_id, evidence, updated_at)`; index on `(coalesce(commune_id, wilaya_id), kind, last_reported_at)`.
- `admin_unit_aliases(admin_unit_id, alias_norm text, source text, unique(admin_unit_id, alias_norm))` seeded with the eight DGPC variants found in the recall study.
- `source_contracts.family` check gains `'official_text'`; seed contract `dgpc_telegram` (family official_text, critical=supporting, cadence 15, warning 360, stale 1440, `last_success_at`, cloudflare) and `text_sources` row (`https://t.me/s/DGPCDZ`, national, ar, template dgpc_bulletin).
- View `official_incident_recall_daily(day, mentions, communes, with_cluster)` computing, per Algiers day, resolved commune mentions and how many had a `fire_clusters` row in that commune within ±24 h. Grant select to anon on `official_incidents`, `incident_mentions`, `official_incident_recall_daily`.

- [ ] Write migration; update types; `bunx tsc --noEmit`; commit.

### Task 5 (P3): Arabic normalisation + gazetteer/alias resolution (pure)

**Files:**
- Create: `src/lib/text-sources/normalize.ts`, `src/lib/__tests__/text-normalize.test.ts`

**Interfaces:**
- `normalizeArabic(s: string): string` (NFKC, strip tashkeel/tatweel/punct, alef/ya/ta-marbuta folding, ث→ت ق→ك ذ→د, leading ال / ل elision).
- `resolveCommune(name: string, candidates: { id: string; name_ar: string; aliases: string[] }[]): { id: string; via: 'exact'|'alias'|'fuzzy' } | null` (fuzzy = Dice bigram ≥ 0.8 on space-stripped normalised forms).
- `resolveWilaya(text: string, wilayas: { id: string; name_ar: string }[]): string | null` (longest normalised name that appears as a token sequence).

- [ ] Failing tests from the recall-study pairs (`بكوش لخضر`→Bekkouche Lakhdar via alias, `تاسكريوت`→Taskriout via fuzzy, `#تيزي_وزو:`→Tizi Ouzou, status phrases → null).
- [ ] Implement; commit.

### Task 6 (P3): DGPC bulletin template parser (pure)

**Files:**
- Create: `src/lib/text-sources/dgpc-template.ts`, `src/lib/__tests__/dgpc-template.test.ts`, fixtures `src/lib/__tests__/fixtures/dgpc/*.txt` (real posts 6857, 6808, 6823, 6908, 6907-urban)

**Interfaces:**
- `parseDgpcBulletin(text: string, postedAt: string): { kind: 'bulletin'|'urban'|'weather_relay'|'other'; asOf: string | null; totals: {total,extinguished,ongoing} | null; wilayaCounts: {wilaya: string; count: number}[]; lines: { wilaya: string | null; raw: string; communes: string[]; status: 'ongoing'|'extinguished'|'monitoring'|'unknown'; count: number }[]; unresolved: string[] }`
- Header time `على الساعة HHسا` is Algiers local (UTC+1) on the posted date; the 07:00 bulletin covers the previous 24 h — `asOf` is still the header time.

- [ ] Failing tests per fixture: kind, asOf, wilayaCounts length, named communes for two lines, urban post → `kind: 'urban'` with no lines.
- [ ] Implement (port of the study parser, three sentence forms, parentheticals stripped, daïra suffix stripped); commit.

### Task 7 (P3): Telegram public-channel adapter

**Files:**
- Create: `src/lib/text-sources/telegram-public.ts` (pure HTML → posts), `src/lib/__tests__/telegram-public.test.ts` with fixture `fixtures/dgpc/tme-page.html` (saved live page), `src/lib/text-sources/telegram-public.server.ts` (fetch with `?before=`, up to N pages until `external_id` already stored)

**Interfaces:**
- `parseTelegramPreview(html: string): { externalId: string; publishedAt: string; text: string; url: string }[]`
- `fetchNewTelegramPosts(source: TextSource, knownIds: Set<string>, fetchImpl?: typeof fetch): Promise<Post[]>`

- [ ] Failing test on fixture (count, first id, datetime, `<br>` → newline, entities unescaped).
- [ ] Implement; commit.

### Task 8 (P3): LLM extraction for the residue (skips without key)

**Files:**
- Create: `src/lib/text-sources/extract-llm.server.ts`, `src/lib/__tests__/extract-llm.test.ts` (mocked client)
- Modify: `package.json` (+`@anthropic-ai/sdk`)

**Interfaces:**
- `extractMentionsWithLlm(input: { text: string; wilayaHint: string | null; language: string }, deps?): Promise<{ skipped: true; reason: 'no_api_key' } | { skipped: false; mentions: LlmMention[] }>`
- `LlmMention = { wilaya: string | null; commune: string | null; place: string | null; kind; status; count: number; evidence: string }` — strict JSON schema via `output_config: { format: { type: 'json_schema', schema } }`, `model: 'claude-opus-5'`, `output_config.effort: 'low'`, post text passed in the user turn as data, no tools.
- Any mention whose `evidence` is not a substring of the input is dropped.

- [ ] Failing tests: no key → skipped; mocked response → parsed; evidence not in text → dropped.
- [ ] Implement; commit.

### Task 9 (P3): Shared pipeline + match & merge + runner registration

**Files:**
- Create: `src/lib/text-sources/pipeline.server.ts`, `src/lib/text-sources/merge.ts` (pure), `src/lib/__tests__/incident-merge.test.ts`
- Modify: `src/lib/ingest/source-runners.server.ts` (fallback: contract key found in `text_sources` → `runTextSource`), `src/lib/ingest/source-executor.server.ts`

**Interfaces:**
- `mergeDecision(mention, openIncidents): { action: 'attach'; incidentId } | { action: 'create' }` — attach when same `coalesce(commune,wilaya)`, same kind, `last_reported_at >= as_of - 48h`.
- `nextIncidentState(incident, mention, tierRank): { status; precision; authority_tier; evidence; latest_mention_id }` — a mention changes status only if its tier ≥ current tier or its `as_of` is newer and tier equal.
- `runTextSource(key): Promise<{ fetched; stored; mentions; resolved; unresolved; incidentsCreated; incidentsUpdated; llmSkipped: boolean; error?: string }>` — used by the runner to build the `SourceRunReport` (`recordsSeen` = documents, `recordsInserted` = mentions, `qualityChecks` = {resolved, unresolved, llm_skipped}).

- [ ] Failing tests for merge decisions and state precedence.
- [ ] Implement pipeline; register; commit.

### Task 10 (P3/P1): Surfaces — map layer, incident sheet, `/status` recall

**Files:**
- Modify: `src/lib/nadhir.ts` (`officialIncidentsQuery`, `recallDailyQuery`), `src/components/FireMap.tsx` (fill layer over commune/wilaya polygons keyed by status, `MapLayers.official`), `src/components/nadhir/LayerToggle.tsx`, `src/routes/index.tsx` (toggle + list group "Official incidents"), `src/routes/status.tsx` (recall row + text sources appear via `source_health`), locales ×4.

- [ ] Add queries and types; render polygons with attribution + as-of + evidence quote in the detail sheet; recall metric card on `/status`; i18n keys; commit.

### Task 11 (P4): Approved hazard reports on the map

**Files:**
- Modify: `src/components/FireMap.tsx` (circle layer for approved `citizen_reports`, `MapLayers.reports`), `src/routes/index.tsx`, `LayerToggle.tsx`, locales.

- [ ] Wire `approvedReportsQuery`; layer + toggle; commit.

### Task 12: Owner runbook

**Files:**
- Modify: `GAPS.md` (§2.4 publication remains open → updated; new §1.5 official incidents), `docs/superpowers/plans/…` checkboxes.

Owner-only steps listed in the PR body: Vault `github_dispatch_token` + `github_repo`; Worker secrets `NADHIR_OPERATOR_CHAT_ID`, `ANTHROPIC_API_KEY`; merge order.
