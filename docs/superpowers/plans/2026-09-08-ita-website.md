# ITA Website Implementation Plan

> Execute this milestone with disjoint collector/extractor and persistence ownership; review schema/security independently before integration.

**Goal:** Collect ITA website reports and expose their source evidence and LLM interpretation to admins/operators.

**Architecture:** Unauthenticated conditional GET stores immutable revisions before committing its ETag. Durable pending extractions run even on 304 responses. A strict LLM contract separates occurrence, current status, location and destination; no public dissemination is connected.

**Tech Stack:** TypeScript, Zod, OpenRouter, Supabase/Postgres, TanStack Query/Router.

**Spec:** User-approved website-only investigation from 2026-09-08. Endpoint `https://infotraficalgerie.com/api/facebook/`, producer fields `id,uri,created_time,message,region,type`; `count` is not array length and array is unsorted.

## Global Constraints

- No Apify or Meta connection. Preserve DGPC-only Telegram and existing fire pipeline.
- LLM owns semantic extraction. Code owns transport, IDs, schema/evidence validation, retry and permissions.
- Source text is untrusted; no model-generated authority claims or coordinates.
- Admin/operator-only read surface; service-only ingest writes. No production changes before merge.

## Tasks

- [x] Implement bounded fetch with a real producer fixture; test 200/304, invalid records, duplicates, timeout/size limits and upstream failure.
- [x] Implement strict LLM schema with multiple incidents and evidence validation; test malformed output, unsupported quotations, status evidence, destination separation and no API key.
- [x] Add persistence, checkpoint and five-minute source job; test RLS, raw retention, retry on304, idempotence and edits.
- [x] Add admin source reports surface showing originals, extracted results, pending/errors and provenance.
- [ ] Run CI-derived gates: TypeScript, Vitest, lint, SQL tests, delivery concurrency and build; independent spec then quality/database review.
- [ ] Commit feature branch, push and open PR; report exact verification and wait for named merge approval.

## Verification

2026-09-08: TypeScript, 739 full-suite tests plus the added timeout test, lint (66 existing warnings), build and delivery concurrency passed locally. ITA SQL: 39 assertions passed. Independent specification, quality and live database reviews passed. Live endpoint smoke stored 16 revisions and extracted five; operator browser verified original links, pending state, French summaries and Arabic evidence.

Full local SQL run reached 554 assertions but source_execution.test.sql cleanup hit existing source_runs_job_id_fkey references when deleting historical jobs. Fresh-database CI remains required. No production changes.

## Operating limits

Poll every five minutes; process up to five revisions per run using OPENROUTER_API_KEY and OPENROUTER_MODEL (default google/gemini-2.5-flash). Five failed attempts leave a visible error and degraded source health; manual service intervention is needed to retry exhausted records. Website omissions and vanished posts cannot be recovered or interpreted as resolution. ITA records never create official incidents or send public alerts.
