# Platform audit — 9 September 2026

Audited release: `d0b376ec6eff5978d53109a6bd3a9df10bc79c6a` (PR #128). Observations collected approximately 15:48–15:56 UTC. Production checks were read-only; failure injection and audit-event insertion used local fixtures, with the SQL transaction rolled back. No application fixes, public messages, account changes or deployment were performed by this audit.

## Verdict

The platform is collecting and archiving live data, but three newly reproduced defects undermine official-incident continuity and administrative audit integrity. Repair these first. Personal delivery, offline preparation and mobile payload size remain material gaps. ITA ingestion is working; a reviewed, multi-hazard civil-alert publication workflow remains a separate milestone.

This is a bounded production/code/behavioral audit, not a completed two-cycle exhaustive QA certification. Historical findings in `QA_AUDIT.md` were not all replayed.

## New confirmed defects

### A-01 — P1: An unprocessed DGPC bulletin unlists existing incidents

`runTextSourceWith` adds a fresh bulletin's coverage before calling the LLM. A provider failure or missing API key leaves that coverage empty, but the final reconciliation still unlists every earlier incident absent from it.

Reproduction: create two listed incidents from an earlier bulletin, then process a later bulletin whose extraction throws. Both incidents become unlisted. Returning `skipped/no_api_key` produces the same result; that run also has no `error`. These are pipeline executions against an in-memory persistence adapter, not proof that a production incident was already affected.

Evidence: `src/lib/text-sources/pipeline.server.ts:416`, `:430`, `:508`; `src/lib/ingest/source-runners.server.ts:433`. The lead reran the failure tests in [dgpc-reproduction.log](evidence-2026-09-09/dgpc-reproduction.log); [reproduction source](evidence-2026-09-09/dgpc-reproduction.test.ts.txt).

Required behavior: reconcile absence only after successful, complete interpretation. Preserve prior incident state and report incomplete extraction honestly when the provider or geographic resolution fails.

### A-02 — P1: A processing interruption strands stored DGPC evidence

Documents are inserted before gazetteer loading and interpretation. Later polls exclude their known external IDs. Retry selection uses `document_extractions`, which is only populated after particular per-document failures; a failure between insertion and that step leaves no work to retry.

Reproduction: insertion succeeds, gazetteer loading throws, then the dependency recovers. Polling identical posts returns `fetched: 0`, `retried: 0`, zero extraction calls and zero incidents despite the stored document. The archive retains evidence but does not restore the interrupted processing automatically.

Evidence: `src/lib/text-sources/pipeline.server.ts:379`, `:400`, `:544`, `:676`; same reproduction files as A-01.

Required behavior: durable per-document processing state, recorded atomically with ingestion, and recoverable unfinished work after any interruption.

### A-03 — P1: Non-admins can fabricate administrative audit events

Production grants `authenticated` EXECUTE on `record_admin_audit`. Its security-definer body inserts caller-supplied domain, action, target and before/after data without checking the caller's role or whether the claimed operation happened.

Local transaction: a signed-in-role actor for whom `has_role(auth.uid(),'admin')` returned false successfully inserted `people / role.grant` with an invented target and `after={"role":"admin"}`. The row was readable as their own event; the transaction was rolled back. The actor identity remains their own, and this does **not** grant an actual role. The impact is fabricated evidence and unbounded audit pollution.

Evidence: production `has_function_privilege` and `pg_get_functiondef` were queried independently by reviewer and lead. Definition: `supabase/migrations/20260904200200_admin_audit.sql:39–77`. No client code directly calls the recorder.

Required behavior: revoke direct authenticated EXECUTE; authorized operation functions should write their own audit entries. Verify legitimate actions still create exactly one truthful event.

## Existing gaps reverified on this release

| ID / priority | Finding and evidence | Required next step |
| --- | --- | --- |
| A-04 / P1 | Personal alert settings promise Email, but `alerts-engine.server.ts:595–609` inserts alerts and invokes webhooks; no personal email sender is connected. `AlertNotifier.tsx:16–60` ignores `alert_push` and subscribes once using the initial user rather than reacting to auth changes. Local Settings visibly exposes Email and Push. | Enforce preferences/session changes and make channel capability explicit; private end-to-end delivery proof. |
| A-05 / P1 | Survival pack is saved from within Survival Mode after location/data loads, not during zone setup. It contains no map tiles. `public/sw.js:41–58` only falls back to previously cached survival pages. Fresh offline entry is not guaranteed. | Prepare in normal setup, expose readiness and test cold offline navigation on device. |
| A-06 / P1 | Forecast decoded HTML measured 12,287,077 bytes; compressed transfer 1,291,755 bytes; TTFB 11.79 s, total 12.43 s. Homepage decoded HTML 5,901,360 bytes, transfer 1,213,396 bytes, total 6.38 s. Browser forecast navigation timed out once, then rendered and commune search worked. `forecast.tsx:30` loads all forecasts and administrative units. | Reduce initial serialized data and establish mobile payload/latency budgets. These are single-machine samples, not a Core Web Vitals benchmark or proven timeout cause. |
| A-07 / P2 | `dispatchWebhooks` is only called for newly inserted alerts. Endpoint-read and receipt-write errors are not consistently checked, and no retry consumer reads failed receipts. `webhooks.server.ts:268–346`. | Persist pending deliveries, retry failures and make receipt errors visible. Code-confirmed; no live webhook send was attempted. |
| A-08 / P2 | Contribute displays “108 alerts delivered,” but `contribute.server.ts:56` counts alert records. It also claims no delivery channels and a single detection provider. The language count says four while the selector exposes three. | Derive public claims from actual capability/delivery evidence and label available vs reviewed languages. |
| A-09 / P2 | Privacy promises deletion from Settings (`en.ts:965`); local Settings exposes Save/Sign out and no account-deletion control. No account-deletion implementation found. | Implement the promised account lifecycle or correct the promise. |
| A-10 / P2 | Fresh dependency audit reports four high advisories across `brace-expansion@5.0.8`, `js-yaml@4.3.0` and `sharp@0.35.2`. Leaked-password protection remains disabled according to live advisors. | Upgrade affected dependencies and validate bundle/tooling reachability; enable appropriate password protection. Advisories do not establish a remotely exploitable production path. |

Dependency evidence: [audit output](evidence-2026-09-09/dependencies.json). [Supabase password-protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Verified working / operational observations

- PR #128 production CI/deployment, external watchdog, and the previously pending FIRMS screening workflow completed successfully. The audited deployed revision also appears on production archive rows.
- ITA: 23 stored reports, all 23 extracted, zero pending and zero extraction errors at sampling; newest publication 15:33:49 UTC, fetched 15:35:33 UTC.
- Archive sampling found 42 observations across DGPC, FCI, FIRMS, ITA, ONM and wind. ITA includes original 200 responses and separate 304 observations. Daily forecast/EFFIS archive coverage is implemented but their next daily production execution was not observed after deployment.
- FCI returned two archived 503 responses in the sampled seven attempts. Health correctly became degraded, then recovered. At 15:55:48 UTC all 15 source-health entries were healthy. This is an observed provider interruption, not a continuing outage claim.
- Risk health reports complete 9,216/9,216 coverage, corresponding to 1,536 communes × six horizons. Browser forecast search selected Bejaia and showed six days. Coverage is not scientific calibration validation.
- Every public base table has RLS. Archive service-role privileges are INSERT/SELECT without UPDATE/DELETE. Archive reads are admin-scoped; both Storage buckets are private. Anonymous reads of archive, ITA, source runs, operational incidents, receipts and Telegram-channel data were denied.
- Anonymous production `/admin/sources` redirected to sign-in. The existing local admin session exposed admin navigation, Settings and the archive panel.
- Delivery reviewer found 31 completed queue entries per channel, zero stale leases and zero duplicate receipt keys. There were 2,500 FCM receipt records and zero Telegram receipts. FCM receipts record provider acceptance, not confirmed display on individual devices.
- Since 8 September 17:00 UTC, 31 Telegram completions had zero destinations. This is consistent with policy suppression; it does not prove successful delivery of a new DGPC alert. `delivery.server.ts:323` requires official CAP data tagged `source_key=dgpc_telegram`.
- Public homepage, forecast, history, survival and sampled status/fire APIs returned 200. History renders filters and data; SOS directly renders emergency call links and explicitly says no rescue service receives or monitors the local-only record. No telephone call was initiated.

## Civil-alert readiness

ITA remains an admin evidence/interpretation surface. The current `CapInfo.category` type is Fire-only, and Telegram is deliberately DGPC-gated. Before wider civil alerts: add authorized review decisions, reviewed geographic targeting, hazard-specific publication/update/cancellation, provenance enforcement and destination-level acceptance tests. Raw archive availability supports later analysis but is not an operational authorization workflow.

## Coverage limits and open investigations

- The live Survival entry button remained on its confirmation view after automated clicks. Direct SOS navigation worked. Cause was not isolated; do not treat entry as passed or claim a diagnosed application defect. Recheck with manual interaction and browser error evidence.
- No fresh end-to-end production sends, account creation/deletion, citizen submission/moderation or device subscription changes were made. No iPhone/offline, backup restore or load test was run.
- Wind persistence error handling, partial ONM/FIRMS coverage reporting, DGPC lease expiry, and ITA retry exhaustion need targeted failure injection. They are candidates, not added to the confirmed defect count.
- Existing exhaustive QA cycle remains incomplete. Old ledger branch/merge statements are historical and must not be reused as current status.

## Recommended order

1. Repair and replay A-01/A-02, then A-03 with local role/permission tests.
2. Close personal delivery/preference behavior and offline readiness.
3. Reduce mobile payloads; fix webhook recovery and public/account promises; update dependencies/password controls.
4. Resume multi-hazard civil-alert workflow work with the above reliability foundations verified.

No findings were silently repaired during this audit. Application changes require a separate implementation pass; this report and reproduction artifacts are local only.

## Authorized repair pass — 9 September 2026

Implementation branch: `codex/platform-audit-fixes`, based on the audited release. The user subsequently authorized repair of all findings. The following fixes are verified locally and await merge/deployment; they are not claims about the deployed release.

| Finding | Repair and verification |
| --- | --- |
| A-01 / A-02 | Documents atomically queue interpretation. Transactional, lease-fenced mention application survives replay. Failed, incomplete, contradictory, unresolved, stale or future bulletins cannot reconcile absence. Historical retries preserve newer incident status/unlisting. Admins can requeue exhausted DGPC and ITA work with an audited daily cooldown. |
| A-03 | Direct authenticated audit-recorder execution revoked. Authorized operation functions retain their audit records. Role/permission tests and independent database review pass. |
| A-04 | Browser subscriptions follow authentication changes and read the saved push preference before notification. Email is explicitly unavailable. Tests cover sign-in, sign-out, account switching and a preference lookup racing sign-out. Browser QA confirms toggle/save/reload/sign-out/sign-in persistence; device permission uses a separate explicit action. |
| A-05 | Normal zone setup prepares route assets, guidance, a bounded commune outline and area points. Failed refresh keeps the previous usable pack. Four cold Survival documents rendered with the local application listener stopped; separate all-network-blocked client navigation passed. Missing GPS stays missing in SOS/check-in. No iPhone field certification is claimed. |
| A-06 | Forecast rows render when their wilaya expands. Forecast serialization excludes unused fields; homepage loads only the current horizon. Live-public-data comparison below confirms smaller initial documents and working commune search. |
| A-07 | Atomic owner-scoped webhook outbox, independently scheduled draining, fenced leases, exponential retry and durable receipts. Actual concurrent database claim/recovery tests pass. Receiver delivery is at least once; idempotency keys support deduplication. |
| A-08 | Public totals count successful delivery receipts, not alert rows or readers. Available languages come from the selector's registry; institutional/source claims corrected. Unavailable counts render as unknown. |
| A-09 | Explicit self-deletion validates the session and confirmation, removes nested owned photos, revokes sessions and deletes the account. Real local Auth API proof covers administrator deletion, profile/zone/alert cascades, preserved third-party reports and anonymized audit history. |
| A-10 | Targeted dependency overrides produce a clean `bun audit --json`. Hosted leaked-password protection was enabled through the existing Supabase CLI management credential on 9 September; a separate GET confirmed `password_hibp_enabled: true`. No plan upgrade was needed. |

Wind persistence/fetch failures, partial ONM/FIRMS results, DGPC lease loss and ITA backlog processing during an upstream outage now have failure-injection coverage. The original production Survival click's historical cause remains unknown; the reproduced blocked-storage activation failure is fixed. Wider civil-alert publication and the historical exhaustive two-cycle QA ledger remain separate milestones.

### Validation

- Frozen dependency install, TypeScript and production build pass; ESLint has zero errors (65 Fast Refresh warnings).
- Application tests: 99 files, 828 assertions pass. A separate disposable local Supabase stack applied every migration from scratch; all 35 SQL files / 722 assertions pass. Both delivery concurrency harnesses pass against that stack.
- Independent specification and quality review pass for source recovery, audit/webhook permissions, account deletion and the integrated branch. Review discovered and resolved contradictory-bulletin reconciliation, stale-evidence relisting and nested-photo deletion defects.
- Offline browser proof used the production bundle with a local-only generated CSP allowance for the fixture API. The browser tool resets network emulation on document navigation, so server-unavailable cold loading and full-network-blocked client behavior were verified separately. Production CSP source was unchanged.
- Production mutations and public notifications were not used for testing. Local fixture credentials and runtime logs are excluded from the branch.

### Initial-document budgets

Same-machine development SSR samples against the same live, anonymous public dataset (1,536 communes / six forecast horizons): forecast 12,284,992 → 3,091,869 decoded bytes, gzip 1,276,241 → 633,638; homepage 5,897,979 → 1,041,360 decoded bytes, gzip 1,206,928 → 226,171. Homepage sample time fell from 6.62s to 1.53s; forecast remained about 6.6s. These are samples, not Core Web Vitals measurements.

Regression budgets for this dataset: forecast ≤3.3 MB decoded / 700 KB gzip, homepage ≤1.2 MB / 300 KB. Recheck these with commune expansion/search and all six days visible when changing initial loaders; latency remains network- and database-dependent.


### PR #129 review follow-up

The automated review was verified against the implementation. Nine findings were addressed: owned obsolete-cache cleanup; preservation of manually selected packs; one valid summary element; removal of unsupported language-review progress; explicit completion of valid ONM CAP details without headlines; preservation of failed broadcast health; named saved-zone hints; manual check-in with explicit unknown position; and foreign-key validation in a separate migration transaction. No check-in was sent during browser verification.

The proposed array conversion in TextRecovery was rejected: the query follows the source document's foreign key to one text source. The generated relationship's `isOneToOne: false` describes non-unique child references; it does not turn the referenced parent into an array. The existing object access passes TypeScript.

Follow-up validation: 100 application files / 843 tests, TypeScript, lint (zero errors) and production build pass. Fresh CI run 34387872700 applied all six migrations and passed 36 SQL files / 729 assertions plus both delivery concurrency harnesses. CodeQL passed. Seven ONM SQL assertions cover completion without a fabricated headline and denial of client metadata changes. Specification and quality review pass again. ONM rollback, if needed after removing its caller: drop `onm_vigilance_pending_detail_idx`, then `cap_detail_fetched_at`; this removes completion metadata only.
