# Source archive implementation plan

**Goal:** Preserve fetched source data before interpretation for historical analysis and reproducible reprocessing.

**Architecture:** Private Supabase Storage holds content-addressed immutable payload objects; Postgres records each collection attempt, safe request descriptors, timestamps, response metadata and source-job/parser provenance. Existing collectors use one archive transport. Admins can inspect collection history and export manifests plus verified original payloads.

**Authorization:** User approved adding a raw-source archive and explicitly requested future analytical use. Implementation choices below preserve that scope; merge remains a separate approval.

## Contract

- Capture every inbound source response consumed by FIRMS, FCI, Sentinel-3, ONM (feed/details), Open-Meteo (risk/wind), EFFIS, DGPC Telegram previews, ITA and ensemble preview, before filtering/parsing. Include malformed/error responses and record transport failures/304 without inventing payloads. This is fetched-response coverage, not downloading linked media or entire upstream histories.
- Preserve exact response-body bytes as exposed by fetch (after HTTP decompression), media type, checksum, request time, completion time, safe request parameters, source/endpoint labels, ETag/Last-Modified. Never persist request headers, credentials, auth URLs or model API tokens.
- Deduplicate object bytes by SHA-256; retain distinct collection observations. No automatic deletion. Catalog and blob access are admin-only; service writes only. No public bucket, no alert changes.
- Run-level provenance retains source job ID/attempt/version independently of 180-day operational-run retention. Parser version is captured where available. Do not present run-level provenance as exact per-output-record lineage.
- Bound responses to 32 MiB; record truncated/failed capture and fail the source rather than silently accepting incomplete evidence. Archive upload/catalog failure must surface as ingestion failure. No recursive archiving of storage/auth/model-output/notification traffic.
- New evidence is archival from deployment onward; existing derived rows are not relabelled as raw history. No fabricated backfill.
- Provide source/time-filtered, paginated metadata export in NDJSON and original object download with checksum verification. This supplies reproducible analysis input; analytical models/dashboards are later work.

## Milestone tasks

- [x] Private bucket, catalog RLS/indexes and retention/provenance contract; SQL access tests.
- [x] Bounded archiving transport and injectable store; tests for exact bytes, duplicate payloads, 304, HTTP errors, network failures and storage failure.
- [x] Instrument all collectors and source executor context; focused coverage and runtime smoke.
- [x] Admin metadata preview and export CLI with UTC range filters and safe local output.
- [ ] CI-derived checks, independent spec then quality/database review, clean commit, PR.

## Analysis model

An observation says what bytes a source returned at a collection time. A report or detection is a later interpretation. Stable content hashes and immutable payloads allow comparing parser/model versions without confusing a new interpretation with new real-world evidence. Upstream event times remain in source payloads; collection time does not substitute for event time. Missing/failed collections remain visible in exports.

## Verification evidence

780 application tests passed; TypeScript, lint (66 existing warnings), build, 22 archive SQL assertions and delivery concurrency passed locally. Independent specification and quality/database review passed. Live ITA 200/304/200 requests produced three observations and one object; export verified all payload checksums. Workerd/Miniflare also fetched and archived 22 live posts with isolated run provenance. Browser verified operator exclusion and administrator catalog access. Fresh-database CI remains the full SQL gate.
