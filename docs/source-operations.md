# Source operations

Admin source pause/resume changes only `source_contracts.enabled`. It preserves scheduling
configuration and history. A pause stops new schedules and claims; already running work
may finish. Resuming restores eligibility for the existing scheduler and replay rules.
Every actual change is recorded in the admin audit. Operators can observe sources but
only admins can change this control.

## Automatic recovery

Database scheduling and expired-lease recovery run independently of the Worker. The
Worker bounds dispatch to 14 minutes and starts its watchdog independently of dispatch.
Interval-capable sources replay gaps within their retention window, at most three times;
paused sources and gaps with active work do not consume the replay batch. Exhausted or
expired gaps become `unrecoverable`, retaining the original failure and history.

ITA and DGPC interpretation retries are bounded. A new parser version grants one audited
recovery cycle per quarantined document. The runtime must match the configured version,
so an old deployment cannot spend the new parser's recovery cycle. An invalid extraction
stays quarantined; automatic recovery never relaxes evidence or notification eligibility.
Admin health includes interpretation failures even when collection is fresh.

The external watchdog has two triggers: database dispatch every 15 minutes and GitHub's
independent schedule. Overlapping runs are serialized. Inspect both completed workflow
runs and `cron.job_run_details`; a queued HTTP request is not proof the watchdog ran.
Provider outages, invalid credentials and genuinely ambiguous reports still require
escalation after bounded retries. The system cannot reconstruct unavailable history.

### Parser recovery release

Before deployment, check active ITA/DGPC leases and allow existing work to finish. Apply
the migrations, including the recovery function signature replacement, and deploy matching code through CI. During the schema/code
window old parsers fail closed; queued jobs remain recoverable. Verify subsequent jobs,
`source_recovery_events`, pending/quarantined counts and operational-incident resolution.
Historical repairs must retain source timestamps and remain outside fresh-alert windows.
Verify an `external-watchdog` repository-dispatch run after the next database tick.

The September 21 audit found all 16 collection-health rows fresh, no database cron
failures in the preceding 24 hours, five quarantined interpretations, and four exhausted
open replay gaps. These are pre-deployment observations, not proof of recovery. GitHub's
watchdog runs were hours apart despite its 30-minute schedule; the supplemental trigger
addresses that observed gap. No synthetic public alerts were sent during verification.

## Retention

Nothing is purged. Source runs and jobs, like the other bulk tables, move to Parquet files in
the private `cold-archive` bucket after 90 days (jobs after 92), one file per table and UTC
day, and leave Postgres only once the stored file reads back with the same rows. Runs that
resolved a gap, unfinished runs and jobs something still points at stay hot. Operational
incidents stay hot. The manifest is `cold_exports`; the design is
[the cold archive spec](superpowers/specs/2026-09-25-cold-archive.md).
Archived run idempotency keys remain in `source_run_retired_keys`: reusing one is rejected,
so removing old evidence cannot make a duplicate execution look new. Archiving and keyed
run inserts share a transaction lock to close that race.

## Release checks

1. Verify an ordinary account and an operator cannot pause a source or archive a day.
2. On a local database, pause a fixture source and confirm its queued job cannot be claimed.
   Resume twice; verify eligibility returns and only actual transitions add audit rows.
3. Seed old/recent/running/referenced evidence locally. Run `bun run archive:cold` twice and
   verify the manifest, retained references, and rejection of an old idempotency key.
4. After deployment, read the Cold archive workflow's result; never delete by hand.
   Verify source health and the Sources controls using read-only checks.

Production outage/recovery drills require a chosen source and maintenance window. Do not
pause a real detection source merely to demonstrate the button, and do not send synthetic
alerts to public subscriptions. Email receipt and private Telegram receipt were confirmed
by the owner on 2026-09-08. The owner also confirmed iPhone push receipt in the task.
Future receipt checks use the private admin device test; provider acceptance alone does
not establish receipt. Dated drill scope and limitations are recorded in the
[operational readiness evidence](audits/2026-09-16-operational-readiness.md).
