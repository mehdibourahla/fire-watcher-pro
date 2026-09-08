# Source operations

Admin source pause/resume changes only `source_contracts.enabled`. It preserves scheduling
configuration and history. A pause stops new schedules and claims; already running work
may finish. Resuming restores eligibility for the existing scheduler and replay rules.
Every actual change is recorded in the admin audit. Operators can observe sources but
only admins can change this control.

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
