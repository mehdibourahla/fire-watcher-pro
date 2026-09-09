# Platform audit repair plan

**Goal:** Resolve A-01 through A-10 and investigate the remaining failure candidates from the 9 September audit, with fresh behavioral evidence.
**Spec:** User approved ownership and repair of the findings in `docs/audits/2026-09-09-platform-audit.md` in the original checkout.
**Architecture:** Durable source and delivery work; authoritative permissions; explicit capability/readiness state; minimal public query payloads. Preserve evidence separately from interpretations.
**Stack:** React/TanStack, Bun, Cloudflare Workers, Supabase/Postgres.

## Global constraints

- Work from fetched `origin/main` d0b376e in isolated `codex/platform-audit-fixes`; preserve original dirty checkout.
- No public test notifications. Local fixtures/provider fakes for mutations and delivery. Production configuration changes only within the authorized security repair; no merge without approval naming the resulting PR.
- Keep Telegram restricted to official Protection Civile provenance. ITA remains interpreted evidence; this repair does not authorize community-source emergency publication.
- Retain original source payloads and run provenance for analysis. Semantic extraction remains LLM-based.
- Four locale key parity; honest unsupported capability text; no claims of rescue monitoring, safe open areas, successful device receipt, or complete offline preparation without evidence.
- Reproduce before fixing; execute original and adjacent cases; spec review before quality review for permissions/migrations and final milestone.

## Work packages

- [x] S1 DGPC continuity and source reliability: pipeline, extraction, source runners, ingestion adapters and relevant migrations/tests. Cover failed/partial extraction, durable unfinished documents, leases/timeouts, wind writes, partial FIRMS/ONM coverage, ITA backlog/retry exhaustion. Verify no unlisting on incomplete interpretation and recovery after interrupted persistence.
- [x] S2 Audit integrity and webhook recovery: revoke authenticated audit recorder access, preserve truthful operation audits; durable webhook pending/retry/receipt state and authenticated ownership. Verify role impersonation attempt denied, legitimate action once, transient send/receipt failures recover without false success.
- [x] S3 Offline readiness and Survival entry: prepare during zone setup; bounded commune pack with an offline area map and required routes/assets/guidance, readiness/error state, previous useful pack retained on failure. Verify cold offline entry and no-position Survival/SOS behavior; avoid bulk third-party tile crawling.
- [x] S4 Personal preferences and account lifecycle: auth-reactive browser notifications respecting saved push preference; explicit unavailable email capability; self-service authenticated account deletion with confirmation and local identity/ownership tests.
- [x] S5 Performance and public truth: project only needed public fields, remove excess geometry/data from initial loaders, preserve map/forecast behavior; counts from real delivery evidence and current source/language capability; update stale domain text.
- [ ] S6 Dependency/password hardening: minimally upgrade vulnerable packages, audit lockfile, enable leaked-password protection if supported without changing plan, verify actual configuration.
- [ ] S7 Integration: full CI-derived gates, local DB migrations/access checks, real browser workflows, source/delivery failure replay, independent review, durable closure ledger, clean commit/push/PR and CI.

## Decisions

Email alerts are not wired to an authorized sender; remove the misleading editable capability and show unavailability rather than silently dropping requested emails. Account deletion is implemented, not merely removed from Privacy. Offline map uses bundled commune geometry and points; no speculative bulk downloads from third-party tile services. Broader civil-alert workflow design remains the next product milestone, not a prerequisite for repairing the audited defects.

## Evidence and progress

Baseline release and audit reproduction evidence verified before dispatch. Each package appends its files, regression commands/outcomes and behavioral limits here or in a linked report. No package is closed solely because a unit suite is green.

Validation: full 828 application tests, 722 fresh-stack SQL assertions, TypeScript, lint (zero errors), production build and both concurrent delivery harnesses pass. Integrated spec and quality reviews PASS. See `docs/audits/2026-09-09-platform-audit.md` for behavioral evidence and limits. S6 hosted password configuration awaits owner dashboard login; S7 awaits PR/CI.

PR #129 follow-up: obsolete-cache/selected-pack preservation, headline-free ONM completion, truthful public progress, explicit unknown-position check-in and staged FK validation are verified. Latest application suite: 843 tests; spec and quality PASS. Hosted password setting still awaits owner sign-in; merge is not authorized yet.
