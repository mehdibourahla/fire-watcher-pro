# Source Health Expand/Contract Cleanup Plan

Date: 2026-08-31
Status: required follow-up release after M1A production observation
Depends on: Data Reliability Control Plane M1A deployed database-first, then application

Observed 2026-08-31: M1A is deployed at merge commit
`9061c369e0b8a8f79144d54230033ad4f6be57c3`. Eight 10-minute contracts produced new successful
scheduled runs. `local_fwi`, `effis`, and `geo` still had no qualifying non-migration run, so the
entry gate is not satisfied and cleanup remains blocked.

## Goal

Remove the one-release compatibility shim and obsolete `data_sources` / `ingest_runs`
relations only after production proves that all deployed readers and writers use
`source_contracts`, `source_checkpoints`, `source_runs` and `source_health`.

This is a destructive production migration. Writing and verifying the migration does not
authorize applying it. Merging and deploying require fresh, explicit owner approval naming
those actions.

## Entry evidence

- Observe at least one complete expected cadence for every enabled contract in production.
  Query recent `source_runs` and prove that each contract has a new non-migration run with the
  expected trigger, outcome, timestamps and coverage fields.
- Confirm `source_checkpoints.last_attempt_at` advances from new application reports rather
  than only from the compatibility trigger. Compare each checkpoint time and contract key to
  the latest corresponding `source_runs` evidence.
- Exercise the deployed homepage, `/status`, `/api/public/v1/status`, ingest endpoint, risk
  workflow and broadcast delivery. Confirm the browser/server bundles and request logs contain
  no query of `data_sources` or `ingest_runs`.
- Confirm the deployed commit contains no runtime reference with:

  ```sh
  rg -n 'data_sources|ingest_runs' src --glob '!src/integrations/supabase/types.ts'
  ```

- Preserve evidence in the pull request: observation interval, enabled contract list, query
  output with diagnostics redacted, deployed commit, and tester.

Do not proceed if any enabled contract lacks a recent structured run, if the compatibility
trigger is still advancing a checkpoint, or if any deployed path queries an old relation.

## Migration

1. Start from a fresh `origin/main` feature branch and generate a uniquely timestamped Supabase
   migration. Re-check the migration ledger immediately before merging.
2. Add failing pgTAP assertions that the compatibility trigger/function and both old relations
   are absent, while the reliability relations, view, grants and recorder still satisfy their
   M1A contract.
3. In the migration, in this order:
   - drop the legacy trigger on `public.data_sources`;
   - drop `private.sync_legacy_source_checkpoint()`;
   - explicitly revoke any remaining privileges on `public.data_sources` and
     `public.ingest_runs` from `PUBLIC`, `anon`, `authenticated` and `service_role`;
   - drop `public.data_sources` and `public.ingest_runs`;
   - after the M2 queue and both enqueue triggers complete their own observation window, drop the
     inactive `private.nadhir_cron_call(text)` helper and `public.internal_cron_token` table.
4. Do not change or delete `source_runs` migrated history. Do not weaken RLS, view security,
   append-only grants or the recorder's execution grants.
5. Regenerate `src/integrations/supabase/types.ts` from the rebuilt local database. Prove:

   ```sh
   rg -n 'data_sources|ingest_runs' src
   ```

   returns no matches.

## Verification gates

Rebuild a disposable local Supabase stack from the full committed migration set; do not test
only by applying the last migration to an already-mutated database.

```sh
supabase db push --local
supabase test db --local supabase/tests/source_reliability.test.sql
supabase db lint --local
supabase db advisors --local
bunx tsc --noEmit
bun run test
bun run lint
bun run build
```

- Fix every cleanup-introduced database, type, test, lint or build failure.
- Review the generated production bundle for the configured Supabase project reference and
  absence of old relation names.
- Review the migration for exact targets and rollback implications. Recovery requires restoring
  the pre-cleanup schema from the prior migration and retained `source_runs` evidence; do not
  assume dropped mutable legacy rows can be reconstructed byte-for-byte.
- Run a post-deploy smoke test of ingest, status UI, public status API, risk refresh and broadcast
  delivery before considering the contract release complete.

## Approval boundary

Stop after the branch is committed and locally verified. Request fresh approval before each of:

- pushing or opening the pull request;
- merging the destructive migration;
- applying it to the linked production Supabase project;
- deploying the application release.

If production evidence changes between approval and deploy, repeat the entry checks and stop on
any old-path activity.
