# ONM Supersession Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A warning that ONM drops from its feed stops being current on the map, the weather page and the push relay.

**Architecture:** ONM republishes whole bulletins as fresh `Alert` messages without `references`; absence from a successful, non-empty feed is the only replacement signal. A SQL function stamps `superseded_at` on live rows absent from the feed and older than its newest bulletin; the ingest upsert clears the stamp for rows that reappear. Readers of "current" warnings filter on `superseded_at is null`.

**Tech Stack:** Supabase Postgres (pgTAP via `supabase test db`), TypeScript, Vitest, TanStack Query.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-22-incident-lifecycle-and-map.md`, sub-project 1.
- Migrations are additive (deploy applies schema before code). New migration timestamp must sort after `20260922190000`.
- Gates (from `.github/workflows/ci.yml`): `bunx tsc --noEmit`, `bun run test`, `bun run lint`, `bash scripts/test-db.sh`.
- Zero comments unless a non-obvious why.

---

### Task 1: `superseded_at` column and `supersede_onm_absent` function

**Files:**
- Create: `supabase/migrations/20260922200000_onm_supersession.sql`
- Create: `supabase/tests/onm_supersession.test.sql`

**Interfaces:**
- Produces: column `onm_vigilance.superseded_at timestamptz null`; `public.supersede_onm_absent(_feed_cap_ids text[], _feed_sent timestamptz) returns integer` (rows stamped), executable by `service_role` only; raises on an empty id list.

- [ ] Step 1: Write `onm_supersession.test.sql` covering: absent live older row stamped; row present in feed untouched; absent row sent at/after `_feed_sent` untouched (replayed/stale feed); already-expired absent row untouched; second call stamps nothing (idempotent); empty list raises; `authenticated` cannot execute.
- [ ] Step 2: Run `bash scripts/test-db.sh` — expect failure (function missing).
- [ ] Step 3: Write the migration.
- [ ] Step 4: Run `bash scripts/test-db.sh` — expect pass.
- [ ] Step 5: Commit.

### Task 2: Ingest stamps supersession and revives reappearing rows

**Files:**
- Modify: `src/lib/ingest/onm.server.ts` (`ingestOnm`)
- Modify: `src/lib/__tests__/source-archive-collectors.test.ts` (rpc mock)
- Create: `src/lib/__tests__/onm-supersession.test.ts`

**Interfaces:**
- Consumes: `supersede_onm_absent` from Task 1.
- Produces: `OnmRun.superseded: number`.

- [ ] Step 1: Failing test: `ingestOnm` with the fixture feed upserts rows carrying `superseded_at: null` and calls `rpc("supersede_onm_absent", { _feed_cap_ids: <all 4 ids>, _feed_sent: <max sent> })`, returning `superseded`; an rpc error is returned as `error`, not swallowed; an empty feed never calls rpc.
- [ ] Step 2: Run `bunx vitest run src/lib/__tests__/onm-supersession.test.ts` — fail.
- [ ] Step 3: Implement: add `superseded_at: null` to each upserted row; after all upsert batches succeed, call the rpc with `entries.map(e => e.cap_id)` and the max `sent`.
- [ ] Step 4: Tests pass, including the collector test after adding `rpc.mockResolvedValue({ data: 0, error: null })`.
- [ ] Step 5: Commit.

### Task 3: Readers ignore superseded warnings

**Files:**
- Modify: `src/lib/nadhir.ts` (`onmVigilanceQuery`, `OnmVigilance` type)
- Modify: `src/lib/weather-onm.ts` (fields, current query)
- Modify: `src/components/nadhir/WeatherForecast.tsx` (group currency)
- Modify: `src/lib/ingest/broadcast.server.ts` (`relayOnmWarnings`)
- Test: `src/lib/__tests__/weather-onm.test.ts`, new `src/lib/__tests__/onm-readers-supersession.test.ts`

- [ ] Step 1: Failing tests: map query and relay query filter `superseded_at is null`; weather current query filters it while the history query does not; a weather group whose only unexpired bulletin is superseded is not shown.
- [ ] Step 2: Run — fail.
- [ ] Step 3: Implement the filters; add `superseded_at` to `OnmVigilance` and the weather field list; group kept only if some bulletin is unexpired and not superseded.
- [ ] Step 4: Run all gates — pass.
- [ ] Step 5: Commit, push branch, open PR stacked on the spec.

Not changed, by design: `BroadcastBanner` (reissues are suppressed at relay, so hiding a superseded broadcast could hide a live warning; handled in sub-project 6) and delivery (the queue's own expiry bounds it).
