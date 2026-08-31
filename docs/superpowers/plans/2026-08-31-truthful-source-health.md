# Truthful Source Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace client-guessed freshness and mutable source notes with versioned source contracts, an append-only private run ledger, atomic checkpoints, one server-derived health view, and a sanitized public status API.

**Architecture:** An additive Supabase migration introduces the reliability model and a security-invoker public projection. Ingestion stages report structured outcomes through one database function that inserts the audit row and advances its checkpoint atomically. React and the public API consume the same derived view; raw diagnostics remain service-role-only. Because production applies migrations before code, the old tables remain dormant for one release and are dropped in the immediately following contract release.

**Tech Stack:** PostgreSQL 15+/Supabase RLS and pgTAP, TypeScript 5.8, Supabase JS 2, TanStack Start/Query/Router, React 19, Vitest, i18next.

**Spec:** `docs/superpowers/specs/2026-08-31-data-reliability-control-plane-design.md`, milestone 1 (expand/cutover release).

## Global Constraints

- Preserve every safety invariant in the approved design. This slice reports partial daily risk honestly but does not make risk publication atomic; that is milestone 3.
- Production deploy order is database first, application second. This release is additive: do not rename or drop `data_sources` or `ingest_runs` in its migration.
- Revoke public access to raw `ingest_runs` immediately. Keep `data_sources` readable only for the old application during the deploy window; the new application must contain no reference to it.
- Keep the one-release compatibility trigger database-only and one-way (`data_sources` to `source_checkpoints`). New code writes only the new model. The next release removes the trigger and both old tables.
- Public status exposes allow-listed reason codes and numeric facts only. Never expose raw errors, URLs, response bodies, credentials, stack traces, request bodies, or replay cursors.
- Every table in `public` has RLS enabled. The public view uses `security_invoker = true`; `anon` and `authenticated` receive only the underlying column privileges the view needs.
- `source_runs` is append-only to application roles: `service_role` receives `SELECT, INSERT`, not `UPDATE` or `DELETE`.
- The recorder function is `SECURITY INVOKER`, callable only by `service_role`, and performs the run insert plus checkpoint update in one transaction.
- The run ledger is observability, not the ingest transaction. A ledger failure is logged and returned as `false`; it does not roll back already-committed detections or forecasts.
- Four languages or none for every new user-facing string.
- Do not touch the user-owned untracked `data/telegram-channels.json`.
- Do not push, merge, deploy, apply a remote migration, or mutate production without a fresh explicit approval naming that action.

---

## Task 1: Prove the database contract with pgTAP

**Files:**

- Create: `supabase/tests/source_reliability.test.sql`
- Create via `supabase migration new add_source_reliability_control_plane`: the generated `supabase/migrations/*_add_source_reliability_control_plane.sql`

**Interfaces introduced:**

```sql
public.source_contracts
public.source_checkpoints
public.source_runs
public.source_health
public.record_source_run(...)
private.sync_legacy_source_checkpoint()
```

- [ ] **Step 1: Start with failing schema/security tests.** Add a transactional pgTAP test covering:
  - all three tables, their primary/foreign keys, and the run lookup indexes;
  - seeded contracts for `firms`, `fci`, `onm`, `persistent_screen`, `fusion`, `openmeteo_wind`, `local_fwi`, `effis`, `broadcast_publish`, `broadcast_delivery`, and `geo`;
  - RLS enabled on all three tables;
  - no `anon`/`authenticated` privilege on `source_runs` or `ingest_runs`;
  - no `service_role` update/delete privilege on `source_runs`;
  - `anon` can select `source_health` but cannot select private checkpoint columns such as `replay_cursor` or `schema_fingerprint`;
  - `record_source_run` is executable only by `service_role`;
  - one successful report creates a run and advances success/watermark fields atomically;
  - one failed report increments the failure streak without advancing the last valid watermark;
  - duplicate idempotency keys do not create a second run or mutate the checkpoint twice;
  - health derivation reaches `paused`, `unavailable`, `stale`, `delayed`, `degraded`, and `healthy` using test contracts with timestamps relative to `now()`; `backfilling` remains a reserved public state until milestone 2 adds `source_gaps`;
  - raw diagnostics never appear among `source_health` columns.
- [ ] **Step 2: Run the database test and see the expected failure.** Use `supabase start` if the local stack is not running, then `supabase test db --local supabase/tests/source_reliability.test.sql`. Expected: missing reliability relations/function.
- [ ] **Step 3: Generate the migration with the CLI.** Run `supabase migration new add_source_reliability_control_plane`; use the exact generated file from this point onward.
- [ ] **Step 4: Implement the versioned contracts.** The core schema is:

```sql
create table public.source_contracts (
  key text primary key,
  version integer not null check (version > 0),
  label text not null,
  family text not null check (family in (
    'fire_detection', 'detection_processing', 'official_warnings',
    'fire_danger', 'broadcast_delivery', 'reference_enrichment'
  )),
  criticality text not null check (criticality in ('critical', 'supporting', 'optional')),
  freshness_basis text not null check (freshness_basis in (
    'last_success_at', 'upstream_published_at', 'data_through', 'published_at'
  )),
  cadence_minutes integer not null check (cadence_minutes > 0),
  warning_after_minutes integer not null check (warning_after_minutes > 0),
  stale_after_minutes integer not null check (stale_after_minutes > warning_after_minutes),
  max_fallback_age_minutes integer check (max_fallback_age_minutes > 0),
  expected_coverage jsonb not null default '{}'::jsonb,
  parser_version text not null,
  dependency_keys text[] not null default '{}',
  licence text not null,
  attribution text not null,
  owner text not null,
  runbook_url text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Seed the eleven contracts in the migration. Detection polling uses last successful validation except FCI, which uses its upstream slot. Local FWI uses `data_through`, warns when today's product has not appeared by 08:00 UTC, and becomes stale before the following alert cycle. FIRMS explicitly uses successful poll time, never the most recent fire detection time.

- [ ] **Step 5: Implement checkpoints and the private run ledger.** Use `timestamptz`, integer counts with non-negative checks, JSONB only for structured coverage/quality/replay facts, a foreign key from every run/checkpoint to its contract, and these constrained states:

```sql
outcome in ('running', 'succeeded', 'partial', 'failed', 'skipped')
coverage_status in ('complete', 'partial', 'unknown')
trigger_kind in ('scheduled', 'manual', 'replay', 'dependency', 'migration')
```

Add `source_runs_contract_started_idx (contract_key, started_at desc)` and an idempotency unique index on non-null `idempotency_key`. Grant `service_role` only `SELECT, INSERT` on runs; grant no raw-run privileges or policies to public roles.

- [ ] **Step 6: Implement the atomic recorder.** `public.record_source_run` selects the current contract version, inserts one immutable run, and advances the checkpoint only when that insert won the idempotency conflict. Successful runs reset the failure streak and advance valid watermarks; `partial` and `failed` runs preserve the prior valid watermark and increment failures. The signature uses structured inputs rather than a public JSON blob:

```sql
public.record_source_run(
  _contract_key text,
  _trigger_kind text,
  _idempotency_key text,
  _scheduled_for timestamptz,
  _started_at timestamptz,
  _finished_at timestamptz,
  _outcome text,
  _upstream_published_at timestamptz,
  _data_from timestamptz,
  _data_through timestamptz,
  _validated_at timestamptz,
  _published_at timestamptz,
  _records_seen integer,
  _records_inserted integer,
  _records_updated integer,
  _records_rejected integer,
  _records_expected integer,
  _coverage_status text,
  _quality_checks jsonb,
  _public_reason_code text,
  _private_diagnostic text
) returns uuid
```

Revoke function execution from `PUBLIC`, `anon`, and `authenticated`; grant it to `service_role` only.

- [ ] **Step 7: Implement server-derived health.** `public.source_health` is a `security_invoker` view. Its precedence is `paused` → `unavailable` → `stale` → `delayed` → `degraded` → `healthy`. It calculates the freshness anchor from each contract's `freshness_basis`, reports age in whole minutes, and exposes only:

```text
key, label, family, criticality, state, freshness_basis,
valid_at, last_attempt_at, last_success_at, published_at,
age_minutes, warning_after_minutes, stale_after_minutes,
coverage_status, records_accepted, records_expected,
fallback_contract_key, public_reason_code
```

Enable RLS and public-read policies on contracts/checkpoints, then use column-level grants so public roles can read only columns referenced by the view. Explicitly grant view access because new Supabase tables are no longer automatically exposed to the Data API.

- [ ] **Step 8: Backfill and protect the deploy window.** Migrate historical `ingest_runs` into `source_runs` with `trigger_kind = 'migration'`, raw `error` copied only into `private_diagnostic`, and a generic allow-listed reason code. Seed checkpoints from `data_sources`. Revoke public read of `ingest_runs`. Add a one-way trigger that mirrors old-code writes from `data_sources` into checkpoint timestamps during the schema-before-code window; do not mirror new writes back to the old table.
- [ ] **Step 9: Make the pgTAP suite pass.** Run `supabase db push --local`, then `supabase test db --local supabase/tests/source_reliability.test.sql`.
- [ ] **Step 10: Run database diagnostics.** Run `supabase db lint --local` and `supabase db advisors --local`; fix migration-introduced errors or security/performance findings. Record unrelated pre-existing findings in the implementation log rather than widening scope.
- [ ] **Step 11: Commit.** Commit the migration and pgTAP test as `Add the source reliability data model`.

---

## Task 2: Add a typed, non-leaking run reporter

**Files:**

- Create: `src/lib/source-runs.ts`
- Create: `src/lib/source-runs.server.ts`
- Create: `src/lib/__tests__/source-runs.test.ts`
- Modify: `src/integrations/supabase/types.ts`

**Interfaces introduced:**

```ts
export type SourceRunOutcome = "succeeded" | "partial" | "failed" | "skipped";

export type PublicSourceReason =
  | "credentials_missing"
  | "upstream_unreachable"
  | "schema_invalid"
  | "data_delayed"
  | "coverage_partial"
  | "dependency_failed"
  | "delivery_failed"
  | "disabled"
  | "internal_error";

export type SourceRunReport = {
  contractKey: string;
  trigger: "scheduled" | "manual" | "replay" | "dependency";
  scheduledFor: string;
  startedAt: string;
  finishedAt?: string;
  outcome: SourceRunOutcome;
  upstreamPublishedAt?: string | null;
  dataFrom?: string | null;
  dataThrough?: string | null;
  validatedAt?: string | null;
  publishedAt?: string | null;
  recordsSeen?: number;
  recordsInserted?: number;
  recordsUpdated?: number;
  recordsRejected?: number;
  recordsExpected?: number | null;
  coverageStatus: "complete" | "partial" | "unknown";
  qualityChecks?: Record<string, boolean | number | string | null>;
  publicReasonCode?: PublicSourceReason | null;
  privateDiagnostic?: string | null;
};

export function publicReasonForError(error: string): PublicSourceReason;
export function sourceRunOutcome(input: {
  accepted: number;
  expected?: number | null;
  error?: string | null;
  disabled?: boolean;
}): Pick<SourceRunReport, "outcome" | "coverageStatus">;
export async function recordSourceRun(
  report: SourceRunReport,
): Promise<boolean>;
```

- [ ] **Step 1: Write failing unit tests.** Verify the public-reason classifier maps missing credentials, upstream HTTP/network failures, schema/axis failures, and unknown internal failures to the fixed allow-list. Verify no returned public reason contains any substring from the raw diagnostic. Verify the deterministic idempotency key is based on contract, trigger, and scheduled interval.
- [ ] **Step 2: Run `bun run test src/lib/__tests__/source-runs.test.ts`.** Expected: module missing.
- [ ] **Step 3: Implement the pure types/classifier.** Keep raw strings exclusively in `privateDiagnostic`. Do not export a function that converts a raw error into public display text.
- [ ] **Step 4: Implement the server reporter.** Map camelCase input to the typed `record_source_run` RPC, default `finishedAt` to now, and return `false` after logging a sanitized contract-key-only warning when the RPC fails. Never log the private diagnostic a second time from this helper.
- [ ] **Step 5: Regenerate database types from the local schema.** Run `supabase gen types typescript --local` and mechanically replace `src/integrations/supabase/types.ts`; confirm `source_contracts`, `source_checkpoints`, `source_runs`, `source_health`, and `record_source_run` are typed.
- [ ] **Step 6: Run focused tests and type checking.** `bun run test src/lib/__tests__/source-runs.test.ts && bunx tsc --noEmit` must pass.
- [ ] **Step 7: Commit.** Commit as `Add typed source run reporting`.

---

## Task 3: Migrate every current pipeline stage

**Files:**

- Modify: `src/lib/ingest/pipeline.server.ts`
- Modify: `src/lib/ingest/delivery.server.ts`
- Modify: `src/lib/__tests__/source-runs.test.ts`
- Delete: no files in this task

- [ ] **Step 1: Add failing outcome-transition tests.** Exercise the real shared outcome builder with hand-checked inputs: a successful empty poll is complete, an errored run with no accepted rows is failed, an errored or under-covered run with accepted rows is partial, and an operator-disabled run is skipped without becoming a successful validation. These tests protect the branches every pipeline stage uses without grepping implementation text.
- [ ] **Step 2: Run `bun run test src/lib/__tests__/source-runs.test.ts`.** Expected: failures because the outcome builder and transitions do not exist yet.
- [ ] **Step 3: Replace the local journaling helpers.** Delete `RunOutcome`, `recordRun`, and both `markSource` implementations. Import the shared reporter. Use the pipeline start as `scheduledFor` for all stages in that invocation so stage identities are deterministic.
- [ ] **Step 4: Report detection and processing stages.** Record structured outcomes for:
  - `firms`: successful empty polls are complete; zero responding feeds is failed; freshness uses poll validation, not latest detection;
  - `fci`: put `latestSlot` in `upstreamPublishedAt` and `dataThrough`; a missing/late slot is represented distinctly from zero fire detections;
  - `onm`: report fetched/stored/unmatched counts and never expose its raw fetch error;
  - `persistent_screen`: registry zero is `partial` with `coverage_partial` rather than a successful health label;
  - `fusion`: report processed/created counts; its failure is `dependency_failed` for downstream capability;
  - `openmeteo_wind`: zero live clusters is a successful empty run; a failed HTTP request is failed but cannot stop publication.
- [ ] **Step 5: Report publication and delivery.** Record `broadcast_publish` independently from `broadcast_delivery`. Remove status mutation from `deliverBroadcasts`; a kill switch produces `skipped`/`disabled`, missing credentials produces `failed`/`credentials_missing`, and send failures produce `failed`/`delivery_failed`. Per-channel run isolation remains milestone 4.
- [ ] **Step 6: Report daily danger truthfully.** Add a `local_fwi` run with `recordsExpected = communes * HORIZON_DAYS`. A complete matrix is `succeeded`; rows with an error or below expected are `partial` and do not advance the last valid checkpoint. Report `effis` independently so its failure never changes the local FWI outcome.
- [ ] **Step 7: Preserve pipeline behavior.** Confirm screening still precedes fusion, optional wind/EFFIS failures still do not abort critical work, and record failures do not roll back data already written.
- [ ] **Step 8: Run focused verification.** `bun run test src/lib/__tests__/ingest.test.ts src/lib/__tests__/source-runs.test.ts && bunx tsc --noEmit`.
- [ ] **Step 9: Search for forbidden writers.** `rg -n 'data_sources|ingest_runs|markSource|recordRun' src` must return only deliberate migration/test documentation references, never runtime code.
- [ ] **Step 10: Commit.** Commit as `Migrate ingestion to source run contracts`.

---

## Task 4: Make the application consume one derived health model

**Files:**

- Create: `src/lib/source-health.ts`
- Create: `src/lib/__tests__/source-health.test.ts`
- Modify: `src/lib/nadhir.ts`
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/status.tsx`
- Modify: `src/components/nadhir/SourceHealth.tsx`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/fr.ts`
- Modify: `src/i18n/locales/ar.ts`
- Modify: `src/i18n/locales/kab.ts`
- Delete: `src/lib/freshness.ts`
- Delete: `src/lib/__tests__/freshness.test.ts`

**Interfaces introduced:**

```ts
export type SourceHealthState =
  | "healthy"
  | "delayed"
  | "degraded"
  | "stale"
  | "unavailable"
  | "backfilling"
  | "paused";

export type SourceHealth = {
  key: string;
  label: string;
  family: string;
  criticality: "critical" | "supporting" | "optional";
  state: SourceHealthState;
  valid_at: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  published_at: string | null;
  age_minutes: number | null;
  coverage_status: "complete" | "partial" | "unknown";
  records_accepted: number;
  records_expected: number | null;
  fallback_contract_key: string | null;
  public_reason_code: PublicSourceReason | null;
};

export function summariseSourceHealth(rows: SourceHealth[]): {
  affected: number;
  criticalAffected: number;
  allHealthy: boolean;
};
```

- [ ] **Step 1: Replace the browser-freshness tests with failing derived-health tests.** Test summary behavior for all seven states, including `delayed` and `stale` counting as affected, and ensure a paused optional source does not imply that detection itself is unavailable.
- [ ] **Step 2: Run `bun run test src/lib/__tests__/source-health.test.ts`.** Expected: module missing.
- [ ] **Step 3: Implement the shared type and summary.** It must not read `Date.now()` or contain cadence constants. Time interpretation belongs exclusively to the database view.
- [ ] **Step 4: Migrate the query.** Replace `DataSource`/`dataSourcesQuery` with `SourceHealth`/`sourceHealthQuery` selecting the explicit public columns from `source_health`. Use `queryKey: ['source_health']`.
- [ ] **Step 5: Migrate the homepage.** Remove `sourceStale`; show the existing degraded-data banner whenever `summariseSourceHealth` reports affected critical/supporting capability. The page must consume server-derived state without recomputing freshness.
- [ ] **Step 6: Migrate the status page and row.** The summary and every row use the same `state`. Display the valid-data age, last successful validation, numeric coverage when expected count exists, fallback identity, and allow-listed reason translation. Add icons/colors for all states without using “safe” as a label.
- [ ] **Step 7: Add four-language copy.** Add parity keys for seven states and nine public reasons. Keep source labels/proper provider names from the database; translate only state/reason language.
- [ ] **Step 8: Delete the old freshness module and test.** `rg -n 'sourceStale|SOURCE_MAX_AGE_MIN|dataSourcesQuery|type DataSource' src` must return no matches.
- [ ] **Step 9: Verify.** Run `bun run test src/lib/__tests__/source-health.test.ts src/lib/__tests__/i18n.test.ts && bunx tsc --noEmit && bun run lint`.
- [ ] **Step 10: Commit.** Commit as `Use server-derived source health`.

---

## Task 5: Publish the sanitized status endpoint

**Files:**

- Create: `src/routes/api/public/v1/status.ts`
- Modify: `src/routes/api/public/v1/index.ts`
- Modify: `src/lib/public-api.server.ts`
- Modify: `src/lib/__tests__/public-api.test.ts`
- Modify (generated): `src/routeTree.gen.ts`

**Response contract:**

```json
{
  "generated_at": "ISO-8601",
  "overall": "healthy|affected",
  "affected": 0,
  "critical_affected": 0,
  "sources": [
    {
      "key": "firms",
      "family": "fire_detection",
      "state": "healthy",
      "valid_at": "ISO-8601|null",
      "published_at": "ISO-8601|null",
      "age_minutes": 4,
      "coverage": { "status": "complete", "accepted": 123, "expected": null },
      "fallback": null,
      "reason": null
    }
  ]
}
```

- [ ] **Step 1: Add failing serializer tests.** Add `serializePublicSourceStatus` tests that prove the response contains the documented fields, summarizes affected states consistently with the UI helper, and drops unknown/raw properties such as `private_diagnostic`, `schema_fingerprint`, and `replay_cursor` even if passed in an object.
- [ ] **Step 2: Run `bun run test src/lib/__tests__/public-api.test.ts`.** Expected: missing serializer export.
- [ ] **Step 3: Implement the allow-list serializer.** Construct every returned object field explicitly; never spread a database row into a public response.
- [ ] **Step 4: Add `GET /api/public/v1/status`.** Apply the existing 60 rpm limiter, query only `source_health`, return 502 with a generic message on database failure, and use the existing CORS/cache headers.
- [ ] **Step 5: Advertise the endpoint in the API index.** Add path, empty params, and example URL.
- [ ] **Step 6: Regenerate the route tree.** Run `bun run build` (or the router generation command used by Vite) and confirm `src/routeTree.gen.ts` includes `/api/public/v1/status`.
- [ ] **Step 7: Verify.** Run `bun run test src/lib/__tests__/public-api.test.ts && bunx tsc --noEmit && bun run build`.
- [ ] **Step 8: Commit.** Commit as `Expose sanitized public source status`.

---

## Task 6: Record the epic and the contract cleanup

**Files:**

- Modify: `roadmap.md`
- Modify: `GAPS.md`
- Modify: `README.md`
- Create: `docs/superpowers/plans/2026-08-31-source-health-contract-cleanup.md`

- [ ] **Step 1: Add the epic to the roadmap.** Add “Data Reliability Control Plane” with six slices matching the approved design. Mark only M1A complete after implementation verification; leave isolated execution, atomic daily risk, delivery reliability, operator response, and the new-source gate open.
- [ ] **Step 2: Reconcile stale operational documentation.** Update the connected-source and health descriptions so they no longer claim runtime mutation of `data_sources` or public `ingest_runs`. Do not rewrite unrelated gap history.
- [ ] **Step 3: Update the gap ledger.** Mark client-side freshness/public raw errors as addressed by M1A. Keep scheduler response verification, isolated execution/replay, atomic FWI publication, and delivery channel isolation open and link them to M2–M4.
- [ ] **Step 4: Write the one-release contract plan.** The follow-up plan must:
  - verify production has recent `source_runs` for every enabled contract and that the deployed bundle/API no longer queries old relations;
  - remove `private.sync_legacy_source_checkpoint` and its trigger;
  - revoke remaining old grants and drop `data_sources` and `ingest_runs`;
  - regenerate types and prove `rg -n 'data_sources|ingest_runs' src` is empty;
  - run pgTAP, typecheck, tests, lint, and build;
  - require fresh merge/deploy approval because applying that migration is destructive.
- [ ] **Step 5: Commit.** Commit as `Document the data reliability epic`.

---

## Task 7: Full production-readiness verification

**Files:**

- Modify only files required to fix failures caused by this milestone.

- [ ] **Step 1: Format touched files.** Run Prettier on the touched TypeScript, Markdown, and SQL files.
- [ ] **Step 2: Re-run database verification from the committed migration set.** On the local Supabase stack: `supabase db push --local`, `supabase test db --local supabase/tests/source_reliability.test.sql`, `supabase db lint --local`, and `supabase db advisors --local`.
- [ ] **Step 3: Run exact CI gates.** `bunx tsc --noEmit`, `bun run test`, and `bun run lint` must all pass.
- [ ] **Step 4: Run the deploy build gate locally.** Copy `.env.example` to the existing ignored `.env.local` only if needed, run `bun run build`, and confirm the generated client bundle contains the configured Supabase project ref as CI does. Do not deploy.
- [ ] **Step 5: Run safety searches.** Confirm:

```sh
rg -n 'sourceStale|SOURCE_MAX_AGE_MIN|from\("data_sources"\)|\("ingest_runs"\)' src
rg -n 'private_diagnostic|replay_cursor|schema_fingerprint' src/routes/api/public src/components src/routes/status.tsx
```

The first search has no runtime matches; the second has no public/UI exposure.

- [ ] **Step 6: Review the diff as a maintainer.** Check migration deploy order, RLS/grants, append-only privileges, function execution grants, reason-code allow-listing, all stage transitions, four-language parity, and that the user-owned untracked Telegram file is untouched.
- [ ] **Step 7: Check repository state.** `git status --short --branch` should show only the known user-owned untracked `data/telegram-channels.json`; all milestone work is committed.
- [ ] **Step 8: Prepare handoff.** Report commits, verification evidence, known pre-existing advisor findings, and the required next approval. Do not push, open a PR, merge, deploy, or apply production migrations without explicit authorization.

## Plan Self-Review

- [x] Milestone scope is limited to contracts, checkpoints, runs, derived health, current-writer migration, UI, and public status. Queueing, replay, atomic publication, per-channel delivery, incidents, and new data sources remain later milestones.
- [x] Every approved M1 requirement maps to a task: schema/security (Task 1), writers (Tasks 2–3), shared public/UI read model (Tasks 4–5), and legacy cleanup (Task 6 follow-up).
- [x] Production's schema-before-code order is handled explicitly with an additive expand release and a named contract cleanup; there is no unsafe drop in the deploy window.
- [x] Public/private boundaries are testable at the database and serializer layers.
- [x] All introduced interfaces and state literals are defined; no TODO, TBD, placeholder implementation, or invented migration filename is present.
- [x] Test-first red/green steps precede implementation in every behavior-changing task.
- [x] Final commands include the exact CI gates and the additional build/database gates required by the production deploy workflow.
