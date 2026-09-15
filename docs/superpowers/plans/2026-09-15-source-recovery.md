# Source ingestion and recovery

Approved by the owner after the production diagnosis: retain raw captures, isolate malformed records, distinguish collection from processing health, bound retries and replay after fixes without changing public broadcast eligibility.

- [x] ITA: tolerate absent category metadata; isolate invalid posts with rejection counts; retain the old ETag until the complete feed is accepted. Fix unsupported-status extraction against actual source evidence.
- [x] DGPC: preserve valid wilaya-level evidence without inventing commune precision. Diagnose ambiguous place names against real documents and the gazetteer. Keep authority and stale-publication guards.
- [x] Recovery: exponential document retry delay; one audited exhausted-record replay per explicitly changed extractor version, fenced by the source lease. Exhausted records stay available for admin review. No unlimited resetting of attempts.
- [x] Visibility: expose safe aggregate collection freshness and queued/exhausted counts publicly; keep document bodies/errors restricted. Pending review must not prevent fresh valid items from processing. Watchdog reports quarantined backlogs with existing transition deduplication.
- [x] Verify real fixtures, recovery idempotency/lease/permissions, API and UI states, full local CI checks and independent spec/quality/database review.

Production diagnosis: Telegram and ITA HTTP 200 responses were archived on 15 September. Six DGPC documents exhausted four attempts; two ITA reports exhausted five attempts. ITA's six-post feed contained two null `type` values that failed whole-feed validation. Recovery must not fabricate an incident status or location to make health green.

Verification: 915 application tests, 801 database assertions, TypeScript, lint (existing warnings), production build, delivery and webhook concurrency checks. Spec, quality and database reviews passed. Mobile Arabic/English status and public API displayed successful collection separately from a quarantined QA document, without overflow or private diagnostics.

Live read-only probes accepted all six ITA posts and extracted both previously failing reports with the strict validator. DGPC names عين الفراج and الصحاريج remain ambiguous against the gazetteer; no aliases were invented. Initial and correction LLM calls share one 45-second deadline per ITA report.

Release: no production recovery writes performed. After merge/deployment, the next scheduled jobs receive one audited retry budget for the explicit extractor versions. Preserve recovery audit records on rollback; reverting a version does not restore its consumed budget. Merge remains an owner decision.
