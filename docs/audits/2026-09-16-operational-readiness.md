# Operational readiness evidence — 16 September 2026

Executed 05:08 UTC against checkout `1e9c94b06ff795ff2107df5ff2e570568ce1f997`. Local drills passed. Production remained read-only; its public status reported one affected source. This record does not close production outage drills, device receipt verification or the exhaustive browser QA milestone.

## Isolation and inventory

Docker inspection identified `supabase_db_nadhir-weather-qa` at `127.0.0.1:54322`; PostgreSQL confirmed database `postgres` and internal port 5432. The separate local stack on 54922 was not used. No reset, migration application, production credential access or production mutation occurred.

Before committed fixture tests, the selected database had zero broadcast delivery queue rows and zero webhook outbox rows. Broadcasts and both channels were enabled. The database had existing source jobs and active source enqueue/recover/GitHub dispatch/gap-replay/retention cron entries; these were left unchanged. Database inspection found no network call references in the enqueue, claim and finish functions used by these fixtures or in `refresh_operational_incidents`. The two concurrency scripts enforce loopback hosts, refuse unrelated delivery work and perform SQL only; they do not invoke provider APIs. Application provider functions in the Vitest runs were mocked.

The SQL suites below used transaction-local fixtures and ended with `ROLLBACK`. Committed concurrency fixtures were removed and independently checked afterward. No public notification was sent by these drills.

## Executed checks

| Check | Result | What was exercised |
| --- | --- | --- |
| `source_pause_controls.test.sql` | 20/20; exit 0; rollback | Admin pause/resume, denied ordinary/operator source mutation, preserved jobs/checkpoints, idempotent audited transitions |
| `source_recovery_policy.test.sql` | 43/43; exit 0; rollback | Lease fencing, processing backoff, quarantined recovery per parser version, ITA recovery, immutable recovery evidence, public aggregate privacy |
| `source_processing_recovery.test.sql` | 27/27; exit 0; rollback | Stored processing recovery and repeat extraction deduplication |
| `delivery_queue.test.sql` | 30/30; exit 0; rollback | Failed send state, retry/backoff, completion, expiry, incident deduplication, operator acknowledgment/pause audit, incident resolution |
| `source_execution_concurrency.test.sql` | 10/10; exit 0; rollback | Source execution fencing/claim invariants; this SQL suite alone is not a simultaneous-session test |
| `broadcast_delivery_receipts.test.sql` | 11/11; exit 0; rollback | Durable delivery receipt invariants |
| Four focused Vitest files | 30/30; 4/4 files; exit 0 | Mocked source failures and execution recovery, provider retry/deduplication, webhook dispatch boundaries |
| `test-webhook-concurrency.ts` | PASS; exit 0 | Independent-session exclusive claim, expired lease recovery, stale-token rejection, 503 backoff, successful retry and durable receipt |
| `test-delivery-concurrency.ts` | PASS; exit 0 | Simultaneous FCM/Telegram completion in separate sessions without deadlock; both persisted delivered timestamps |

SQL total: **141 assertions passed, zero failed**. Each file was run with `psql -X -A -t -v ON_ERROR_STOP=1 -f`, with TAP output checked for `not ok` as well as process status. `pg_prove` was unavailable. All six files emitted `ROLLBACK`.

```sh
bun run test -- src/lib/__tests__/source-executor.test.ts src/lib/__tests__/source-health-failures.test.ts src/lib/__tests__/delivery-retries.test.ts src/lib/__tests__/webhook-outbox.test.ts
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -X -A -t -v ON_ERROR_STOP=1 -f supabase/tests/source_pause_controls.test.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -X -A -t -v ON_ERROR_STOP=1 -f supabase/tests/source_recovery_policy.test.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -X -A -t -v ON_ERROR_STOP=1 -f supabase/tests/source_processing_recovery.test.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -X -A -t -v ON_ERROR_STOP=1 -f supabase/tests/delivery_queue.test.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -X -A -t -v ON_ERROR_STOP=1 -f supabase/tests/source_execution_concurrency.test.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -X -A -t -v ON_ERROR_STOP=1 -f supabase/tests/broadcast_delivery_receipts.test.sql
DELIVERY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' bun scripts/test-webhook-concurrency.ts
DELIVERY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' bun scripts/test-delivery-concurrency.ts
```

Cleanup at 05:08:36 UTC: broadcast queue **0**, webhook outbox **0**, `webhook-%@example.invalid` fixture users **0**, authority warnings with source `concurrency-test` **0**. The delivery script additionally verified its broadcast/warning/queue fixture IDs were absent. The database was then released for other local validation.

## Production observation

`GET https://nadhir.app/api/public/v1/status` returned a generated timestamp of **2026-09-16T05:08:17.182Z**:

- Overall `affected`; affected **1**, critical affected **0**.
- `dgpc_telegram`: `degraded`; collection at **05:03:47.520Z**, pending **0**, quarantined **3**. Collection freshness does not establish successful processing of those three documents. The public endpoint cannot reveal their private failure cause.
- `ita_website`: `healthy`; collection at **05:06:01.927Z**, pending **0**, quarantined **0**, accepted **4**.
- `broadcast_delivery` and `broadcast_publish`: `healthy`, accepted **0** in the reported runs. This is not recipient receipt evidence.
- The remaining public source entries reported `healthy`.

GitHub production deployment **6474102659**, created at **04:59:36Z**, reported `success` at **05:00:18Z** for commit `1e9c94b06ff795ff2107df5ff2e570568ce1f997`, with environment URL `https://nadhir.app`. [Deployment job](https://github.com/mehdibourahla/fire-watcher-pro/actions/runs/35057639725/job/104671339289). This verifies GitHub's deployment record; the public status payload does not independently attest its running commit.

## Remaining evidence and response

## Local publication browser journey

At 05:18–05:20 UTC, a synthetic operator at `127.0.0.1:3092` reviewed an isolated ITA
fixture, explicitly selected Tizi Ouzou and published it through `/admin/sources`.
The public map displayed its source, review time, validity and administrative precision,
with the explicit media/not-official-instructions explanation. Editing the summary through
the form persisted revision 2 and appeared on a reloaded public link. Withdrawal required
confirmation and a reason, persisted terminal revision 3, removed editing controls and kept
the historical public link readable with “Publication withdrawn” and no all-clear claim.

Database readback verified three private audit rows and zero delivery queue rows. Public
JSON excluded raw evidence/review reasons. CAP changed Alert → Update → Cancel, with the
cancellation referencing both prior versions. This fixture never entered production.

## Remaining production evidence

Read-only production diagnosis at 05:21 UTC found all three DGPC documents at four attempts,
with `dgpc-extract-v2`: two unresolved place interpretations and one distribution conflict.
Their source dates are 30 August, 7 September and 10 September. Collection is functioning;
these older ambiguous interpretations need evidence/geography review. No retry budgets were reset.

The initial full local SQL run hit three count assertions because the browser fixture was
still present. After fixture cleanup, the 21 September rerun passed all 854 assertions in
39 SQL files. Both delivery and webhook concurrency harnesses passed with cleanup verified.
The mobile historical detail also passed at 390 CSS pixels without document horizontal overflow.

## Recovery and final verification — 21 September

The temporary checkout disappeared during the interruption. Its recorded patches were recovered
into a durable managed worktree; generated types were rebuilt from the local database. The
recovered branch passed 953 tests, TypeScript, the build and lint (zero errors, 66 existing
warnings). Independent final quality review passed. Fresh ordered migration replay and the
database/concurrency CI job passed on PR #138 (run `35608558581`, commit `398de665`).

Browser QA repeated publication and withdrawal, then exercised a concurrent edit: background
refresh preserved the unsaved draft; saving its old revision returned a conflict; explicit
reload adopted the other operator's revision. Local Telegram pause/resume also passed and
returned to Running. The publication audit persisted three revisions and created no delivery
jobs. Synthetic source/publication fixtures were removed before the complete SQL rerun.

Production read-only refresh at 13:54 UTC on 21 September found fresh collection and zero
pending items for both sources, with four DGPC quarantines and one ITA quarantine. The new
DGPC item failed place interpretation; ITA rejected unsupported location evidence after five
attempts. These remain bounded interpretation failures for evidence review, not grounds to
reset retries or broadcast uncertain information. No production mutations were performed.

The owner authorized the remaining operational work on 21 September. The bounded production exercise below targets ITA scheduling only. A source transport outage through the complete application pipeline remains a separate check. These drills do not prove disaster restoration, an exactly-once external delivery guarantee or recipient receipt.

[Source operations](../source-operations.md) records owner-confirmed email/private Telegram receipt on 8 September. The owner also confirmed iPhone push receipt in this task. Those historical receipts were not repeated in this drill. No new public sends or notification eligibility expansion was introduced.

## Quarantine evidence review — 21 September

Read the five original reports, persisted interpretations, geographic records and linked incidents in production. Replayed extraction locally against the configured LLM without writing its output to production. The original failed model responses are not stored; replay evidence describes current reproduction, not the exact historical completion.

| Report | Observed cause and disposition |
| --- | --- |
| ITA `57b38bfa-cd71-4efb-8730-47af45805868`, [17 September post](https://www.facebook.com/traficalg/posts/1519586020214602) | Reproduced rejection, including the corrective model call. Both location fields joined fragments, omitting `بين تيزي وزو` from the source; the purported exact span therefore does not exist. The French summary also substituted Azazga for `أدكار`. Keep quarantined; improve LLM correction and verify summary fidelity before a bounded retry. Do not weaken quote validation. |
| DGPC `6318562b-5700-49cf-a1cb-623151d7d5bb`, [7069](https://t.me/DGPCDZ/7069) | Header/distribution agree: four fires, three extinguished, one ongoing in Biskra. Replay places generic `واحة نخيل` (palm grove) in `place`; the aggregate acceptance path requires a null place. One wilaya-level mention already persisted. Keep quarantined until the model distinguishes a generic setting from a named locality. |
| DGPC `d5d94e83-00a2-4fb3-a4a9-6859474b49b2`, [6998](https://t.me/DGPCDZ/6998) | Source says `عين الفراج`; the Sétif gazetteer has `عين لقراج` / Aïn Legradj, not that spelling. A match is a hypothesis requiring corroboration, not a justified automatic alias. Keep the original report and existing wilaya-level mention. |
| DGPC `76982252-549c-4ec1-86e8-e1cea4825127`, [6872](https://t.me/DGPCDZ/6872) | Header/distribution agree on two fires. `عزيل عبد القادر` resolves to Abdelkader Azil, whose stored parent is Barika; the bulletin counts it under Batna. The geographic fallback and distribution gate therefore disagree. Existing mentions preserve Batna aggregate and Babor detail. Keep quarantined pending explicit boundary-version/source-geography handling; do not rewrite the source or move the commune silently. |
| DGPC `c58a71f8-8531-4438-afc3-f299102b42c9`, [7012](https://t.me/DGPCDZ/7012) | Source spells the commune `الصحاريج`; gazetteer uses `الصهاريج` / Saharidj, and has no alias for this report spelling. Keep quarantined until corroborated alias review; retain the existing Bouira aggregate. |

All five linked DGPC incident rows were already unlisted (3, 9, 14 and 19 September), including both incidents linked to post 6872. No current all-clear was inferred. No extraction budgets, source text, geographic records or incident lifecycle values were altered. Review is complete; correction of the five interpretations is not. These are actionable extraction/geography follow-ups, not collection outages.

## Production ITA scheduling drill — 21 September

Preflight at 14:07:49 UTC: ITA enabled, no active lease; job `679edd55-ba89-49f9-b16d-64732126245a` for 14:05 succeeded on its first attempt at 14:05:27.881 UTC. Checkpoint matched that completion, with zero consecutive failures. The existing Google session restored the owner's admin account through normal sign-in.

Paused ITA through the production admin control at 14:08:00.550062 UTC, targeting the 14:10 scheduling boundary; resume deadline 14:11 UTC. Production readback confirmed ITA disabled while DGPC and broadcast delivery remained enabled. At 14:10:33 UTC there were no ITA jobs scheduled for or after 14:10. Public status independently showed `paused` with its previous checkpoint retained.

Resumed through the same control at 14:10:39.301988 UTC (159 seconds paused). The ordinary scheduler then created job `5934b6f5-5c79-4a8e-9ce7-9f4679ea985f` for the 14:10 slot. It started at 14:11:07.117195 and succeeded at 14:11:08.277 on attempt 1. Capture `a3090cf4-b293-437b-88fa-51d134e69ad9` records a real HTTP 304 at 14:11:07.272; run `ba59a970-6881-4c86-8746-38f5c67c4124` records zero inserted, updated and rejected records. The checkpoint advanced to that completion with zero consecutive failures. This proves scheduler resumption, transport access and unchanged-feed handling, not an upstream outage or new-payload catch-up.

Audit rows `c3e05342-f86c-4278-b3c1-9eeb2e8e5958` and `3585a75a-9314-4f23-bdf3-f46e6cc9ab27` preserve pause/resume. After reviewing the ITA quarantine, acknowledged incident `94fea9dd-e83a-4143-ac65-905dc880e76f` through the operator UI at 14:09:05.529410; audit `eec8e494-e2ab-4d5d-ab00-e883b76fb1ab` persisted, and `resolved_at` remains null. DGPC was already acknowledged and was not changed.

At 14:11:42 UTC, public status reported fresh ITA collection, zero pending and one quarantined item; DGPC remained at four quarantines and zero pending. Both delivery channels were unpaused with zero pending messages. No synthetic reports or sends were introduced, no retry budgets were reset, and no source remained paused. The browser returned the ITA action to Pause and showed its quarantine incident acknowledged. The admin Health table labels collection as healthy while public status includes processing degradation; aligning those labels is a UI follow-up, not evidence that quarantine cleared.
