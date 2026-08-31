# Data reliability control plane — design

Date: 2026-08-31
Status: approved
Epic: Reliable source ingestion and synchronized products

## Mandate

Nadhir cannot keep an upstream provider online. It must guarantee that it knows when a
source or scheduler is late, never presents stale or partial data as current, can replay
missed intervals, and continues safely when an optional source fails.

Build one reliability contract for every external source and derived pipeline stage
before adding the newly researched vegetation, soil-moisture, lightning, burned-area,
population, rainfall, ensemble, or smoke layers.

## Audiences

- Residents and relatives need current warnings without having to interpret system
  health.
- Municipal staff and public API consumers need timestamps, completeness, and
  provenance for every forecast product.
- Operators need actionable incidents, source lag, backlog, and replay controls.
- Contributors need one adapter contract and one test harness for new sources.

The public sees whether a product is current and what it depends on. Raw upstream errors,
credentials, request bodies, and operator controls remain private.

## Current failure modes

The existing system has useful pieces but no end-to-end reliability contract.

- `data_sources` stores one mutable status and note. A later run overwrites the evidence
  from the run before it.
- `ingest_runs` journals some stages, but not every stage, retry, scheduler request, or
  delivery attempt.
- Freshness thresholds live in `src/lib/freshness.ts` and are evaluated in the browser.
  The `/status` summary counts stored states and can disagree with the rows it renders.
- `pg_cron` calls the application through `pg_net` but does not inspect the asynchronous
  HTTP response. A successful enqueue is not a successful pipeline run.
- Source success usually means that an HTTP request or function returned. It does not
  consistently prove upstream recency, expected coverage, schema compatibility, or
  downstream publication.
- The daily risk workflow accepts a quota-limited partial refresh when any rows landed.
  The public query can therefore consume a forecast set that was never complete.
- Detection, screening, fusion, wind enrichment, publication, and delivery share one
  sequential request. A thrown screening failure prevents every later stage.
- Public access to raw `ingest_runs.error` can disclose implementation or upstream
  details that belong in operator diagnostics.
- There is no independent watchdog, incident deduplication, automatic replay cursor, or
  explicit fallback state.

## Safety invariants

1. No stale risk forecast can create a risk alert.
2. Missing detections never mean that no fire exists.
3. An optional enrichment failure cannot block detection, fusion, publication, or
   delivery.
4. An HTTP 200 response alone never makes a source healthy.
5. A partial snapshot is never published as the current complete product.
6. Every user-facing derived value identifies its valid time, publication time, source
   versions, and quality state.
7. Fallback data keeps its own age and provenance; fallback use is never labelled as a
   primary-source success.
8. Replaying the same interval produces no duplicate detection, alert, broadcast, or
   forecast.
9. Public status contains sanitized facts. Raw errors and replay controls are
   operator-only.

## Reliability model

### Signal families and criticality

Reliability applies to signal families, not a rule that every enrichment must have two
providers.

| Family                   | Members at launch                                                   | Required behavior                                                                                            |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Fire detection           | FCI, FIRMS                                                          | Continue with either source, visibly degraded; neither source is interpreted as proof of no fire.            |
| Detection processing     | persistent-source screen, fusion, wind enrichment, alert evaluation | Screening and fusion are required before a fire can alert. Wind may degrade without blocking detection.      |
| Official warnings        | ONM                                                                 | No substitute may impersonate the authority. Distinguish a successful empty poll from an unreachable feed.   |
| Fire danger              | local FWI, EFFIS comparator                                         | Local FWI is the operational product. EFFIS may validate it but cannot replace an incomplete local snapshot. |
| Broadcast delivery       | FCM, Telegram                                                       | Persist once, attempt channels independently, retry failures, and expose per-channel delivery state.         |
| Reference and enrichment | geography, land cover, future NDVI/SWI/GHSL/burned area             | Serve the latest valid version with its age or omit it. Never block critical families.                       |

Each member is classified as `critical`, `supporting`, or `optional`. Critical means its
failure changes user-facing capability and opens an incident; it does not mean fail the
whole pipeline.

### Health states

Health is derived at read time from a versioned contract and recorded facts:

- `healthy`: latest run and data watermark meet the contract and quality checks.
- `delayed`: past the warning deadline but a valid product remains within its grace
  period.
- `degraded`: a current run is partial, a supporting member failed, or a fallback is in
  use.
- `stale`: no valid current product exists inside the maximum age.
- `unavailable`: no usable product or fallback exists.
- `backfilling`: current service is usable while a recorded gap is replayed.
- `paused`: an operator intentionally disabled the member.

Stored code does not set these labels directly. A database view derives them from the
contract, source checkpoint, current time, open gaps, and latest valid snapshot.

### Time model

Every run records distinct timestamps:

- `scheduled_for`: when Nadhir intended the run to happen.
- `started_at` and `finished_at`: execution time.
- `upstream_published_at`: when the provider released the product, when available.
- `data_from` and `data_through`: observation interval covered.
- `validated_at`: when quality checks passed.
- `published_at`: when Nadhir made the result current.

This separates scheduler delay, upstream delay, download delay, processing delay, and
publication delay. The user-facing age is based on the data's valid time, not the last
successful HTTP request.

## Storage

### `source_contracts`

One version-controlled row per external source or derived stage:

- stable key and label
- monotonically increasing contract version
- signal family and criticality
- expected cadence
- warning, stale, and maximum fallback ages
- expected coverage rule
- schema/parser version
- dependency keys
- licence and attribution
- operator owner and runbook link
- enabled state

Rows are added or changed by migrations so a contract change is reviewable in the same
pull request as its adapter.

### `source_checkpoints`

One mutable row per contract:

- last attempt and successful validation
- upstream and observation watermarks
- replay cursor
- consecutive failure count
- last schema fingerprint
- latest accepted record and coverage counts
- current fallback member, if any

The checkpoint accelerates scheduling. It is not the audit record and can be rebuilt from
runs and snapshots.

### `source_runs`

Append-only execution record replacing `ingest_runs`:

- contract key and contract version
- trigger and idempotency key
- all timestamps from the time model
- `running`, `succeeded`, `partial`, `failed`, or `skipped`
- records seen, inserted, updated, rejected, and expected
- coverage result and quality checks
- sanitized public reason code
- private diagnostic detail

Public access is limited to a sanitized view. The raw table is restricted to operators
and the service role. Existing `ingest_runs` data is migrated and its old read path is
removed in M1A. The table stays dormant for the schema-before-code window and is removed
by the named contract cleanup release after production evidence confirms the cutover.

### `source_gaps`

Recorded missing intervals with `open`, `replaying`, `resolved`, or `unrecoverable`
state. A gap is resolved only when a run proves coverage for the missing interval.

### `dataset_snapshots`

Manifest for coherent products such as daily risk and future fuel context:

- product key and valid time
- staging, published, rejected, or superseded state
- expected and accepted coverage
- source watermarks and parser versions
- quality-check results
- publication time

Rows written during a build remain associated with a staging snapshot. Consumers select
only the single published manifest. Publication is one transaction after completeness and
quality checks pass.

## Adapter contract

Every adapter implements four explicit operations:

1. `discover(checkpoint)` identifies the upstream interval or product to fetch.
2. `fetch(candidate)` retrieves bytes with bounded timeout and retry classification.
3. `validate(payload, contract)` verifies schema, recency, spatial extent, counts, and
   source-specific quality rules.
4. `commit(validated, run)` writes idempotently and advances the checkpoint only after
   the transaction succeeds.

Adapters return structured reason codes. They do not update public health labels or catch
unknown errors as successful degradation.

Source-specific validation remains local to the adapter. Examples include FCI watch-box
and slot recency, EFFIS cold-start codes, a complete 1,536-by-6 risk matrix, and a burned-
area product whose valid date advances.

## Scheduling, isolation, and replay

- Supabase cron inserts due jobs directly in the database. A Cloudflare Cron Trigger
  independently enqueues the same intervals through the application.
- A database lease keyed by contract and scheduled interval makes duplicate triggers
  harmless.
- Workers claim individual source or stage jobs. A slow or failed optional source cannot
  consume the lease or timeout budget of another source.
- Exponential retry with jitter is limited by the product's usefulness window. Permanent
  authentication, schema, and licence failures open incidents immediately rather than
  retrying indefinitely.
- Detection adapters fetch from the checkpoint with an overlap window and rely on natural
  keys for idempotency.
- Snapshot products rebuild a complete staging snapshot; they do not patch the currently
  published snapshot in place.
- Exact replays use the same adapter and validation path as scheduled runs, but are enabled only
  where the provider can supply the requested historical interval. Unsupported or expired gaps
  are marked unrecoverable rather than silently substituting current data.

The direct cron endpoints are removed. A GitHub Actions watchdog reads the run ledger and queue
without using the application host. It reports breached database evidence without inferring that
a particular Worker or scheduler process died. No parallel legacy scheduler remains.

## Fallback behavior

- FCI and FIRMS are complementary observations. Either may continue detection while the
  family is degraded; confidence retains the surviving source identity.
- Local FWI has no automatic external replacement. If today's complete snapshot is
  absent, the forecast is stale, risk alerts stop, and the last snapshot is shown only
  with an explicit date when still inside the display grace period.
- EFFIS remains an external comparator and is omitted when its quality gate fails.
- ONM's last valid warning remains attributable until its own expiry. Another provider
  cannot generate an ONM warning.
- Broadcast channel attempts are independent. A successful Telegram delivery does not
  mark a failed FCM attempt delivered, or vice versa.
- Optional layers use their last valid snapshot within the contract or disappear from
  derived calculations. Missing optional inputs are recorded in the output manifest.

## Incidents and operator workflow

`operational_incidents` deduplicates one open incident per contract and reason code. It
records first detection, latest evidence, affected capability, acknowledgement, and
resolution.

Initial operator notifications use the existing Telegram credentials with a separate
operator destination and GitHub workflow failures as an independent second path. Alerting
does not reuse the public broadcast queue. Notification failure is itself recorded but
does not erase the incident.

The operator view provides:

- current health and affected capability
- latest watermarks and coverage
- failure streak and last diagnostic
- open gaps and replay state
- fallback in use
- acknowledge, pause, resume, and replay actions with an audit record

No operator action silently changes a public danger value or fire state.

## Public status and provenance

The public status page and `/api/public/v1/status` read the same server-derived health
view. They show valid time, last successful publication, current delay, affected
capability, fallback use, and a sanitized explanation.

Forecast, fire, and future layer APIs include a compact provenance object with snapshot
ID, source keys, valid time, published time, and quality state. Pages consume that same
object rather than inventing separate freshness rules in React.

## Retention and security

- Source runs and incident history are retained for 180 days; daily aggregates remain
  for reliability trends.
- Snapshot manifests remain as long as the product data they describe.
- Raw payloads are retained only when a source-specific replay or audit requirement
  justifies them, with a documented expiry.
- Public reason codes are allow-listed. Raw URLs, response bodies, tokens, stack traces,
  and provider account identifiers remain private.
- Replay, pause, resume, and manual checkpoint actions require the existing admin role.

## Initial service objectives

These are launch targets and are reviewed after 30 days of measured production data.

- Detection scheduler gap: warn at 15 minutes, incident at 25 minutes.
- FCI observation watermark: warn at 45 minutes, stale at 60 minutes.
- Detection pipeline: 99.5% of scheduled intervals validated each calendar month.
- Daily local FWI: one complete 9,216-row snapshot published by 08:00 UTC; no partial
  snapshot is current.
- Broadcast delivery: every persisted broadcast attempted on each configured channel
  within 5 minutes; incident when the oldest unattempted delivery reaches 15 minutes.
- Incident detection: a breached critical contract creates an incident within one
  additional scheduler interval.

FIRMS observation age is not assigned a fixed fire-free threshold: polar-orbit coverage
and empty scenes make the latest detection time an invalid heartbeat. Its liveness uses
successful poll cadence, response validation, and provider-specific metadata where
available.

## Verification

- Contract tests for every adapter use payloads captured from and checked against the
  actual producer.
- State-machine tests cover duplicate, late, partial, out-of-order, backfill, paused, and
  terminal runs.
- Migration tests prove public users cannot read private diagnostics or invoke controls.
- Snapshot tests interrupt a risk build at multiple points and prove the previous complete
  snapshot remains current.
- Replay tests run the same interval twice and assert no duplicate domain rows or alerts.
- Scheduler tests fire both triggers for one interval and prove one lease is executed.
- Failure drills cover dead scheduler, provider timeout, authentication rejection, schema
  change, implausible extent, partial coverage, database failure, and notification failure.
- Browser acceptance verifies that homepage, forecast, status, and API surfaces agree on
  freshness and fallback state.

## Delivery milestones

1. **Contracts and truthful health:** source contracts, checkpoints, private runs,
   derived health view, migrated status UI, and sanitized public API.
2. **Isolated execution:** queue, leases, per-adapter runners, retry classification,
   gaps, replay, and dual scheduler triggers.
3. **Atomic daily risk:** staging snapshots, completeness gate, alert freshness guard,
   and removal of partial in-place publication.
4. **Delivery reliability:** per-channel backlog objectives, retries, and incidents.
5. **Operator response:** incident notifications, controls, audit trail, and failure
   drills.
6. **New-source gate:** adapter template and CI contract requiring reliability metadata,
   tests, licence, provenance, and fallback behavior before any researched layer ships.

Milestones are separate pull requests. Each must migrate its existing application path
completely; no old health, scheduler, or publication path remains beside its replacement.

Production applies migrations before application code. Destructive schema cleanup therefore
uses a two-release expand/contract cutover: the expand release creates and backfills the new
model, migrates every application reader and writer, and leaves the old database objects
dormant for one release. The immediately following contract release drops those objects after
production evidence confirms that no deployed code uses them. This is a deployment-safety
shim, not a parallel runtime path.

## Explicitly deferred

- Importing NDVI, soil moisture, GHSL, burned area, lightning, IMERG, ensembles, or CAMS.
- Changing FWI mathematics or danger thresholds.
- Changing fire confidence or lifecycle rules.
- Buying an observability vendor.
- Claiming an upstream availability guarantee Nadhir does not control.

Those features start only after milestone 3 proves that a new daily layer cannot publish
partial or stale state.
