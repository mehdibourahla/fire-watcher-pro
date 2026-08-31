# Isolated Source Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct, sequential cron pipelines with durable per-contract jobs, one active lease per contract, bounded retries, recorded gaps, idempotent replay, dual schedulers, and a host-independent watchdog.

**Architecture:** Postgres is the durable queue and source of truth. Supabase cron and a Cloudflare Cron Trigger independently enqueue the same normalized slots; uniqueness makes duplicate triggers harmless. Short database functions claim work with `FOR UPDATE SKIP LOCKED`, while each external fetch runs outside a transaction in its own Worker request or GitHub Actions job. Completion atomically records the attempt, advances the checkpoint only on valid success, releases the lease, schedules a bounded retry or opens a gap, and resolves a gap only when the run proves interval coverage.

**Tech Stack:** PostgreSQL 15+, Supabase CLI 2.116.0 and pgTAP, TypeScript 5.8, TanStack Start, Nitro 3 Cloudflare hooks, Cloudflare Workers Cron Triggers, GitHub Actions, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-08-31-data-reliability-control-plane-design.md`, milestone 2.

## Global Constraints

- Keep the migration additive because production applies schema before code.
- Keep `record_source_run(...)` callable during the schema-before-code window; M1A code is live until the Worker deploy completes.
- Do not drop `data_sources`, `ingest_runs`, or their compatibility trigger until the separate contract-cleanup entry evidence passes.
- Queue tables, leases, gaps, raw runs, replay functions, and watchdog facts are service-role/operator-only.
- Unknown errors fail loudly as `internal_error`; they are never converted to success or hidden degradation.
- External network and adapter work never happens while a database row lock is held.
- At most one job per contract is leased at a time; jobs for different contracts remain independently claimable.
- A scheduled slot is unique by contract and normalized `scheduled_for`, regardless of whether Supabase or Cloudflare enqueued it.
- A retry is a new audited attempt for the same job. Domain writes remain idempotent across retries and replay.
- A gap resolves only when a successful run's `data_from` and `data_through` cover the gap interval.
- Permanent credential, schema, licence, and disabled failures do not retry automatically.
- Retryable failures stop at both `max_attempts` and `retry_until`.
- The daily `local_fwi` and `effis` jobs run in separate GitHub jobs because they exceed the Worker CPU budget.
- `alert_evaluation` becomes a versioned contract and queue job so no direct cron endpoint survives M2.
- Preserve the user-owned, untracked `data/telegram-channels.json` file.

---

### Task 1: Durable queue, leases, gaps, and atomic state machine

**Files:**

- Create: `supabase/migrations/*_isolated_source_execution.sql` through the CLI step below
- Create: `supabase/tests/source_execution.test.sql`
- Modify: `supabase/tests/source_reliability.test.sql`
- Regenerate: `src/integrations/supabase/types.ts`

**Interfaces:**

- Produces table `public.source_jobs` with normalized interval, target, attempt budget, state, and deterministic idempotency key.
- Produces table `public.source_job_leases` with one row per leased contract.
- Produces table `public.source_gaps` with `open | replaying | resolved | unrecoverable` states.
- Produces RPCs `enqueue_due_source_jobs`, `claim_source_job`, `complete_source_job`, and `enqueue_source_replay`.
- Produces service-role view `public.source_watchdog`.
- Preserves the existing `public.record_source_run(...)` signature for the live M1A application.

- [ ] **Step 1: Generate the migration filename through the pinned CLI.**

Run:

```sh
bunx supabase@2.116.0 migration new isolated_source_execution
```

Expected: one new timestamped SQL file under `supabase/migrations/`.

- [ ] **Step 2: Write failing pgTAP storage and privilege assertions.**

Add assertions for these exact relations and rules:

```sql
select has_table('public', 'source_jobs');
select has_table('public', 'source_job_leases');
select has_table('public', 'source_gaps');
select has_view('public', 'source_watchdog');

select ok(
  not has_table_privilege('anon', 'public.source_jobs', 'select')
  and not has_table_privilege('authenticated', 'public.source_jobs', 'select')
  and not has_table_privilege('anon', 'public.source_gaps', 'select')
  and not has_table_privilege('authenticated', 'public.source_gaps', 'select')
);

select ok(
  has_function_privilege('service_role', 'public.enqueue_due_source_jobs(timestamp with time zone,text)', 'execute')
  and not has_function_privilege('anon', 'public.enqueue_due_source_jobs(timestamp with time zone,text)', 'execute')
);
```

Also assert RLS on all three tables, indexes on every foreign key, a partial claim index on non-terminal jobs, and an expiry index on leases.

- [ ] **Step 3: Run the new database test and verify RED.**

Run:

```sh
bunx supabase@2.116.0 start
bunx supabase@2.116.0 db push --local
bunx supabase@2.116.0 test db --local supabase/tests/source_execution.test.sql
```

Expected: FAIL because the M2 tables and functions do not exist.

- [ ] **Step 4: Add execution policy to source contracts and register alert evaluation.**

Add constrained, non-null contract columns with safe defaults:

```sql
schedule_enabled boolean not null default true,
schedule_offset_minutes integer not null default 0 check (schedule_offset_minutes >= 0),
execution_target text not null default 'cloudflare' check (execution_target in ('cloudflare', 'github')),
lease_seconds integer not null default 120 check (lease_seconds between 30 and 3600),
max_attempts integer not null default 3 check (max_attempts between 1 and 10),
retry_base_seconds integer not null default 30 check (retry_base_seconds between 1 and 3600),
retry_window_minutes integer not null default 30 check (retry_window_minutes > 0),
overlap_minutes integer not null default 0 check (overlap_minutes >= 0)
```

Set `geo.schedule_enabled = false`. Set `local_fwi` and `effis` to target `github`, offset 360 minutes, a 1,800-second lease, and a four-hour retry window. Insert `alert_evaluation` as a critical `detection_processing` contract with 15-minute cadence, five-minute offset, dependencies `fusion` and `local_fwi`, and parser version `alert-rules-v1`.

- [ ] **Step 5: Add the three private reliability tables.**

Use lowercase identifiers, `timestamptz`, explicit checks, and indexed foreign keys. `source_jobs` states are `queued`, `running`, `retry_wait`, `succeeded`, and `failed`. Its scheduled-job uniqueness is:

```sql
create unique index source_jobs_scheduled_slot_idx
  on public.source_jobs (contract_key, scheduled_for)
  where trigger_kind = 'scheduled';
```

`source_job_leases.contract_key` is the primary key and `job_id` is unique, enforcing one active lease per contract. `source_gaps` is unique by `(contract_key, data_from, data_through)`.

Enable RLS, revoke all historical default privileges, grant service role read-only table access, and route every mutation through narrowly granted functions.

- [ ] **Step 6: Refactor the run recorder behind a private helper without breaking M1A.**

Move the insert/checkpoint body into a private helper that accepts nullable `_job_id uuid` and `_attempt integer`. Keep the public `record_source_run(...)` signature unchanged as a wrapper passing null job fields. Add nullable `job_id` and `attempt` columns to `source_runs`, with a unique partial index on `(job_id, attempt)`.

The helper continues to reject an unknown contract, deduplicates the run before touching the checkpoint, and preserves the M1A out-of-order checkpoint guard.

- [ ] **Step 7: Implement deterministic enqueue and dependency-aware claim.**

`enqueue_due_source_jobs(_observed_at, _enqueued_by)` truncates to a UTC minute and computes each contract slot from cadence plus offset. It inserts one scheduled job per due slot with:

```text
scheduled:<contract_key>:<scheduled_for ISO timestamp>
```

Use `INSERT ... ON CONFLICT DO NOTHING`; never select before inserting.

`claim_source_job(_worker_id, _execution_target, _contract_key default null, _now default now())`:

1. selects one available job with `FOR UPDATE SKIP LOCKED`;
2. ignores a contract with an unexpired lease;
3. requires each scheduled dependency's latest job at or before this slot, but newer than `scheduled_for - dependency cadence`, to be terminal; a manual dependency such as `geo` instead requires a valid checkpoint;
4. inserts the contract lease, increments `attempt_count`, marks the job `running`, and returns the claimed row;
5. commits before the caller performs any network work.

- [ ] **Step 8: Implement atomic completion, bounded retry, expiry recovery, and replay.**

`complete_source_job(...)` validates job, worker, and attempt against the lease. It records `job:<uuid>:attempt:<n>`, then:

- succeeds the job and resolves a covered gap;
- or releases the lease and schedules deterministic exponential backoff with jitter when `_retryable` is true and both budgets remain;
- or fails the job and opens/upserts its exact missing interval.

`private.requeue_expired_source_jobs(_now)` records a failed `internal_error` attempt for every expired lease in stable contract-key order, then applies the same retry budget and releases the lease.

`enqueue_source_replay(_gap_id, _requested_at)` increments the gap replay count, marks it `replaying`, and enqueues one replay job keyed by gap and replay count. Replaying the same gap twice cannot create the same job twice.

- [ ] **Step 9: Extend health and create the watchdog projection.**

Update `source_health` so `backfilling` is returned only when a valid non-stale product exists and that contract has a `replaying` gap. Keep `paused`, `unavailable`, and `stale` precedence.

Create service-role-only `source_watchdog` rows with allow-listed issue codes:

```text
missing_job
queue_delayed
lease_expired
run_delayed
```

Do not project private diagnostics, URLs, payloads, or credentials.

- [ ] **Step 10: Cover the state machine adversarially in pgTAP.**

Tests must prove:

- database and Cloudflare enqueue of one slot produce one job;
- two sequential claim calls return different contracts rather than the same lease;
- a dependent job is unavailable until its dependency is terminal;
- one contract's active lease does not prevent another contract from being claimed;
- a transient failure enters `retry_wait` and creates one open gap;
- a permanent failure becomes terminal immediately;
- max attempts and retry deadline stop retries;
- an expired lease creates an audited failure and is requeued or terminal by budget;
- duplicate completion is rejected and cannot advance a checkpoint twice;
- an older completed job cannot overwrite a newer checkpoint;
- replay uses the original interval;
- success without full interval coverage does not resolve the gap;
- full coverage resolves it exactly once;
- public roles cannot read tables, view the watchdog, claim work, complete work, or enqueue replay.

- [ ] **Step 11: Rebuild, regenerate types, and verify GREEN.**

Run:

```sh
bunx supabase@2.116.0 stop --no-backup
bunx supabase@2.116.0 start
bunx supabase@2.116.0 db push --local
bunx supabase@2.116.0 test db --local supabase/tests/source_reliability.test.sql
bunx supabase@2.116.0 test db --local supabase/tests/source_execution.test.sql
bunx supabase@2.116.0 gen types typescript --local > src/integrations/supabase/types.ts
bunx supabase@2.116.0 db lint --local
```

Expected: all pgTAP assertions pass and lint reports no new errors.

- [ ] **Step 12: Commit the database state machine.**

```sh
git add supabase/migrations supabase/tests src/integrations/supabase/types.ts
git commit -m "Add isolated source job state machine"
```

---

### Task 2: Typed job client and retry classification

**Files:**

- Create: `src/lib/source-jobs.ts`
- Create: `src/lib/source-jobs.server.ts`
- Create: `src/lib/__tests__/source-jobs.test.ts`
- Modify: `src/lib/source-runs.ts`
- Modify: `src/lib/__tests__/source-runs.test.ts`

**Interfaces:**

- Produces `SourceJob`, `ClaimedSourceJob`, `SourceJobResult`, and `RetryDisposition`.
- Produces `retryDispositionForReason(reason)`.
- Produces `claimSourceJob`, `completeSourceJob`, and `enqueueDueSourceJobs` typed RPC adapters.

- [ ] **Step 1: Write failing retry-classification tests.**

Assert this exact policy:

```ts
expect(retryDispositionForReason("credentials_missing")).toBe("permanent");
expect(retryDispositionForReason("schema_invalid")).toBe("permanent");
expect(retryDispositionForReason("disabled")).toBe("permanent");
expect(retryDispositionForReason("upstream_unreachable")).toBe("transient");
expect(retryDispositionForReason("coverage_partial")).toBe("transient");
expect(retryDispositionForReason("dependency_failed")).toBe("transient");
expect(retryDispositionForReason("internal_error")).toBe("transient");
```

- [ ] **Step 2: Run the focused tests and verify RED.**

Run: `bunx vitest run src/lib/__tests__/source-jobs.test.ts`

Expected: FAIL because `source-jobs.ts` does not exist.

- [ ] **Step 3: Implement the pure types and policy.**

Use discriminated results:

```ts
export type SourceJobResult = SourceRunReport & {
  retryDisposition: "none" | "transient" | "permanent";
};
```

Success and skipped results use `none`. Unknown thrown errors become `failed`, `internal_error`, and `transient` at the executor boundary.

- [ ] **Step 4: Write failing RPC adapter tests.**

Inject a minimal `rpc` client and assert exact generated function argument names. Claim must return `null` for an empty result. Completion must throw on an RPC error; a completion failure must not be swallowed because the lease must remain recoverable.

- [ ] **Step 5: Implement typed RPC adapters from generated function contracts.**

Derive argument and return types from `Database["public"]["Functions"]`. Do not cast through `unknown`, log raw diagnostics, or let the application write queue tables directly.

- [ ] **Step 6: Run tests and commit.**

```sh
bunx vitest run src/lib/__tests__/source-jobs.test.ts src/lib/__tests__/source-runs.test.ts
git add src/lib/source-jobs.ts src/lib/source-jobs.server.ts src/lib/source-runs.ts src/lib/__tests__
git commit -m "Add typed source job client"
```

---

### Task 3: Per-contract runners and isolated execution

**Files:**

- Create: `src/lib/ingest/source-runners.server.ts`
- Create: `src/lib/ingest/source-executor.server.ts`
- Create: `src/lib/__tests__/source-runners.test.ts`
- Create: `src/lib/__tests__/source-executor.test.ts`
- Modify: `src/lib/ingest/firms.server.ts`
- Modify: `src/lib/ingest/fci.server.ts`
- Modify: `src/lib/ingest/pipeline.server.ts`
- Modify: `src/lib/alerts-engine.server.ts` only if an injected clock is required for replay tests

**Interfaces:**

- Produces `SOURCE_RUNNERS: Record<RuntimeContractKey, SourceRunner>`.
- Produces `executeNextSourceJob({ target, workerId, contractKey? })`.
- A runner consumes one claimed job and returns one structured `SourceJobResult`; it never mutates queue state itself.

- [ ] **Step 1: Verify producer contracts before creating fixtures.**

Read each actual adapter return type and capture these existing fields: FIRMS fetched/inserted/feed count; FCI fetched/inserted/outside/latest slot; ONM fetched/stored/unmatched; screen registry/screened; fusion processed/created; winds updated; broadcast published/suppressed; delivery channel facts; FWI communes/rows; EFFIS communes/classified; alerts evaluated/created/suppressed/sent/failed.

- [ ] **Step 2: Write failing runner mapping tests with injected adapters.**

Cover every runtime key:

```text
firms
fci
onm
persistent_screen
fusion
openmeteo_wind
local_fwi
effis
alert_evaluation
broadcast_publish
broadcast_delivery
```

Assert that an optional wind failure does not call or block another runner, a partial adapter result remains partial, and raw error text stays only in `privateDiagnostic`.

- [ ] **Step 3: Run focused tests and verify RED.**

Run:

```sh
bunx vitest run src/lib/__tests__/source-runners.test.ts src/lib/__tests__/source-executor.test.ts
```

Expected: FAIL because the registry and executor do not exist.

- [ ] **Step 4: Implement one runner per contract by moving, not duplicating, pipeline logic.**

Move each stage from `runDetectionPipeline` and `runRiskPipeline` into a focused runner. Keep source-specific validation beside its adapter. Put `flagPersistentCandidates()` in the `fusion` runner after fusion succeeds. Split `local_fwi` and `effis`; neither catches or changes the other's outcome. Add `alert_evaluation` around `evaluateAlerts()`.

FIRMS exposes the minimum and maximum `detected_at` values it actually fetched. FCI keeps its upstream slot. Derived stages report the claimed job interval only when their successful processing covers it.

- [ ] **Step 5: Implement claim, run, and complete orchestration.**

`executeNextSourceJob` claims and commits the lease first, invokes only the selected registry entry, then calls completion. It catches one runner's unknown error into an `internal_error` result. It never loops across contracts, so one HTTP invocation executes at most one job.

- [ ] **Step 6: Add executor failure and idempotency tests.**

Assert:

- no claim returns `{ claimed: false }` without invoking a runner;
- one claim invokes exactly its own runner;
- a thrown adapter error completes as transient failure;
- a completion RPC error rejects so lease expiry can recover it;
- running the same replay interval twice sends the identical interval into the adapter;
- existing natural keys prevent duplicate detections, risk rows, alerts, and authority/ONM broadcasts; add the missing database uniqueness guard if a real replay test exposes one.

- [ ] **Step 7: Run focused and full unit tests, then commit.**

```sh
bunx vitest run src/lib/__tests__/source-runners.test.ts src/lib/__tests__/source-executor.test.ts
bun run test
git add src/lib/ingest src/lib/alerts-engine.server.ts src/lib/__tests__
git commit -m "Run source contracts independently"
```

---

### Task 4: Cloudflare scheduler and authenticated one-job Worker endpoint

**Files:**

- Create: `src/lib/source-scheduler.server.ts`
- Create: `src/lib/source-scheduler.plugin.server.ts`
- Create: `src/routes/api/internal/source-jobs/run.ts`
- Create: `src/lib/__tests__/source-scheduler.test.ts`
- Modify: `vite.config.ts`
- Modify: `src/routeTree.gen.ts` through the normal router generator/build

**Interfaces:**

- Cloudflare cron calls `dispatchScheduledSources(scheduledTime, env, fetchImpl)`.
- `POST /api/internal/source-jobs/run` authenticates `NADHIR_CRON_SECRET` and executes at most one Cloudflare-target job.
- Nitro registers `cloudflare:scheduled`; Wrangler declares `* * * * *`.

- [ ] **Step 1: Write failing scheduler tests.**

Inject enqueue and fetch functions. Assert the scheduler:

1. enqueues with trigger source `cloudflare` and the controller timestamp;
2. launches four authenticated one-job requests concurrently;
3. never puts the secret in URL, body, or logs;
4. rejects when enqueue fails;
5. reports a failed dispatch instead of returning success when every worker request fails.

- [ ] **Step 2: Run the focused test and verify RED.**

Run: `bunx vitest run src/lib/__tests__/source-scheduler.test.ts`

Expected: FAIL because the scheduler does not exist.

- [ ] **Step 3: Implement the scheduler and route.**

Use the runtime secret only in an `Authorization: Bearer` header. Return sanitized JSON from the route:

```json
{ "claimed": true, "contract": "firms", "state": "succeeded" }
```

Never return `privateDiagnostic`, upstream response text, or credentials.

- [ ] **Step 4: Register the Nitro hook and generated Wrangler trigger.**

Add the plugin path to Nitro configuration and this generated Wrangler configuration:

```ts
triggers: { crons: ["* * * * *"] },
vars: { NADHIR_APP_URL: "https://nadhir.app" },
```

The plugin uses `controller.scheduledTime` and `env.NADHIR_CRON_SECRET`. It awaits the scheduler promise so Cloudflare records a failed Cron Event when dispatch fails.

- [ ] **Step 5: Build and verify the generated artifact.**

Run:

```sh
bun run build
jq '.triggers.crons, .vars.NADHIR_APP_URL' .output/server/wrangler.json
rg -n 'cloudflare:scheduled|dispatchScheduledSources' .output/server/index.mjs
```

Expected: one minute trigger, production URL, and bundled hook.

- [ ] **Step 6: Run tests and commit.**

```sh
bunx vitest run src/lib/__tests__/source-scheduler.test.ts
git add src/lib/source-scheduler.server.ts src/lib/source-scheduler.plugin.server.ts src/routes/api/internal/source-jobs/run.ts src/lib/__tests__/source-scheduler.test.ts vite.config.ts src/routeTree.gen.ts
git commit -m "Add Cloudflare source scheduler"
```

---

### Task 5: Database scheduler, GitHub batch consumers, and independent watchdog

**Files:**

- Modify: `supabase/migrations/*_isolated_source_execution.sql` created in Task 1
- Create: `scripts/run-source-job.ts`
- Create: `scripts/source-watchdog.ts`
- Create: `src/lib/source-watchdog.ts`
- Create: `src/lib/__tests__/source-watchdog.test.ts`
- Modify: `.github/workflows/risk-refresh.yml`
- Create: `.github/workflows/source-watchdog.yml`
- Modify: `package.json`

**Interfaces:**

- Supabase cron directly calls enqueue and expired-lease recovery every minute.
- GitHub runs `local_fwi` and `effis` as separate queue consumers.
- The watchdog reads `source_watchdog` directly through Supabase and exits non-zero on any row.

- [ ] **Step 1: Add failing pgTAP assertions for cron replacement.**

Assert current cron state contains `nadhir-source-enqueue` and `nadhir-source-recover`, and contains none of `nadhir-ingest`, `nadhir-risk`, or `nadhir-alerts`. Assert enqueue/recovery commands call database functions and contain no `net.http_post`.

- [ ] **Step 2: Replace direct database cron jobs in the migration.**

Unschedule old names only when they exist, then schedule:

```sql
select cron.schedule(
  'nadhir-source-enqueue',
  '* * * * *',
  $$select public.enqueue_due_source_jobs(now(), 'database')$$
);
select cron.schedule(
  'nadhir-source-recover',
  '* * * * *',
  $$select private.requeue_expired_source_jobs(now())$$
);
```

- [ ] **Step 3: Write failing watchdog policy tests.**

Given typed rows, assert no issues exits zero; `missing_job`, `queue_delayed`, `lease_expired`, or `run_delayed` exits one and prints only contract key, issue code, and timestamps. A raw diagnostic property in test input must never appear in output.

- [ ] **Step 4: Implement the pure watchdog formatter and database script.**

The script creates a service-role Supabase client, selects the service-only view, prints one compact line per issue, and exits one when any issue exists. It never calls the application host and never mutates queue state.

- [ ] **Step 5: Convert the daily workflow into two queue consumers.**

Keep the 06:05 UTC schedule and manual dispatch. Use a matrix with exact values `local_fwi` and `effis`; each job invokes `scripts/run-source-job.ts --target github --contract <key>`. Each matrix job owns one contract and can retry within its 30-minute workflow budget without blocking the other.

- [ ] **Step 6: Add the five-minute independent watchdog workflow.**

Use `permissions: {}`, a five-minute schedule, `workflow_dispatch`, pinned checkout/setup actions, frozen install, and only `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` secrets. Run `bun run watchdog:sources`.

- [ ] **Step 7: Run workflow-adjacent tests and database tests.**

```sh
bunx vitest run src/lib/__tests__/source-watchdog.test.ts
bunx supabase@2.116.0 test db --local supabase/tests/source_execution.test.sql
```

- [ ] **Step 8: Commit scheduler redundancy and watchdog.**

```sh
git add supabase/migrations supabase/tests scripts src/lib/source-watchdog.ts src/lib/__tests__/source-watchdog.test.ts .github/workflows package.json
git commit -m "Add dual scheduling and source watchdog"
```

---

### Task 6: Replay tool and full removal of direct scheduler paths

**Files:**

- Create: `scripts/replay-source-gap.ts`
- Create: `src/lib/__tests__/replay-source-gap.test.ts`
- Delete: `src/routes/api/public/cron/ingest.ts`
- Delete: `src/routes/api/public/cron/risk.ts`
- Delete: `src/routes/api/public/cron/alerts.ts`
- Delete: `src/lib/ingest/pipeline.server.ts`
- Delete: `src/lib/cron-auth.server.ts`
- Modify: `src/routeTree.gen.ts`
- Modify: `package.json`

**Interfaces:**

- `bun run replay:source -- <gap-uuid>` invokes only the service-role replay RPC.
- No HTTP endpoint can execute the old combined pipelines. The inactive database HTTP helper and token table stay only until the schema-after-code cleanup release because dropping them before the Worker cutover would break an in-flight old request.

- [ ] **Step 1: Write failing replay command tests.**

Assert a missing or malformed UUID exits before creating a client, a valid UUID calls `enqueue_source_replay` once, and output contains only gap ID, job ID, and state.

- [ ] **Step 2: Run the focused test and verify RED.**

Run: `bunx vitest run src/lib/__tests__/replay-source-gap.test.ts`

Expected: FAIL because the command does not exist.

- [ ] **Step 3: Implement the operator replay command.**

Require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, validate UUID syntax, call the typed RPC, and fail non-zero on any database error. Do not accept a contract key or arbitrary interval from the command line; replay only a recorded gap.

- [ ] **Step 4: Delete every direct scheduler and combined pipeline path.**

Remove the three `/api/public/cron/*` routes, the combined `pipeline.server.ts`, and the dual-token auth wrapper used only by database HTTP cron. Regenerate the route tree. Prove both directions:

```sh
rg -n 'runDetectionPipeline|runRiskPipeline|/api/public/cron/(ingest|risk|alerts)|nadhir_cron_call' src .github README.md roadmap.md GAPS.md
rg -n 'executeNextSourceJob|enqueue_due_source_jobs|cloudflare:scheduled|source_watchdog' src scripts .github supabase
```

The first command must return no runtime references. Historical migration definitions are allowed only in older immutable migration files.

- [ ] **Step 5: Run replay and full unit tests, then commit.**

```sh
bunx vitest run src/lib/__tests__/replay-source-gap.test.ts
bun run test
git add -A src scripts package.json
git commit -m "Remove direct source cron pipelines"
```

---

### Task 7: Product documentation, milestone gates, and full verification

**Files:**

- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `GAPS.md`
- Modify: `roadmap.md`
- Modify: `docs/superpowers/specs/2026-08-31-data-reliability-control-plane-design.md` only to register `alert_evaluation` as the discovered current stage
- Modify: `docs/superpowers/plans/2026-08-31-source-health-contract-cleanup.md` only with observed evidence, never by weakening its gate

**Interfaces:**

- Documents the queue, triggers, retry boundaries, watchdog, replay command, and operator secrets.
- Marks M2 complete only after all gates below pass.

- [ ] **Step 1: Update operator and contributor docs.**

Document:

- Supabase cron and Cloudflare cron both enqueue normalized slots;
- Postgres leases serialize one job per contract, not the whole pipeline;
- FWI and EFFIS use separate GitHub consumers;
- watchdog failures mean database evidence breached a contract, not an inferred Worker crash;
- replay accepts only a retained FIRMS or FCI gap ID; unsupported terminal gaps are unrecoverable;
- direct `/api/public/cron/*` endpoints no longer exist;
- queue/gap/run internals remain private.

Also register the dormant `private.nadhir_cron_call(text)` helper and `public.internal_cron_token` table as cleanup targets once the deployed queue and both enqueue triggers have completed an observation window. They remain inactive—not a parallel scheduler—until that contract release.

- [ ] **Step 2: Update the gap ledger and roadmap truthfully.**

Mark M2 complete only if queue, leases, retry, gaps, replay, both schedulers, watchdog, and old-path removal are all verified. Keep M3 atomic FWI publication, M4 per-channel delivery, M5 incidents/operator controls, and M6 new-source gate open.

- [ ] **Step 3: Run the complete repository and database gates derived from CI.**

Rebuild the database from the full ledger, then run:

```sh
bun install --frozen-lockfile
bunx tsc --noEmit
bun run test
bun run lint
bunx supabase@2.116.0 test db --local supabase/tests/source_reliability.test.sql
bunx supabase@2.116.0 test db --local supabase/tests/source_execution.test.sql
bunx supabase@2.116.0 db lint --local
bunx supabase@2.116.0 db advisors --local
cp .env.example .env.local
bun run build
grep -q "kuukthyenirwgdfkltlm" .output/public/assets/client-*.js
bunx wrangler deploy --dry-run
```

Expected: every command succeeds; generated Wrangler config contains the minute cron trigger.

- [ ] **Step 4: Run no-legacy and security scans.**

```sh
rg -n 'runDetectionPipeline|runRiskPipeline|/api/public/cron/' src .github
rg -n 'private_diagnostic|replay_cursor|schema_fingerprint' src/routes/api/public src/components src/routes/status.tsx
rg -n 'source_jobs|source_job_leases|source_gaps' src/routes src/components
git diff --check
```

Expected: no old runtime path, no private field on public surfaces, no UI/direct table access to queue internals, and no whitespace errors.

- [ ] **Step 5: Re-check the separate M1A cleanup entry evidence.**

Query production read-only. If `local_fwi`, `effis`, or `geo` still lacks a qualifying non-migration run, leave `data_sources`, `ingest_runs`, and the compatibility trigger untouched and record the blocker. M2 does not weaken or bypass that release gate.

- [ ] **Step 6: Review the full diff leanly before the final commit.**

Remove unused fields, duplicated tests, obsolete comments, and any old scheduler reader/writer. Confirm the user-owned untracked Telegram file is absent from the diff.

- [ ] **Step 7: Commit documentation and milestone state.**

```sh
git add README.md CONTRIBUTING.md GAPS.md roadmap.md docs/superpowers
git commit -m "Document isolated source execution"
git status --short
```

Expected: only `?? data/telegram-channels.json` remains outside the committed branch.

- [ ] **Step 8: Stop at the protected-operation boundary.**

Do not push, open a pull request, merge, apply the production migration, or deploy without fresh owner approval naming those actions. Report the branch, commits, verification evidence, cleanup-gate state, and remaining production rollout checks.

The later, separately authorized production rollout must verify the schema migration queued current slots before the old HTTP jobs were removed, dispatch the converted risk workflow if `local_fwi` or `effis` is already due, observe both `database` and `cloudflare` enqueue attempts deduplicating to one job, verify a Cloudflare job and each GitHub-target job complete, confirm the watchdog is green, then smoke-test `/status` and `/api/public/v1/status` without exposing queue internals.
