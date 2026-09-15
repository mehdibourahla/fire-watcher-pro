# Weather evidence and civil branding implementation plan

**Goal:** Add independently collected, archived 48-hour Open-Meteo forecasts and broaden platform identity without changing broadcast eligibility.
**Architecture:** Existing source jobs collect hourly weather for commune coordinates. Each validated per-commune snapshot is immutable and published atomically as one JSON payload; readers select the latest scheduled snapshot, never combine partial batches. Raw responses use the source archive. Weather UI does not depend on fire forecast availability.
**Stack:** TypeScript, Supabase/Postgres, existing source executor, TanStack React.
**Spec:** ../specs/2026-09-15-weather-civil.md (approved by owner).

## Constraints

- Model forecasts are information; instructions originate with authorities.
- Keep raw/normalized snapshots, source/time/coordinates/units and missing values for analysis.
- Existing Protection Civile-only Telegram policy remains unchanged.
- Keep fire-specific tools and survival guidance explicitly fire-specific.
- No new provider credentials or automatic model-derived emergency broadcasts.

## Tasks

- [x] Backend: add hourly response parser with contract tests using real Open-Meteo response shape. Validate array lengths, finite coordinates, unit/time conventions, 48-hour window, missing values and invalid values. Add immutable weather_snapshots with RLS and anon current-only read RPC; allow service-role writes only. Register openmeteo_weather source job with six-hour cadence, archive each batched fetch, retain completed location snapshots on partial failures and report partial coverage. API GET /api/public/v1/weather?commune=<code> returns current snapshot and freshness without requesting upstream on page visits.
- [x] UI: create independent location-selectable WeatherForecast section at /forecast, available without FWI or ONM data. Show next 48h values, forecast versus official attribution, null/stale/error states, and ONM warnings for selected commune's wilaya regardless of model state. Use the weather response contract defined in src/lib/weather-evidence.ts.
- [x] Branding: audit all platform-level strings and broaden identity in en/fr/ar/kab fallback, metadata, manifest, About, legal and contribution copy. Preserve fire tool semantics and reviewed survival advice. Update domain docs.
- [x] Verification: focused tests then full Vitest, TypeScript, ESLint, build and migration/database tests; real local backend and phone/RTL UI journeys. Independent spec, quality and applied database reviews passed. Release via reviewed feature branch; no merge without owner approval.

## Decisions

- Hourly snapshots are per commune; an incomplete location is never published, while other complete locations remain useful with source-level partial coverage. The newest scheduled snapshot wins even if an older job finishes later.
- No numeric emergency thresholds are introduced by this change. Model weather codes describe forecast conditions and are not observed lightning.
- Rainfall interval values describe the preceding hour; rain plus showers is distinguished from total precipitation.
- Collection pauses four seconds between 25-coordinate requests, limiting this collector to 375 coordinates per minute before response time. HTTP rate limits stop the run with explicit partial coverage.
- Weather reads current ONM warnings and earlier bulletins overlapping their validity window. History failures leave current warnings visible. This does not implement CAP reference-based cancellation or recursively retrieve older chains.

## Verification — 15 September 2026

- Full Vitest: 902 tests across 109 files passed. TypeScript and production build passed. ESLint: zero errors, 65 existing Fast Refresh warnings.
- Disposable Supabase database: migration chain applied; 758 pgTAP assertions across 37 files passed. Delivery and webhook concurrency suites passed with fixture cleanup.
- Two real Open-Meteo collections each stored complete 48-hour forecasts for 17 QA communes. The final capture retained 40,810 response bytes plus ordered coordinates, variables, model/time settings and parser version. This validates the pipeline on the QA sample, not nationwide forecast quality.
- Browser: Arabic at 390×844, French mobile and English desktop; selected Djelfa data loaded with fire forecasts unavailable. No page overflow. A simulated weather HTTP 503 left the local synthetic ONM warning visible. An expired earlier bulletin remained accessible under its overlapping active update using the real database query. API returned 200/48 hours for Djelfa, 400 for invalid/missing codes, and 404 for an unknown commune.
- Specification and independent quality reviews passed after correcting bulletin grouping, history retrieval, archive request metadata and pacing. Independent database review confirmed all 110 migration versions, live RLS/grants, privileged function definitions, generated types and the latest-snapshot index scan.
- Existing branded authentication email templates contain no fire-only identity text; no remote email or OAuth configuration changed. No broadcast policy changes, production migration, deployment or merge performed during implementation.
