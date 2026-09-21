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

Hourly maintenance processes at most 5,000 terminal source runs and 5,000 resolved
operational incidents older than 180 days per invocation. Runs referenced by source gaps,
unfinished runs, open incidents, checkpoints and snapshot/product data remain intact.
Incident age is measured from resolution; run age from completion.

Before removal, daily UTC counts are accumulated transactionally in
`source_run_archive_daily` and `incident_archive_daily`. Run totals also preserve
`records_seen`. These aggregates are visible only to operators/admins and the service role.
Idempotency keys remain privately in `source_run_retired_keys`: reusing a retired key is
rejected, preventing removal of old evidence from making a duplicate execution look new.
Maintenance and keyed run inserts share a transaction lock to close that race.
Each nonempty maintenance batch records its counts in the admin audit.

## Release checks

1. Verify an ordinary account and an operator cannot pause a source or run maintenance.
2. On a local database, pause a fixture source and confirm its queued job cannot be claimed.
   Resume twice; verify eligibility returns and only actual transitions add audit rows.
3. Seed old/recent/running/referenced evidence locally. Run maintenance twice and verify
   exact aggregate counts, retained references, and rejection of an old idempotency key.
4. After deployment, inspect the named hourly cron and its result without purging manually.
   Verify source health and the Sources controls using read-only checks.

Production outage/recovery drills require a chosen source and maintenance window. Do not
pause a real detection source merely to demonstrate the button, and do not send synthetic
alerts to public subscriptions. Email receipt and private Telegram receipt were confirmed
by the owner on 2026-09-08. iPhone push receipt remains a user-assisted check through the
private admin device test; provider acceptance alone does not close it.
