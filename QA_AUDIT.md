# Nadhir Behavioral QA Audit

## Audit Contract

This ledger is the durable source of truth for an exhaustive behavioral audit. A scenario passes only after execution through the real local UI or external interface. Static inspection and automated tests can explain or support evidence but cannot create a behavioral pass.

Exit gate: two consecutive complete audit cycles must produce no new reproducible critical, high, or medium defects, and every fixed finding must pass fresh behavioral replay.

## Current State

- Environment: local application + local Supabase only, plus production verification on nadhir.app for merged fixes
- Branches: `main` (F-005/F-006/F-013/F-018/F-025/F-028/F-029/F-030 merged); `codex/data-reliability-control-plane` (all other repairs, 46 commits ahead of `main`, unmerged)
- Current cycle: 1
- Clean consecutive complete cycles: 0
- Current module: cycle-1 authenticated roles, authorization, and cross-module journeys
- Next module: operator/runtime and ingestion/delivery failure journeys
- Last updated: 2026-09-01

### Where the work actually sits

Read this before starting cycle 2 — most repairs are NOT in production.

- **Merged to `main` and live** (PRs #54, #55): F-005, F-006, F-013, F-018, F-025, F-028, F-029, F-030.
- **Fixed on `codex/data-reliability-control-plane` only** — real code, not deployed, and not reachable by a production replay: F-001, F-002, F-003, F-004, F-007, F-008, F-009, F-010, F-012, F-014, F-017, F-020, F-023, F-024, F-026, F-027.
- **Repaired on that branch but still awaiting independent review**: F-015, F-016, F-019, F-021, F-022.
- **Genuinely unfixed**: F-011.

A cycle-2 replay against `main` will re-report every finding in the second and third groups, because their fixes are not there.

## Safety and Environment

- `.env.local` points to the live Supabase project. Never launch the QA server from it without explicit process-level overrides for `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- The local Supabase development stack is running on `127.0.0.1`; use only local accounts and `qa_`-prefixed recoverable fixtures.
- Leave provider delivery credentials empty during QA so Firebase and Telegram cannot send.
- Do not call production (`https://nadhir.app` or its Supabase project), deploy, push, merge, or mutate external systems.
- Preserve pre-existing user work: untracked `data/telegram-channels.json`.

## Audience and Role Inventory

| Audience / role | Access model | Primary surfaces |
| --- | --- | --- |
| Anonymous public visitor | no account | map, fire detail, forecast, history, source status, contribute, survival, legal/about, public API |
| Accountless subscriber | browser push token + commune/language, no identity | subscribe sheet, broadcast banner, `/api/public/v1/subscribe` |
| Authenticated user | Supabase account + owned rows | zones, alerts, settings, webhooks, reports |
| Moderator | authenticated + `moderator` role | report, idea, and translation moderation; cluster resolution |
| Admin | authenticated + `admin` role | all moderator paths, team/roles, broadcast operations and audit |
| API consumer | anonymous HTTP client | fires, risk, stats, status, sources |
| Scheduler/operator | shared cron credential or trusted job environment | ingest, alerts, risk endpoints and source reliability ledger |
| Authority stakeholder | recipient/consumer, not a distinct app login role | attributed warnings, CAP/webhook output, fire and risk detail |

## Module and Interface Inventory

| ID | Module | Routes / interfaces | Important state and cross-module behavior |
| --- | --- | --- | --- |
| M01 | Live fire map | `/`, map controls, detection layers, broadcast banner | loading/empty/error, map worker/assets, cluster selection, accountless subscription, Survival offer |
| M02 | Fire detail | `/fire/:id` | active/monitoring/controlled/expired/false-positive states, detections/events/wind/settlements, missing id |
| M03 | Forecast | `/forecast` | commune search, six-day risk, EFFIS/ONM comparison, fuel-limited and stale/partial data |
| M04 | History | `/history` | season/wilaya filters, unmatched clusters, chart/CSV export, empty data |
| M05 | Source status | `/status`, `/api/public/v1/status` | public sanitized source-health projection, stale/degraded/backfilling/paused states |
| M06 | Public content | `/about`, `/developers`, `/privacy`, `/terms`, 404/error page | legal accuracy, metadata, navigation, i18n, responsive/accessibility |
| M07 | Contribute | `/contribute`, idea/vote APIs | live deficits, idea create/vote, duplicate vote, rate limits, moderation visibility |
| M08 | Translation contribution | `/contribute/language/:locale`, translation/history APIs | locale validation, bulk suggestions, identity cookie, moderation lifecycle |
| M09 | Survival Mode | `/survival`, `/survival/sos`, `/survival/checkin`, `/survival/areas`, service worker | user entry, zero-fresh-data usefulness, SOS honesty, position, native compose, offline pack, hazard/all-clear asymmetry |
| M10 | Authentication | `/auth`, protected layout | sign-up/confirmation/sign-in/sign-out, session refresh, protected redirects, auth errors |
| M11 | Zones | `/zones` | owned CRUD, 10-zone cap, pause/resume/delete, fire proximity, cross-user isolation |
| M12 | Personal alerts | `/alerts`, alert check server function | read/unread, mark all, dedup, zone/risk/fire fan-out, refresh/session persistence |
| M13 | Settings | `/settings` | profile, locale, phone, channels, quiet hours, validation and persistence |
| M14 | Webhooks | `/webhooks`, dispatch integration | owned CRUD, signing secret, active toggle, delivery history/retry/error |
| M15 | Citizen reports | `/report`, storage | geolocation/photo validation, EXIF removal, owned deletion, approved public display |
| M16 | Moderation | `/moderation` | report/idea/translation approve/reject, cluster false-positive, repeated/terminal actions |
| M17 | Team and roles | `/team` | admin-only enumeration and grant/revoke, self-role and cross-role behavior |
| M18 | Broadcast admin | `/broadcasts` | kill switch, authority warning relay, append-only audit, admin-only access |
| M19 | Public API | `/api/public/v1/`, `/fires`, `/risk`, `/stats`, `/sources` | methods, validation, pagination/filters/GeoJSON, rate limits, CORS/content types, sanitized errors |
| M20 | Cron/job API | `/api/public/cron/ingest`, `/alerts`, `/risk` | auth, duplicate/concurrent execution, idempotency, partial failure, structured outcomes |
| M21 | Detection ingestion/fusion | FIRMS, FCI, persistent-source screen, fusion pipeline | credential/upstream/schema failure, dedup, cluster FSM, cross-border placement, source runs |
| M22 | Weather/risk/authority ingestion | Open-Meteo, EFFIS, ONM, FWI state | daily advancement, partial quota, fallback, freshness, no danger-driven Survival entry |
| M23 | Alert/broadcast delivery | alert engine, CAP, FCM, Telegram, webhooks | initial/update/end, references, rate limit, kill switch, accountless versus personal targeting, provider failure |
| M24 | Internationalization/theme/chrome | ar/fr/en/kab, RTL/LTR, theme, header/footer/bottom tabs | instant switch, persistence, SSR hydration, route parity, mobile/desktop keyboard behavior |
| M25 | Database authorization | Data API, RLS, storage policies, privileged functions | anon/user A/user B/moderator/admin action parity, cross-account isolation, service-only tables/functions |

## Coverage Matrix

Status values: `PENDING`, `PASS`, `FINDING`, `BLOCKED`. Each cycle cell must link to evidence in the cycle log.

| Module | Cycle 1 | Cycle 2 | Cycle 3+ |
| --- | --- | --- | --- |
| M01 Live fire map | PASS (F-006 merged; F-012 fixed on branch) | PENDING | — |
| M02 Fire detail | PASS (F-028 merged) | PENDING | — |
| M03 Forecast | FINDING (F-025 merged; F-006 merged; F-022 awaiting review) | PENDING | — |
| M04 History | PASS (F-006 merged) | PENDING | — |
| M05 Source status | PASS (F-006 merged) | PENDING | — |
| M06 Public content | PASS (F-005/F-029 merged) | PENDING | — |
| M07 Contribute | PASS (F-008/F-023/F-027 fixed/replayed) | PENDING | — |
| M08 Translation contribution | PASS (F-008/F-023 fixed/replayed) | PENDING | — |
| M09 Survival Mode | PASS (F-013 merged; F-010 fixed on branch) | PENDING | — |
| M10 Authentication | FINDING (F-018/F-030 merged; F-011 OPEN — only unfixed finding) | PENDING | — |
| M11 Zones | PASS (F-009 fixed/replayed) | PENDING | — |
| M12 Personal alerts | PASS | PENDING | — |
| M13 Settings | FINDING (F-019 awaiting review) | PENDING | — |
| M14 Webhooks | FINDING (F-017 fixed/replayed; F-021 open) | PENDING | — |
| M15 Citizen reports | FINDING (F-010/F-020/F-024/F-026 fixed on branch, unmerged) | PENDING | — |
| M16 Moderation | FINDING (F-020/F-023/F-026 fixed on branch, unmerged) | PENDING | — |
| M17 Team and roles | PASS (F-014 fixed/replayed) | PENDING | — |
| M18 Broadcast admin | FINDING (F-015/F-016 awaiting review) | PENDING | — |
| M19 Public API | FINDING (F-001/F-002/F-012 fixed/replayed) | PENDING | — |
| M20 Cron/job API | FINDING (F-007 fixed/replayed) | PENDING | — |
| M21 Detection ingestion/fusion | PENDING | PENDING | — |
| M22 Weather/risk/authority ingestion | FINDING (F-022 awaiting review) | PENDING | — |
| M23 Alert/broadcast delivery | FINDING (F-016/F-017 fixed; F-019/F-021/F-022 open) | PENDING | — |
| M24 Internationalization/theme/chrome | FINDING (F-004 branch; F-005/F-006/F-018/F-029/F-030 merged; F-011 OPEN; F-026 branch) | PENDING | — |
| M25 Database authorization | FINDING (F-009/F-010/F-023/F-027 fixed/replayed; F-019/F-020/F-024 open) | PENDING | — |

## Findings

### F-001 — read-only public API accepts unsupported methods as HTML app-shell success

- Severity: Medium
- Status: Fixed and behaviorally replayed
- Role / module / environment: anonymous API consumer; M19 Public API; isolated local app at `127.0.0.1:8080`
- Exact reproduction: send `POST`, `PUT`, or `DELETE` to each of `/api/public/v1/`, `/fires`, `/risk`, `/stats`, `/status`, and `/sources`.
- Expected: a stable API error, HTTP 405, JSON content type, an `Allow` header, and the public API CORS/cache contract.
- Observed before fix: HTTP 200 `text/html` and the application shell (about 12.5 KB) for read-only data routes; the API index also fell through instead of rejecting the method.
- Impact: callers, monitoring, and intermediaries can misclassify invalid writes as successful API operations; the response format also violates the documented JSON boundary.
- Evidence: direct HTTP matrix against all six local routes; TanStack Start route dispatch inspection confirmed that an `ANY` handler is the supported unified fallback.
- Fix: commit `be4c5ad` adds a shared JSON `methodNotAllowed` response and `ANY` handlers to all six read-only routes, with a regression test.
- Fresh replay: all six routes now return 405, `application/json`, `Allow: GET, HEAD, OPTIONS`, and `{"error":"method not allowed"}` for `POST`.

### F-002 — the advertised public API rate limit is permanently fail-open

- Severity: Medium
- Status: Fixed and behaviorally replayed
- Role / module / environment: anonymous API consumer and operator; M19 Public API / M25 privileged database function boundary; isolated local app and local Supabase
- Exact reproduction: issue 62 sequential `GET /api/public/v1/status` requests with the same fresh `cf-connecting-ip`; then call `consume_rate_limit` with the publishable key to inspect the failure path.
- Expected: the 61st request inside the one-minute bucket returns HTTP 429 with `Retry-After: 60`; the service-only limiter RPC remains inaccessible to anonymous clients.
- Observed: all 62 requests returned 200. The publishable-key RPC returns Postgres 42501 (`permission denied for function consume_rate_limit`). `enforceRateLimit` invokes this service-only function through `publicSupabase()` and deliberately fails open on every request.
- Impact: the promised 60 requests/minute abuse control cannot activate, allowing unbounded anonymous API traffic and avoidable database load.
- Evidence: direct HTTP sequence, direct local Data API RPC response, migration grants, and server call-site inspection. Contribution and translation paths already use the server-only admin client for the same function.
- Fix: commit `230b111` moves the limiter call to the existing server-only admin client and adds a regression test that asserts the RPC bucket/limit/window and 429 contract.
- Fresh replay: with a new IP bucket, requests 1–60 returned 200 and requests 61–62 returned 429 with `Retry-After: 60`; a direct publishable-key RPC call still returned 401/42501, preserving the privilege boundary.

### F-003 — the documented package preview command cannot serve a successful build

- Severity: Medium
- Status: Fixed and behaviorally replayed
- Role / module / environment: developer/operator; build/preview delivery boundary; isolated local build
- Exact reproduction: run `bun run build`, then `bun run preview -- --host 127.0.0.1 --port 8081`, then request `/` or `/api/public/v1/fires`.
- Expected: the package's preview command serves the freshly generated production output so UI and API smoke tests can run against it.
- Observed: the preview process starts, but every tested request returns HTTP 500 with `ERR_MODULE_NOT_FOUND` for `dist/server/server.js`; this build emits Nitro output under `.output`.
- Impact: maintainers cannot use the advertised command to validate the production artifact, so runtime-only defects can escape the local release gate.
- Evidence: successful local build followed immediately by failed UI and API requests and the preview server stack trace. The generated `.output/nitro.json` explicitly declares `npx wrangler --cwd ./ dev` as its preview command and `.output/server/wrangler.json` points to `index.mjs`; a direct current Wrangler 4.127.1 replay served `/about` and `/developers` as 200 and an unknown route as 404 from that same artifact. Wrangler 4.93.1 was too old for the generated `2026-08-28` compatibility date, so the project must carry a current compatible local version rather than relying on an ambient runner.
- Fix: commit `7364809` replaces Vite's legacy preview with Nitro's generated-artifact preview and pins the verified compatible Wrangler 4.127.1 as a local development dependency.
- Fresh replay: after a new successful build, the exact package command `bun run preview -- --host 127.0.0.1 --port 8081` started Nitro/Wrangler; `/about` and `/developers` returned 200 and a fresh unknown route returned 404. The owned preview process was then terminated and the port was free.

### F-004 — server/client drift causes recurring hydration errors and live-map regeneration

- Severity: Medium
- Status: Fixed and behaviorally replayed
- Role / module / environment: all public visitors; M01 Live fire map / M24 theme and chrome; isolated local app in desktop and mobile in-app browser
- Exact reproduction: set the browser to system dark mode, perform fresh full navigations across public routes, and inspect the console; on `/`, repeat near a relative-time minute boundary.
- Expected: server markup hydrates without errors; the pre-paint theme and relative timestamps remain stable through initial hydration.
- Observed: 20 full public navigations logged `<html class>` mismatches because the boot script added `dark` before React expected it. On `/`, the server rendered `Last satellite pass 28 minutes ago` while the client rendered `29 minutes ago`, producing a full hydration failure and client tree regeneration.
- Impact: avoidable client regeneration, visible flicker/performance risk, noisy production diagnostics, and potential focus/assistive-technology disruption on the primary emergency-facing surface.
- Evidence: browser console, development server console, desktop/mobile route sweep, and call-site diagnosis (`Date.now()` during both SSR and client hydration).
- Fix: commit `114e634` marks only the intentional pre-paint root theme attribute as hydration-controlled, makes the relative-time formatter accept an explicit clock, and anchors every live-map relative time to the serialized route-loader timestamp before refreshing after mount.
- Fresh replay: new full navigations to `/about` and `/` rendered the expected page content in system dark mode; the browser/development console produced no hydration attribute error or text mismatch after the fix.

### F-005 — unknown routes have no document title and bypass localization

- Severity: Low
- Status: Fixed, merged to `main` in 72d0eff (#54), and verified on nadhir.app
- Role / module / environment: anonymous visitor; M06 public content/error boundary; isolated local desktop and mobile browser
- Exact reproduction: navigate directly to `/qa-unknown-route-cycle1` and inspect the visible 404 plus `document.title`; then select Arabic and navigate to a fresh unknown route.
- Expected: a localized descriptive title such as `Page not found — Nadhir` accompanies localized 404 copy and the home link in each supported locale.
- Observed: the 404 page and HTTP status are correct and usable, but `document.title` is empty. In an otherwise Arabic/RTL shell, all not-found content remains hard-coded English (`Page not found`, explanation, and `Go home`).
- Impact: weaker browser-history, tab, and screen-reader orientation on error pages, plus a conspicuous untranslated dead end for Arabic, French, and Kabyle users.

### F-006 — English count labels use plural grammar for singular fires and communes

- Severity: Low
- Status: Fixed, merged to `main` in 72d0eff (#54), and verified on nadhir.app
- Role / module / environment: English anonymous visitor; M01 Live map / M03 Forecast / M04 History / M24 internationalization; isolated local desktop and mobile browser
- Exact reproduction: switch to English; on `/forecast`, inspect a wilaya card with exactly one covered commune; on `/`, inspect a wilaya group containing exactly one fire; on `/history`, inspect any one-fire wilaya row and the unmatched-fire summary; on `/status`, inspect the affected-source summary.
- Expected: `1 commune`, `1 fire`, and normal singular/plural grammar in summaries.
- Observed: `1 communes`, `1 fires`, history rows such as `1 Fires`, and summaries such as `6 fire(s)` / `10 data source(s) affected`. The translations interpolate numbers into fixed plural or placeholder strings rather than defining i18next singular/plural variants.
- Impact: visible localization defects repeat across the primary map, forecast, history, and source-status surfaces.

### F-007 — cron endpoints return HTML success for unsupported methods

- Severity: Medium
- Status: Fixed and behaviorally replayed
- Role / module / environment: unauthenticated caller and scheduler/operator; M20 Cron/job API; isolated local app
- Exact reproduction: send `GET`, `PUT`, or `DELETE` to each of `/api/public/cron/ingest`, `/alerts`, and `/risk`.
- Expected: only authenticated `POST` is allowed; unsupported methods return HTTP 405 with a stable machine-readable error and `Allow: POST` without running the job.
- Observed: all nine requests returned HTTP 200 `text/html` with the full application shell. The job did not execute, but the interface reported success in the wrong protocol and representation.
- Impact: schedulers, probes, and incident tooling can mistake invalid job invocations for success, obscuring integration/configuration mistakes on safety-critical pipelines.
- Evidence: direct local HTTP method matrix. Missing, malformed, wrong, and comma-suffixed bearer tokens on the real `POST` handler correctly returned 401 and did not execute.
- Fix: commit `e40ec60` adds a small shared POST-only 405 helper plus `ANY` fallbacks on every cron endpoint.
- Fresh replay: `GET`, `PUT`, and `DELETE` on all three endpoints returned JSON 405 with `Allow: POST`; unauthenticated `POST` still returned 401.

### F-008 — contribution endpoints return HTML success for unsupported methods

- Severity: Medium
- Status: Fixed and behaviorally replayed
- Role / module / environment: anonymous contributor/API caller; M07 Contribute / M08 Translation contribution; isolated local app
- Exact reproduction: send `GET`, `PUT`, or `DELETE` to `/api/public/contribute/idea`, `/vote`, `/translation`, and `/my-translations`.
- Expected: these POST-only endpoints return HTTP 405 with a stable machine-readable error and `Allow: POST` without reading or changing contribution state.
- Observed: all twelve requests returned HTTP 200 `text/html` with the application shell.
- Impact: clients and monitoring can mistake invalid contribution calls for success, making integration errors difficult to distinguish from accepted submissions.
- Evidence: direct local HTTP method matrix; malformed and boundary-valid POST behavior was separately exercised and returned structured JSON.
- Fix: commit `e40ec60` applies the same POST-only JSON 405 contract to all four contribution endpoints without changing their POST handlers.
- Fresh replay: all twelve unsupported-method combinations returned JSON 405 with `Allow: POST`; malformed JSON POSTs retained their prior structured 400 responses.

### F-009 — watch-zone integrity and the 10-zone limit exist only in the UI

- Severity: Medium
- Status: Fixed and behaviorally replayed
- Role / module / environment: authenticated user/adversarial client; M11 Zones / M25 Database authorization; isolated local Data API
- Exact reproduction: authenticate as an ordinary user and insert directly into `zones` with an empty name, latitude 999, longitude -999, radius -10, and danger level 99; separately issue 11 valid inserts concurrently for a user with no zones.
- Expected: server-side constraints reject impossible coordinates/radius/level/empty names, and the documented maximum of 10 zones holds under direct and concurrent calls.
- Observed: the impossible row was accepted exactly as sent. All 11 concurrent valid inserts succeeded, leaving the user with 11 zones. The table has only primary/foreign-key constraints; the limit is a client-side count check.
- Impact: malformed or racing clients can create unusable alert geometry and exceed a paid/operational business limit, causing inaccurate proximity/risk evaluation and unbounded per-user work.
- Evidence: authenticated local Data API inserts, subsequent owner-visible counts, and `pg_constraint` inspection. Cross-user read/update/insert attacks were correctly blocked by RLS.
- Fix: commits `ead94c0`, `d8c3090`, and `730a148` add named database constraints plus a per-user transaction advisory lock and insert trigger for the 10-zone limit; trigger execution remains unavailable to Data API roles. The final correction rejects spaces, tabs, newlines, and Unicode whitespace-only names.
- Fresh replay: invalid boundaries now return SQLSTATE 23514; a simultaneous 11-insert replay produced exactly 10 successes and one rejection. Owner/cross-owner/moderator/admin RLS parity remained unchanged.

### F-010 — unmoderated public hazard reports accept impossible safety data

- Severity: High
- Status: Fixed and behaviorally replayed
- Role / module / environment: authenticated reporter and anonymous Survival user; M09 Survival / M15 Citizen reports / M25 Database authorization; isolated local Data API
- Exact reproduction: authenticate as an ordinary user and insert a pending `road_blocked` report with latitude 999, longitude -999, an observation in 2099, and an invalid size label; read the safe public `hazard_reports` view anonymously.
- Expected: database/server validation rejects impossible coordinates, future observation times, and values outside the published report enums before any unmoderated hazard becomes public.
- Observed: the row was accepted and immediately visible to anonymous callers through `hazard_reports` with the impossible coordinates and future timestamp. `citizen_reports` constrains only `kind`; it does not constrain latitude, longitude, sighting, size, or observation time.
- Impact: an authenticated actor can inject invalid, unmoderated road/person hazards into the public Survival data path, risking false or broken emergency guidance. The existing per-user daily limiter reduces volume but does not validate truth or geometry.
- Evidence: authenticated insert followed by anonymous safe-view read of the exact invalid row; fixture was deleted immediately after capture.
- Fix: commits `ead94c0` and corrective `d8c3090` constrain coordinates, sighting/size/status enums, and future observation skew; serialize the three-per-24-hour decision with a separate per-user advisory-lock namespace; and make `created_at` server-authoritative and immutable so insert/update backdating cannot bypass the quota without rewriting an independently supplied `updated_at` on insert.
- Fresh replay: all invalid report fields now return SQLSTATE 23514; four concurrent valid inserts produced exactly three successes and one rejection; supplied historical creation times were overwritten on insert and preserved on update. The anonymous safe view and owner/moderator/admin RLS behavior remained intact.

### F-011 — signed-out protected-route redirects hydrate two different route trees

- Severity: Medium
- Status: Reproduced; not yet fixed
- Role / module / environment: signed-out visitor; M10 Authentication / M24 shared chrome; isolated local browser and development server
- Exact reproduction: in a fresh signed-out browser tab, navigate directly to `/zones`, wait for the client-side redirect to `/auth`, and inspect the browser/development console.
- Expected: the protected route redirects to the sign-in page before initial markup is committed, or otherwise hydrates a stable route tree without React diagnostics.
- Observed: the visible redirect succeeds, but the server markup still marks `My zones` active and contains the client-only protected-route fallback while the browser hydrates `/auth`. React reports a root attribute mismatch, a full hydration failure/tree regeneration, and a state update on a component that has not mounted. A fresh direct `/auth` navigation does not reproduce the errors.
- Impact: every first protected-route visit by a signed-out user pays for avoidable tree regeneration and emits misleading production diagnostics; the unstable first paint can disrupt focus and assistive-technology orientation on the authentication boundary.
- Evidence: fresh `/zones` navigation ending at `/auth`, followed by new console output that identifies the active-link mismatch and `AuthPage` versus protected-route `Suspense` mismatch; a control navigation directly to `/auth` was clean.

### F-012 — the accountless push-subscription endpoint accepts unsupported methods as HTML success

- Severity: Medium
- Status: Fixed and behaviorally replayed
- Role / module / environment: accountless subscriber/API caller; M01 Live map / M19 Public API; isolated local app
- Exact reproduction: send `GET`, `PUT`, or `DELETE` to `/api/public/v1/subscribe`.
- Expected: the POST-only interface rejects unsupported methods with HTTP 405, JSON content type, `Allow: POST`, and the public API CORS contract.
- Observed: all three methods returned HTTP 200 `text/html` with the 12.5 KB application shell.
- Impact: push clients, probes, and integration tooling can misclassify invalid subscription operations as success, hiding broken HTTP integrations at the accountless alert boundary.
- Evidence: direct three-method matrix against the real local route; a source inventory confirmed this was the only remaining API route without the shared `ANY` fallback.
- Fix: commits `832ee76` and `b4f51b1` add the POST-only `ANY` fallback, endpoint-specific preflight, and POST-aware JSON/rate-limit CORS helpers without changing read-only endpoints.
- Fresh replay: GET/PUT/DELETE/PATCH/HEAD returned JSON 405 with `Allow: POST, OPTIONS`; the production Worker preflight returned 204 advertising only `POST, OPTIONS`; provider-disabled POST remained structured 503 and also advertised POST. Spec and engineering-quality rereviews passed; no FCM/provider path ran.

### F-013 — Survival entry always claims GPS/offline-pack work is in progress

- Severity: Medium
- Status: Fixed, merged to `main` in 72d0eff (#54), and verified on nadhir.app
- Role / module / environment: anonymous emergency user; M09 Survival Mode; isolated local browser
- Exact reproduction: open `/survival` with no existing active-mode flag, leave the geolocation permission prompt unanswered for more than 45 seconds, and inspect the entry sheet. The same copy path is used regardless of denied, acquired, saved-pack, or unavailable state.
- Expected: the sheet truthfully distinguishes acquiring permission, unavailable/denied location, a saved offline pack, and a still-unsaved pack while keeping emergency entry available.
- Observed: the sheet continuously says `Getting your GPS position · saving your offline pack…`. It never reads the actual position, denial, or saved-pack state, so the claim can remain indefinitely false even though the entry button stays usable.
- Impact: an emergency-facing surface tells users that location and offline preparation are happening without proving either outcome, weakening trust and leaving them unable to tell whether offline data is ready.
- Evidence: live browser replay at initial load and after an additional 20-second wait (over 45 seconds total), plus component-state inspection showing the entry sheet receives only `onEnter` and renders unconditional status text.

### F-014 — the sole administrator can revoke their own last admin role

- Severity: High
- Status: Fixed and behaviorally replayed
- Role / module / environment: administrator; M17 Team and roles / control plane; isolated local browser and database
- Exact reproduction: sign in as the only admin, open `/team`, and click the immediately available `Remove admin` action on the current admin's own row.
- Expected: the platform prevents revoking the final administrator (and preferably requires an explicit confirmation for any self-revocation), preserving at least one recoverable control-plane identity.
- Observed: one click deleted the role. The page immediately changed to `This page is reserved for Nadhir administrators`, and a direct database count confirmed zero admin roles remained.
- Impact: a routine role-management mistake can lock every operator out of role management, broadcasts, and other admin-only safety controls; recovery requires privileged database/service intervention outside the product.
- Evidence and recovery: live admin UI replay plus `user_roles` count 0 after the click. The exact local admin role was restored immediately through the isolated database, returning the admin count to 1; no lasting role mutation remains.
- Fix: commits `1ecedde`, `dce6b5e`, and `71ada11` add a database trigger serialized by the exact role-invariant advisory key, remove direct UPDATE/TRUNCATE bypasses, use an uncapped exact admin-role count in the UI, disable/explain sole-admin self-removal in all locales, propagate membership-query failures, and add an interruption-safe contention harness.
- Fresh replay: with one local admin, `/team` rendered the self-removal control disabled with a localized explanation and the database count remained one. The true concurrent authenticated-delete harness proved both sessions blocked on the production lock, then exactly one committed and one returned `last_admin_required`; five repeated runs, forced interruption, 18/18 pgTAP, specification/quality/database reviews, and a fresh fully ordered migration stack all passed with exact state restoration and zero fixtures.

### F-015 — broadcast kill-switch changes are absent from the admin audit log

- Severity: Medium
- Status: Reproduced; not yet fixed
- Role / module / environment: administrator/operator; M18 Broadcast admin; isolated local browser and database
- Exact reproduction: as admin, open `/broadcasts`, click `Stop broadcasting`, observe the OFF state and audit log, then click `Resume broadcasting` and inspect the audit log again.
- Expected: each safety-critical kill-switch transition is appended immediately with actor, old/new state, and time so operators can reconstruct who stopped or resumed delivery.
- Observed: OFF and ON mutations both succeeded, but the audit log stayed `No broadcast decisions recorded yet`. The UI updates `broadcast_settings` directly; no audit row or actor field is written. A later publisher run may record a generic `suppressed / kill_switch` decision while OFF, but resumption and the administrator responsible for either transition are never recorded.
- Impact: the most consequential broadcast control can change without an attributable, append-only record, weakening incident reconstruction and accountability.
- Evidence and recovery: live OFF→ON UI replay plus implementation/schema inspection. Broadcasting was restored to ON immediately after the test; the local operational state is normal.
- Repair status: commit `4a69971` replaces the direct update with an admin-only atomic RPC, records the exact authenticated actor for every real transition, suppresses no-op audit noise, revokes client table mutation, refreshes settings plus audit in the UI, and renders actor attribution. Fresh Arabic UI replay showed distinct OFF/ON audit actions and left broadcasting ON. Specification review passed, but quality review reproduced service-role audit forgery and stale/unknown UI state. Commits `b6fb07b` and `1dacc41` add action/actor invariants, column-scoped publisher grants, an authoritative RPC result cached before refresh, and fail-closed unavailable/error UI. The corrected control replayed OFF→ON and remains open pending fresh reviews.

### F-016 — authority relay accepts a blank, unattributed emergency warning

- Severity: High
- Status: Reproduced; not yet fixed
- Role / module / environment: administrator/authority stakeholder; M18 Broadcast admin / M23 delivery; isolated local browser and database
- Exact reproduction: in `/broadcasts`, enter spaces in both `Authority (shown to the public)` and `Warning text (verbatim)`, choose a wilaya, and submit `Relay warning`.
- Expected: trimmed authority and warning text must both be nonblank at the server/database boundary; invalid input stays in the form with a clear error and creates no relay candidate.
- Observed: native `required` accepted the whitespace, the mutation trimmed both values to empty strings, and the database accepted the row. The console then showed a contentless queued warning (`this minute · queued`).
- Impact: the next pipeline run can turn a blank, unattributed row into a public Severe/Extreme emergency broadcast, directly contradicting the promised verbatim attribution and degrading safety communications.
- Evidence and recovery: live UI submit plus exact local database row with empty `source` and `body`. The disposable row was deleted immediately before any pipeline run; no broadcast or delivery row was created.
- Repair status: commit `4a69971` adds database and client validation for blank POSIX/Unicode-whitespace authority and verbatim text, derives `created_by` from the exact authenticated admin, prevents spoofing, and localizes safe UI errors. Fresh Arabic UI replay rejected spaces plus Unicode EM spaces and a direct database count remained zero. Independent specification review passed; engineering-quality and database reviews remain pending.

### F-017 — webhook URL validation permits DNS-based SSRF into loopback/private networks

- Severity: High
- Status: Fixed and behaviorally replayed; specification, engineering-quality, and Cloudflare configuration reviews passed
- Role / module / environment: authenticated webhook owner and server operator; M14 Webhooks / M23 delivery; isolated local runtime
- Exact reproduction: evaluate the actual delivery validator with `https://127.0.0.1.nip.io/hook`, then resolve the accepted hostname through the host resolver.
- Expected: every outbound webhook target is resolved before connection and rejected when any address is loopback, private, link-local, multicast, or otherwise non-public; redirects are revalidated under the same rule.
- Observed: `isDeliverableUrl("https://127.0.0.1.nip.io/hook")` returns `true`, while DNS resolves that hostname to `127.0.0.1`. Delivery then passes the unchecked hostname to `fetch`, which also follows redirects by default. The validator checks only literal IP syntax and hostname suffixes, not resolved addresses or redirect destinations.
- Impact: an authenticated user can make the server issue signed outbound requests toward services reachable only from the worker/runtime network, exposing an SSRF primitive against loopback, private, link-local, or redirect-selected targets.
- Evidence: direct execution of the production validator returned `true`; `node:dns.lookup(..., { all: true })` returned `127.0.0.1` for the same accepted hostname. No webhook was sent and no external or production state was mutated.
- Fix: commits `7c973f3` and `04b30f4` resolve A/AAAA records before every send, require every answer to be globally reachable under longest-prefix IANA special-purpose classification, reject DNS failures and mixed public/private answers, disable automatic redirects, and add Cloudflare's generated `global_fetch_strictly_public` compatibility flag as runtime defense in depth.
- Fresh replay: the original `nip.io` loopback alias and reserved IPv6 probes are rejected before fetch; public IPv4/IPv6 and IANA globally reachable exceptions remain accepted; a 3xx is recorded as failure and is not followed. Focused tests pass 12/12 and the full suite passes 300/300. The remaining validation-to-fetch DNS race is blocked from private destinations in the supported Cloudflare Workers deployment; Node preview remains explicitly local-only.

### F-018 — authentication exposes raw backend failures instead of a localized service error

- Severity: Low
- Status: Fixed, merged to `main` in 72d0eff (#54), and verified on nadhir.app
- Role / module / environment: signed-out visitor; M10 Authentication / M24 internationalization; isolated local browser during a local database outage
- Exact reproduction: while the isolated database is not accepting connections, submit otherwise valid local admin credentials through `/auth` and inspect the form error.
- Expected: a stable localized message explains that sign-in is temporarily unavailable and invites a retry, while known credential/validation failures use their own localized copy.
- Observed: the form printed the Supabase/runtime exception verbatim: `name resolution failed`. The catch path renders every thrown `err.message` directly, so low-level transport wording and English-only provider messages bypass the product's error and localization contract.
- Impact: users cannot tell a temporary platform outage from bad credentials, non-English users receive an untranslated infrastructure message, and future backend diagnostics could expose unnecessary implementation detail.
- Evidence: real UI submission during the isolated database failure plus the rendered form snapshot; no production service or account was touched.

### F-019 — invalid profile alert settings can silently suppress risk notifications

- Severity: Medium
- Status: Reproduced; not yet fixed
- Role / module / environment: authenticated user; M13 Settings / M23 Alert delivery / M25 database integrity; isolated local authenticated database role
- Exact reproduction: as user A under the actual `authenticated` PostgreSQL role and JWT claims, update the owned profile to `locale='not-a-locale'`, `quiet_hours_start=-1`, `quiet_hours_end=99`, and `min_danger_level=99`, then read the row back.
- Expected: the server/database boundary accepts only supported locales (`ar`, `fr`, `en`, `kab`), quiet-hour values from 0 through 23 (or null), and danger levels from 1 through 5, regardless of client validation.
- Observed: the update succeeded and returned all four invalid values unchanged. The alert engine uses the invalid quiet-hour window directly and compares forecast danger against the threshold; `-1/99` makes every real hour quiet and `99` makes every 1–5 forecast fall below the threshold.
- Impact: a malformed or older client can leave an account in a state that silently suppresses non-emergency and risk alerts while the UI provides no reliable explanation or repair signal.
- Evidence and recovery: authenticated-role SQL transaction returned the persisted invalid values; the transaction was rolled back, so user A's profile was not changed.
- Repair status: commit `e6b95e4` adds fail-safe migration preflights and database constraints for supported locale, nullable 0–23 quiet hours, and 1–5 danger level, plus safe localized save errors. Focused pgTAP passed 40/40 and aggregate database tests passed 255/255; independent reviews and final behavioral replay remain pending.

### F-020 — report photos bypass the private bucket and load attacker-selected URLs in moderator browsers

- Severity: Medium
- Status: Fixed in 49e7a26 on `codex/data-reliability-control-plane`; not yet merged to `main`
- Role / module / environment: authenticated reporter and moderator/admin reviewer; M15 Citizen reports / M16 Moderation / M25 data boundary; isolated local Data API/database and real browser
- Exact reproduction: as authenticated user A, insert a valid pending report whose client-writable `photo_url` is `http://127.0.0.1:8080/api/public/v1/status?qa-photo-probe=f020`; then open the real `/moderation` pending queue as admin.
- Expected: `photo_url` is either null or an owner-scoped object key in the private `report-photos` bucket; the renderer obtains a short-lived signed bucket URL and never trusts a reporter-selected network URL.
- Observed: the database accepted the absolute URL. `signedPhotoUrl()` returns any `http(s)` string unchanged, so the moderation card rendered a link/image with that exact source. The browser reported the image request complete (it was a broken image only because the safe local target returned JSON).
- Impact: a reporter can make every reviewer who opens the queue contact an attacker-controlled or local-network URL, leaking reviewer network metadata and bypassing the promised private-storage boundary; approved/owner views using the same component inherit the behavior.
- Evidence and recovery: authenticated insert, real moderation DOM containing the exact URL, and completed `<img>` load state (`naturalWidth: 0` for the JSON probe). The exact report row was deleted immediately and a zero-count check confirmed cleanup; no external host was contacted.

### F-021 — webhook endpoints can be active while subscribed to no valid alert kind

- Severity: Medium
- Status: Reproduced; not yet fixed
- Role / module / environment: authenticated webhook owner; M14 Webhooks / M23 delivery; isolated local UI and authenticated database role
- Exact reproduction (normal UI): open `/webhooks`, provide a valid name and HTTPS URL, uncheck both `Fire alerts` and `Danger alerts`, and save. Separately, use the authenticated owner role to insert a whitespace-only label, `kinds=['bogus']`, and `min_severity=99` with a syntactically accepted HTTPS hostname.
- Expected: at least one supported kind is required; kinds are limited to `fire`/`risk`; severity is 1–5; and labels are nonblank within the UI's 60-character ceiling at both UI and database boundaries.
- Observed: the Save button remained enabled with no kinds, created an active endpoint, and rendered `· Minimum severity 3`. The database also accepted the blank label, unsupported kind, and severity 99; the owner UI rendered an unnamed row with untranslated `webhooks.kind_bogus · Minimum severity 99`.
- Impact: an endpoint can look active and correctly configured while no alert can ever match it, silently defeating the user's outbound alert integration; malformed clients can persist additional states the UI cannot repair coherently.
- Evidence and recovery: real UI create/render flow plus authenticated-role insert and cross-user isolation control (user B saw zero user-A rows). Both disposable endpoints were deleted/rolled back and fresh UI/database checks showed no remaining endpoint.
- Repair status: commit `e6b95e4` constrains visible labels, length, nonempty duplicate-free `fire`/`risk` kinds, and severity 1–5 at the database boundary while preserving HTTPS/RLS/service delivery behavior. The Arabic UI now disables Save and displays `اختر نوع تنبيه واحدًا على الأقل.` when both kinds are unchecked; no endpoint was created. Independent reviews remain pending.

### F-022 — a quota-limited partial risk refresh is exposed as the current forecast

- Severity: High
- Status: Reproduced; not yet fixed
- Role / module / environment: anonymous forecast consumer and alert recipient; M03 Forecast / M22 risk ingestion / M23 alert evaluation; isolated local app and database
- Exact reproduction: run the authenticated local risk refresh until Open-Meteo returns HTTP 429 after some batches, confirm the source run records partial coverage, then request `/api/public/v1/risk?horizon=0&limit=1000` and inspect the authenticated forecast query's selection logic.
- Expected: a partial snapshot may remain staged for resumability, but it is never selected as the current complete product or consumed for alert evaluation until all 1,536 communes × 6 horizons are complete. The last published complete snapshot remains current, or callers receive an explicit unavailable/degraded result when none exists.
- Observed: the run correctly recorded `outcome=partial`, `coverage_status=partial`, 2,100 accepted of 9,216 expected, `published_at=null`, and public health `unavailable`. Nevertheless, both forecast read paths anchor on the newest horizon-0 `risk_forecasts.forecast_date` without consulting the publication checkpoint. The real public endpoint returned HTTP 200 with 350 current-day rows from the incomplete `local_fwi` run, and the alert engine independently reads current-date rows directly.
- Impact: after an upstream quota interruption, different communes can see a mixture of new, old, or missing forecasts while the API presents the subset as current; risk alerts can evaluate only the refreshed subset. This violates the platform's explicit safety invariant that a partial snapshot is never published as the current complete product.
- Evidence: real authenticated cron response (`rows=2100`, `requests=14`, `error=open-meteo 429`), `source_runs`/`source_health` state, row distribution across only 350 current communes, HTTP 200 API replay, and read-path inspection. No external send occurred; provider credentials were blank.
- Repair status: commits `8274b12`, `6131202`, `568f274`, `673635c`, `3603682`, and `8a98025` stage partial runs privately, publish complete generations through an atomic monotonic pointer, pin public readers to a least-privilege RPC, deny anonymous base-table reads, atomically advance source health, and fail closed across API/client/alert readers. Quality review then reproduced five residual lifecycle defects, and commit `eaf327d` centralized the lifecycle, revoked raw DML, protected committed metadata, and added true lock contention. Fresh spec review found three further edge cases: libpq override parameters, staging without any run row, and equal-schedule partial reporting after a lost successful response. Commit `8cfa5dd` rejects override parameters before I/O and verifies the connected target, purges every non-active/orphan staging row, retries idempotent promotion, and prevents equal/older partial reports from demoting a committed checkpoint. Aggregate evidence is 260/260 pgTAP and 360/360 Vitest with zero fixtures. F-022 remains open pending fresh independent reviews.

### F-023 — contribution and translation moderation decisions omit the moderator identity

- Severity: Medium
- Status: Fixed and behaviorally replayed
- Role / module / environment: moderator and accountability reviewer; M07 Contributions / M08 Translations / M16 Moderation / M25 data boundary; isolated local browser and database
- Exact reproduction: sign in as the moderator fixture, publish a pending contribution idea through the real `Suggestions` queue, accept a pending translation through the real `Translations` queue, then inspect each changed row's `moderated_by` field.
- Expected: every moderation decision records the authenticated moderator identity (and decision time where the schema supports it) atomically with the status change, matching citizen-report moderation and allowing later reconstruction.
- Observed: both UI actions succeeded and queue counts updated, but `contribution_ideas.moderated_by` and `translation_suggestions.moderated_by` remained null. The client mutations update status/published time only and never set the authenticated actor, despite both tables having a moderator foreign-key column.
- Impact: published/rejected community ideas and accepted/rejected translations cannot be attributed to an operator, weakening abuse investigation, language-review provenance, and accountability for public content decisions.
- Evidence and recovery: real moderator UI actions followed by direct row inspection. The exact idea and translation fixtures were restored to their original pending state with null moderation fields; the temporary citizen report used as a positive attribution control was deleted.
- Fix: commit `f878321` replaces direct client updates with role-checked, empty-search-path database functions that update status, publication/note fields, and `auth.uid()` in one statement. Private queues also move behind moderator/admin RPCs as part of the shared contribution-privacy boundary.
- Fresh replay: the real admin moderation console published a fixed-id pending idea and accepted a fixed-id pending Kabyle translation; both disappeared from their queues and direct checks returned `published|true` and `accepted|true` for status plus exact current-admin attribution. Fixtures returned to zero; specification, quality, and database reviews passed.

### F-024 — removing or abandoning a report photo leaves an unreferenced private object indefinitely

- Severity: Medium
- Status: Fixed in 49e7a26 on `codex/data-reliability-control-plane`; not yet merged to `main`
- Role / module / environment: authenticated reporter and storage operator; M15 Citizen reports / M25 storage boundary; isolated local Storage API and database
- Exact reproduction: upload a valid PNG into the authenticated reporter's permitted `report-photos/{user_id}/...` path, then remove it from the report form or leave without submitting. Inspect `storage.objects` and report references.
- Expected: cancelling/removing a newly uploaded photo deletes that object, and a failed/abandoned report flow has a bounded cleanup path so private user media is not retained without a report record.
- Observed: photo selection uploads immediately, while the form's Remove action only clears React state (`setPhoto("")`) and navigation/submission failure has no cleanup. A real authenticated local Storage upload remained with zero `citizen_reports.photo_url` references; the owner-scoped policy correctly prevented cross-owner access but does not remove orphans.
- Impact: sensitive location imagery can be retained after the user believes they removed or abandoned it, while repeated abandoned uploads consume storage indefinitely. The private bucket limits disclosure but does not satisfy the visible removal/lifecycle expectation.
- Evidence and recovery: authenticated local Storage API returned 200, `storage.objects` showed the owner-scoped object and zero report references, and the UI/library lifecycle has no remove call. The exact object was deleted through the owner's real Storage API; a fresh count was zero.

### F-025 — unavailable forecast data is presented as an empty search result

- Severity: Medium
- Status: Fixed, merged to `main` in 72d0eff (#54), and verified on nadhir.app
- Role / module / environment: anonymous forecast consumer; M03 Forecast; isolated local browser after a partial unpublished refresh
- Exact reproduction: leave `local_fwi` with no usable published-complete checkpoint, open `/forecast` with an empty search field, and wait for the forecast and geography queries to settle.
- Expected: the page explains that the forecast is temporarily unavailable/partial and directs users to source status or retry, clearly distinct from a search with no matching commune.
- Observed: the publication gate correctly withholds all partial rows, but the page renders `No commune matches that search.` even though the search field is empty. It does not mention source unavailability or degraded coverage.
- Impact: users may infer that their place name or the geography catalog is missing rather than understanding that the safety forecast is unavailable, obscuring an upstream outage on a primary risk surface.
- Evidence: real browser replay after F-022 returned API 503 and public health `local_fwi=unavailable, partial 2100/9216`; the fully settled `/forecast` DOM showed the empty-search message and no forecast/source warning.

### F-026 — the Content Security Policy blocks legitimate private report photos

- Severity: Medium
- Status: Fixed in a5db5e1 on `codex/data-reliability-control-plane`; not yet merged to `main`
- Role / module / environment: authenticated reporter and moderator/admin reviewer; M15 Citizen reports / M16 Moderation / M24 security headers; isolated local Storage API and real browser
- Exact reproduction: upload a valid PNG to the private `report-photos` bucket, store its owner-scoped path on a pending report, and open the real moderation queue as an authorized reviewer.
- Expected: the component signs the private object for a short lifetime and the browser renders the valid image while retaining the restrictive CSP.
- Observed: the signed link was created at the Supabase Storage origin and a direct control request returned HTTP 200 `image/png` with 68 bytes. The page image completed with `naturalWidth=0`; the response CSP permits images from self, data/blob, and Carto only, omitting the configured Supabase/Storage origin.
- Impact: moderators cannot view legitimate photographic evidence submitted through the supported private upload flow, reducing the value and speed of report verification. Production uses the same cross-origin Supabase storage shape, so this is not local-port-specific.
- Evidence and recovery: real authenticated upload, real signed URL creation, browser DOM load state, direct signed-object control request, and response-header inspection. The exact report and object were deleted; fresh counts were both zero.

### F-027 — anonymous callers can read contributor contact details from published ideas

- Severity: High
- Status: Fixed and behaviorally replayed
- Role / module / environment: anonymous caller and community contributor; M07 Contributions / M25 database authorization; isolated local Data API
- Exact reproduction: insert a published contribution with a non-null optional contact value, then call the anonymous Data API directly with `select=id,contact,status` for that row.
- Expected: contact is private reviewer-only metadata and can never be selected anonymously, regardless of which columns the curated public UI happens to request.
- Observed: the anonymous request returned the full contact value. The RLS policy grants `anon` SELECT on published rows of the base `contribution_ideas` table; PostgreSQL row policies cannot hide individual columns, and no safe public projection mediates that access.
- Impact: every contributor email, phone number, or other contact attached to a published idea can be harvested without authentication, directly violating the product promise that contact is never published.
- Evidence and recovery: a real publishable-key REST query returned one row with `contact_exposed=true` and the exact 36-character contact value. The fixed-id fixture was deleted immediately; a fresh count was zero.
- Fix: commit `f878321` revokes anonymous/authenticated access to the private base tables, exposes published ideas through a security-barrier view containing only `id`, `lane`, `message`, `score`, and `published_at`, and moves private moderation queues/decisions behind role-checked RPCs with least-privilege grants.
- Fresh replay: an anonymous direct request for the base table returned HTTP 401 while the safe view returned exactly five public columns; the real contribution board rendered the idea and never rendered its private contact. The exact fixture was deleted, and specification/quality/database reviews plus 29/29 focused pgTAP passed.

### F-028 — a nonexistent fire detail returns HTTP 200 and names the fake fire in metadata

- Severity: Medium
- Status: Fixed, merged to `main` in 72d0eff (#54), and verified on nadhir.app
- Role / module / environment: anonymous visitor, crawler, or link checker; M02 Fire detail; isolated local browser and HTTP client
- Exact reproduction: navigate or request `/fire/QA-NOT-FOUND` for a short id absent from `fire_clusters`, then inspect the body, HTTP status, and document title.
- Expected: the entity route returns HTTP 404 with localized not-found content and a not-found title, while retaining a usable link to the live map.
- Observed: the visible body correctly says `This fire could not be found.`, but the server responds HTTP 200 and the document title is `Fire QA-NOT-FOUND — Nadhir Algeria`.
- Impact: caches, monitoring, crawlers, and shared links classify nonexistent incidents as valid fire pages; the title itself misleadingly presents arbitrary attacker/user input as a Nadhir fire identifier.
- Evidence: real full navigation, DOM/title inspection, and direct HTTP status replay. No data mutation was involved.

### F-029 — localized legal pages retain English-only document and social metadata

- Severity: Low
- Status: Fixed, merged to `main` in 72d0eff (#54), and verified on nadhir.app
- Role / module / environment: Arabic/French/Kabyle public visitor and link-preview consumer; M06 Public content / M24 internationalization; isolated local browser
- Exact reproduction: navigate to `/privacy` in English, switch the application to Arabic, and inspect the visible heading, root language/direction, `document.title`, and route metadata. The same static-English head definitions are used by `/terms` and `/about`.
- Expected: the localized visible page, browser-tab title, description, and social-preview labels use the active supported locale, or intentionally locale-neutral product metadata.
- Observed: the visible heading changed from `Privacy policy` to Arabic and the root correctly changed to `lang=ar`/`dir=rtl`, while `document.title` remained `Privacy policy — Nadhir`. Source inspection confirms the route title, description, and Open Graph copy are fixed English strings independent of locale.
- Impact: localized users and assistive/browser-history contexts encounter an English identity for otherwise translated legal content, and shared previews misrepresent the selected-language page.

### F-030 — the sign-in page title repeated the product name

- Severity: Low
- Status: Fixed, merged to `main` in a1c3ae5 (#55), and verified on nadhir.app
- Role / module / environment: all visitors of `/auth`; M10 Authentication / M24 internationalization; production
- Exact reproduction: request `/auth` in any locale and read `document.title`.
- Expected: one product name in the tab title.
- Observed: `Sign in to Nadhir — Nadhir` (`تسجيل الدخول إلى نذير — نذير`, `Se connecter à Nadhir — Nadhir`). The shared `titledMeta` helper appends the brand through `meta.titleTemplate`, while `account.authTitle` already carried it for the visible heading.
- Impact: cosmetic, but on the authentication boundary and in every supported locale.
- Origin: regression introduced by the F-029 repair in #54. It passed `tsc`, 398 tests and lint, because nothing asserted how a rendered title reads; a production sweep found it in under a minute.
- Fix: commit 6ad3152 adds a brand-free `account.authMetaTitle` for the head and leaves the heading copy untouched.
- Fresh replay: `/auth` returns `Sign in — Nadhir`, `تسجيل الدخول — نذير`, `Se connecter — Nadhir`; the visible `<h1>` still reads `Sign in to Nadhir`. A regression test extracts every `titledMeta` key from source and asserts no locale renders a doubled brand; it was confirmed to fail before the fix, and all ten keys were checked.

## Unconfirmed Leads

None currently.

## Fixed Findings and Behavioral Reverification

| Finding | Fix commit | Fresh behavioral replay | Result |
| --- | --- | --- | --- |
| F-001 unsupported API methods | `be4c5ad` | 2026-08-31, `POST` to index/fires/risk/stats/status/sources | All six returned JSON 405 with correct `Allow`; PASS |
| F-002 permanently fail-open API limiter | `230b111` | 2026-08-31, 62 requests in one fresh IP bucket plus anon RPC denial | 60×200 followed by 2×429; anon RPC still 401/42501; PASS |
| F-004 SSR hydration drift | `114e634` | 2026-08-31, fresh full `/about` and `/` navigations in system dark mode | Pages rendered; no new hydration error/failure in browser/server console; PASS |
| F-007 cron unsupported methods | `e40ec60` | 2026-08-31, 9-method matrix plus unauthenticated POST | All unsupported calls JSON 405; POST remained 401; PASS |
| F-008 contribution unsupported methods | `e40ec60` | 2026-08-31, 12-method matrix plus malformed POST | All unsupported calls JSON 405; malformed POST remained JSON 400; PASS |
| F-003 broken production preview | `7364809` | 2026-08-31, fresh build + exact package preview command + three-route probe | Static pages 200, unknown route 404, owned process stopped; PASS |
| F-009 zone invariants/concurrent cap | `ead94c0`, `d8c3090`, `730a148` | 2026-08-31, invalid/whitespace boundaries + simultaneous 11-insert replay + corrected focused/full pgTAP + RLS parity | 10 accepted/1 rejected; invalid rows rejected; DB 73/73; RLS unchanged; PASS |
| F-010 report safety/quota/timestamps | `ead94c0`, `d8c3090` | 2026-08-31, invalid boundaries + simultaneous four-insert replay + corrected timestamp/backdating + safe-view/RLS parity | 3 accepted/1 rejected; `created_at` authoritative and immutable while supplied `updated_at` preserved; DB 73/73; access parity unchanged; PASS |
| F-017 webhook DNS/redirect SSRF | `7c973f3`, `04b30f4` | 2026-09-01, nip.io/private/mixed/reserved/public-IANA matrix + redirect no-follow + generated Worker config | Private/reserved targets rejected before fetch, public exceptions preserved, redirects failed closed, focused 12/12/full 300/300; Cloudflare dry-run/startup/config review passed; PASS |
| F-012 subscription method/CORS contract | `832ee76`, `b4f51b1` | 2026-09-01, dev + production Worker GET/PUT/DELETE/PATCH/HEAD/OPTIONS/POST replay | Unsupported methods JSON 405, production preflight/POST advertise POST, provider-disabled POST remains 503, no provider execution; spec/quality PASS |
| F-014 final-admin invariant | `1ecedde`, `dce6b5e`, `71ada11` | 2026-09-01, sole-admin UI + direct/concurrent authenticated deletion + forced interruption + fresh ordered migration stack | UI disabled/explained removal; one concurrent delete committed and one failed closed; exact state restored; spec/quality/database PASS |
| F-023 moderation actor attribution | `f878321` | 2026-09-01, admin UI idea publish + translation accept + direct actor check | Both decisions recorded exact current admin atomically; fixtures zero; spec/quality/database PASS |
| F-027 contribution contact privacy | `f878321` | 2026-09-01, anonymous base-table/view REST + public-board browser replay | Base table 401; safe five-field view and board render succeeded without contact; fixtures zero; spec/quality/database PASS |

## Blocked Scenarios

None yet. Provider sends remain deliberately disabled; provider-failure behavior will be tested locally without real delivery.

## Cycle 1 Evidence Log

### Checkpoint C1-00 — discovery

- Read repository instructions and core product/domain sources: `README.md`, `CONTEXT.md`, `ORIGINAL-SPEC.md`, `GAPS.md`, `roadmap.md`, route conventions, application config, package scripts, CI workflows, ADR inventory, route inventory, role code, migrations, and RLS references.
- Confirmed Bun 1.3.14 and Supabase CLI 2.105.0.
- Confirmed the local Supabase development stack is running.
- Confirmed `.env.local` targets the live Supabase project; no application launch or QA request has used it.
- Inventoried seven audience/access models and 25 test modules.
- Subsequent checkpoints record the isolated launch, fixtures, and live browser execution.

### Checkpoint C1-01 — automated baseline

- `bun install --frozen-lockfile`: exit 0; 562 installs across 657 packages checked, no changes.
- `bunx tsc --noEmit`: exit 0.
- `bun run test`: exit 0; 32 files, 288 tests passed, 0 failed.
- `bun run lint`: exit 0; 0 errors and 7 pre-existing `react-refresh/only-export-components` warnings.
- `bun run build`: exit 0; client, SSR, and Cloudflare Nitro output generated. Build reported non-fatal large-chunk and ineffective-dynamic-import warnings.
- These results establish the automated baseline only; no behavioral scenario is marked passed from them.

### Checkpoint C1-02 — isolated runtime proof

- Started a dedicated Supabase stack from the ignored SDD scratch directory with unique ports: API 54821, database 54822, Studio 54823, and Mailpit 54824. Auth, REST, Realtime, Storage, database, and Studio are healthy.
- Overrode the live `.env.local` values at process launch. Confirmed the QA app's `/api/public/v1/status` timestamps and direct database counts both come from the isolated project.
- Loaded the repository migrations and seeded 69 wilayas, 1,536 communes, 10,257 settlements, and 567 persistent-source cells locally.
- Started the real development app at `http://127.0.0.1:8080` with local Supabase credentials, blank delivery/provider credentials, and a QA-only cron secret.
- Loaded the live map through the in-app browser. The map rendered with seeded fires and risk data; Arabic was initially RTL, switching to English updated the UI immediately, and a reload preserved English and LTR direction.
- Console inspection exposed the recurring theme-class hydration warning later recorded as F-004.

### Checkpoint C1-03 — public API boundary

- Exercised index, fires, risk, stats, status, and sources through direct HTTP, including valid JSON, GeoJSON, invalid filters, unknown commune codes, browser preflight, unsupported methods, and repeated calls.
- Valid reads returned the documented content types; invalid formats, states, dates, and commune codes returned JSON 400; an unknown commune returned JSON 404.
- Browser-style preflight from the local origin returned the expected CORS headers. Vite's rejection of an unrelated external origin is treated as a development-server boundary, not a product CORS defect.
- Reproduced F-001 and replayed its fix across all six read-only routes.
- Reproduced F-002 with 62 same-bucket requests and the protected RPC boundary.

### Checkpoint C1-04 — public route and accessibility sweep

- Rendered the live map, forecast, history, status, about, developers, privacy, terms, unknown-route 404, and all four Survival routes at 1440×900 and 390×844 through the real local app.
- All tested pages rendered usable content without horizontal overflow. Status and Survival surfaces exposed degraded/unknown states honestly rather than raw errors or false guarantees; SOS explicitly said no rescue service receives it, unknown positions remained `—`, and open areas were labelled unverified/safer rather than safe.
- The map showed 3 active fires, other non-active states distinctly, FWI 54/Extreme, emergency numbers, and a degraded-source warning. No unexpected failed network response was observed.
- The initial browser harness reported that Enter did not activate focused links/buttons. An independent physical-keyboard control in Safari disproved a product defect: Option-Tab focused the native Forecast link and Return navigated to `/forecast`. The in-app harness's synthetic `press` action also failed to activate a native theme button, so this result is recorded as a harness limitation, not a Nadhir finding.
- Reproduced F-004, F-005, and F-006. Screenshot evidence is stored under `/tmp/nadhir-cycle1-*` for this local run.

### Checkpoint C1-05 — cron authentication boundary

- Called all three cron endpoints with no bearer token, malformed auth, a wrong token, and an ambiguous comma-suffixed bearer value. Every authenticated `POST` boundary returned 401 and no job outcome.
- Called `/api/public/cron/alerts` twice with the QA-only local scheduler secret. Both returned structured JSON 200 outcomes (`evaluated: 0`, `created: 0`, `suppressed: 0`), showing a safe repeated no-op with the current local fixtures and blank delivery credentials.
- Unsupported-method coverage reproduced F-007 across all three endpoints.

### Checkpoint C1-06 — contribution API boundaries

- Exercised malformed JSON, too-short and too-long ideas, invalid lanes, the honeypot, valid isolated submissions, and the hourly idea limit through the real POST endpoint. Validation returned structured 400 errors; five valid same-IP ideas succeeded and the sixth returned 429.
- Exercised translation invalid locale/key, empty rows, blank suggestions, valid upsert/replacement, private reviewer-history retrieval, and rate limiting. Twenty valid same-IP upserts succeeded, the twenty-first returned 429, and the history endpoint returned only the matching reviewer key's latest pending row.
- All created data is QA-prefixed and exists only in the disposable local stack.
- Unsupported-method coverage reproduced F-008 across all four endpoints.

### Checkpoint C1-07 — local identities and first RLS matrix

- Created confirmed local-only identities for user A, user B, moderator, and admin plus matching profiles/roles. A separate sign-up identity proved short-password rejection, confirmation-required sign-up, Mailpit delivery, a local confirmation link, invalid-login rejection, and successful post-confirmation login.
- A protected `/zones` navigation without a browser session redirected to `/auth` and rendered the sign-in form.
- Direct Data API parity: ordinary users saw only their own profile/role; moderator saw only their own profile and two roles; admin saw all four profiles and six granted roles. Ordinary and moderator self-escalation to admin returned 42501.
- Zone ownership parity passed: user B could neither read nor update user A's zone, user A could not forge user B ownership, and user A could pause their own zone.
- Report ownership/moderation parity passed: the owner and moderator could read a pending report, another user and anon could not, owner self-approval was denied, moderator approval succeeded, and owner deletion remained allowed.
- Adversarial validation reproduced F-009 and F-010.

### Checkpoint C1-08 — signed-out protected-route hydration

- Replayed `/auth` as a fresh direct navigation: the form rendered and no new hydration diagnostic appeared.
- Replayed `/zones` in a separate fresh signed-out tab: the browser redirected to `/auth` and displayed the usable form, but React logged a pre-mount state update, root active-link attribute drift, and a full route-tree hydration failure.
- Recorded F-011 because the defect is specific to the real protected-route redirect path and survives the earlier general theme/time hydration fix.

### Checkpoint C1-09 — complete API route-method inventory

- Compared every file-backed `/api` route's explicit handlers after replaying F-001, F-007, and F-008.
- The six read-only public routes, three cron routes, and four contribution routes all exposed their fixed `ANY` fallback. `/api/public/v1/subscribe` was the sole remaining route without one.
- Direct `GET`, `PUT`, and `DELETE` probes reproduced F-012 as HTML 200 application-shell responses.
- After commits `832ee76` and `b4f51b1`, replayed GET/PUT/DELETE/PATCH/HEAD as JSON 405 and provider-disabled POST as JSON 503 with POST-aware CORS. A production Nitro/Worker replay confirmed the route-specific 204 preflight; specification and engineering-quality rereviews passed.

### Checkpoint C1-10 — Survival GPS/offline-pack status

- Replayed `/survival` with the geolocation permission prompt intentionally unanswered. Emergency entry, cancellation, and phone numbers stayed usable.
- The entry status remained `Getting your GPS position · saving your offline pack…` after more than 45 seconds.
- Confirmed that the entry sheet cannot transition to acquired, denied, unavailable, or saved states because it receives none of those values; recorded F-013 and closed the former unconfirmed lead.

### Checkpoint C1-11 — hanging database dependency

- Used the isolated database runtime outage as a real black-holed dependency state; no production or external system was involved.
- Fresh `/forecast` and `/status` requests initially remained pending while the local Data API accepted connections without responding. The server-side dependency path ultimately bounded the wait: `/api/public/v1/status` returned structured JSON 502 (`source status unavailable`) after 16 seconds.
- A subsequent fresh browser navigation to `/status` returned HTTP 500 and the usable root error boundary with `This page didn't load`, `Try again`, and `Go home`; it did not leak the database error. This is recorded as a passed degraded/error path, not a finding.

### Checkpoint C1-12 — production artifact preview

- Replayed the original F-003 workflow after commit `7364809`: frozen dependency install, fresh Cloudflare Nitro build, and the exact package preview command with explicit host/port.
- The locally pinned Wrangler 4.127.1 consumed `.output/server/wrangler.json`; `/about` and `/developers` returned 200 and an unknown route returned 404.
- Stopped only the owned preview process and confirmed port 8081 was free. Full tests (292), typecheck, and lint passed; lint retained seven pre-existing Fast Refresh warnings and no errors.

### Checkpoint C1-13 — admin team/role terminal state

- Signed in through the real UI as the isolated admin and loaded `/team`; all four QA members and their current user/moderator/admin roles rendered.
- Replayed the sole-admin self-revocation action. The mutation succeeded without confirmation, the current page lost authorization, and the database contained zero admins, reproducing F-014.
- Restored only the exact local QA admin role through the isolated database and confirmed the admin count returned to one before continuing.

### Checkpoint C1-14 — broadcast kill-switch and audit

- Loaded the real admin broadcast console: ON state, authority-warning relay fields, severity/wilaya validation controls, and empty audit state rendered.
- Toggled the global kill-switch OFF; the UI changed to `nothing publishes until resumed` and exposed the pressed Resume control. Toggled it back ON and confirmed the normal publishing copy returned.
- Neither transition appeared in the append-only audit surface and no actor is stored for settings changes; recorded F-015. The final local setting is ON.

### Checkpoint C1-15 — manual authority-warning validation

- Submitted whitespace-only authority and warning text through the real admin form after selecting a valid wilaya. Browser-native required validation did not reject spaces; the application trimmed both fields to empty strings and accepted the mutation.
- The console rendered a contentless queued warning and the database confirmed empty `source`/`body`, reproducing F-016.
- Deleted exactly that local QA row before the publisher could consume it. No broadcast/delivery state was created.

### Checkpoint C1-16 — zone/report invariant repair

- Captured focused pgTAP RED against the old schema (27 of 33 assertions failed), applied the single forward-only migration to the isolated database, then passed the focused suite 33/33 and full database suite 72/72.
- Behavioral concurrency replay produced 10 accepted plus one rejected zone and three accepted plus one rejected report. Invalid geometry/enums/future observations returned SQLSTATE 23514.
- Insert/update backdating replays confirmed report creation time is server-owned and immutable, closing the adjacent daily-quota bypass. Owner, cross-owner, moderator, admin, and anonymous safe-view access remained unchanged.
- All disposable concurrency/backdating users and cascaded reports/zones/roles were removed; fresh counts for the worker's QA fixture namespace were zero.
- Specification review caught and removed one unapproved insert-time rewrite of `updated_at` in corrective commit `d8c3090`. The edited migration reapplied with a committed transaction; after the isolated database recovered, the corrected focused suite passed 33/33 and the complete database suite passed 72/72.
- Post-correction cleanup verification found zero focused-test users, zones, reports, or roles; the local auth total remained the expected five QA identities (the four role fixtures plus the confirmation-flow identity).
- Quality review then reproduced a tab/newline-only zone name that the original `btrim` check missed. Commit `730a148` replaced it with a POSIX whitespace-aware predicate, added the failing case, reapplied the constraint, and passed focused pgTAP 34/34 plus the complete database suite 73/73. Specification and engineering-quality rereviews both passed.

### Checkpoint C1-17 — webhook outbound-target security

- Exercised the production webhook URL validator with direct public-looking, literal private, and DNS-alias targets without dispatching a webhook.
- Confirmed `https://127.0.0.1.nip.io/hook` passes the production validator even though the runtime resolver maps it to loopback (`127.0.0.1`).
- Source inspection confirmed the actual delivery path uses that synchronous hostname-only check immediately before a redirect-following `fetch`; recorded F-017.

### Checkpoint C1-18 — authentication dependency failure

- Submitted known-valid isolated admin credentials while local Postgres/Auth dependencies were recovering.
- The form remained usable and did not disclose credentials, but rendered the raw English transport error `name resolution failed`; recorded F-018.
- Once the database accepted connections again, the pending safety-data correction passed focused pgTAP 33/33 and the complete database suite 72/72; subsequent database flapping is tracked as local infrastructure, not an application finding by itself.

### Checkpoint C1-19 — profile alert-setting integrity

- Exercised the profile update policy under the authenticated user A JWT claims, bypassing only browser-native form limits while preserving the actual RLS role.
- The database accepted an unsupported locale, out-of-range quiet hours, and a danger threshold above the product's five-level scale; the alert engine's direct consumption of those values proves the all-day/all-risk suppression path. Recorded F-019.
- The reproduction ran inside a transaction and rolled back; the user fixture's settings remain unchanged.

### Checkpoint C1-20 — report-photo storage boundary

- Inserted one valid pending report as authenticated user A with a safe local API URL in the client-writable photo field, then loaded the actual moderation queue as admin.
- The UI rendered the supplied URL directly as a linked image and the browser completed the request, proving the private-bucket bypass without contacting an external host. Recorded F-020.
- Deleted the exact report by fixed QA id and note immediately after capture; a fresh count was zero.

### Checkpoint C1-21 — authenticated settings and webhook CRUD

- Loaded the real admin settings screen with the seeded profile, channel, language, threshold, and quiet-hour controls; submitting the unchanged valid form returned `Saved` and preserved the values.
- Created a disposable owned webhook endpoint through `/webhooks`, verified the endpoint details, revealed and re-hid the signing secret without logging it, paused the endpoint, reloaded to prove the paused state persisted, resumed it, and deleted it.
- The endpoint list returned to `No endpoint yet`; no alert pipeline ran and no webhook request was sent. Normal owner CRUD passed. F-017 remains the separately reproduced outbound-target defect under review, and F-019 remains the invalid direct-settings boundary defect.

### Checkpoint C1-22 — webhook configuration integrity

- Replayed owner RLS under user A/user B claims: user B could not read user A's endpoint. The owner boundary nevertheless accepted a whitespace-only label, unsupported kind, and severity 99; the transaction rolled back.
- Through the normal admin-owner UI, deselected both supported kinds. Save remained enabled, the endpoint was created active, and its card displayed an empty kind list. Recorded F-021.
- Deleted the exact UI endpoint and confirmed the list returned to empty; no delivery pipeline or external request ran.

### Checkpoint C1-23 — ingestion idempotency, concurrency, and partial-risk publication

- Ran the real authenticated local ingest endpoint with provider/delivery credentials blank. FCI fetched and inserted 38 detections, fusion processed 17 detections into 11 touched clusters and six new clusters, wind enriched 11 clusters, and broadcast published three local records; all delivery counts were zero and no external message was sent.
- An immediate repeat fetched the same 38 FCI records but inserted zero and performed zero fusion/broadcast work. Two concurrent repeats also returned success with zero inserts and zero downstream work, providing behavioral idempotency and concurrency evidence for this fixture state.
- Ran the real risk refresh. Open-Meteo returned 429 after 14 requests; the job retained 2,100 resumable rows for 350 communes and recorded a partial source run rather than advancing `last_success_at` or `published_at`. Public status truthfully reported `local_fwi` unavailable with partial 2,100/9,216 coverage.
- The public risk endpoint nevertheless returned those 350 partial horizon-0 rows as HTTP 200 current data, and the authenticated forecast/alert queries select the same table without a published-complete checkpoint. Recorded F-022.

### Checkpoint C1-24 — moderator journeys and attribution

- Signed out the admin fixture, signed in through the real authentication form as the isolated moderator, and loaded the report moderation queue. A user-owned pending report rendered with approve/reject controls; approval removed it from the pending queue and persisted the moderator's exact user id plus a review timestamp.
- The moderator received the localized no-access surface on `/team` and the admin-role-required surface on `/broadcasts`; neither role-management nor broadcast controls rendered.
- Published one existing QA contribution idea and accepted one existing QA translation through the separate moderation tabs. Both status changes succeeded, but their `moderated_by` columns remained null; recorded F-023.
- Deleted the exact report fixture and restored the idea/translation fixtures to their original pending state. Fresh checks showed zero report rows and both contribution fixtures pending.

### Checkpoint C1-25 — report-photo ownership and cancellation lifecycle

- Used the moderator's normal authenticated local session against the real private Storage API to upload a valid one-pixel PNG under the required owner folder. Storage accepted it and recorded the correct owner; no report referenced the object.
- Confirmed the report form uploads on file selection but its Remove action only clears local component state, with no deletion on remove, navigation, or failed submission. Recorded F-024.
- Deleted the exact owner-scoped object through the same authenticated Storage API and confirmed the storage metadata count returned to zero. No external or production storage was touched.

### Checkpoint C1-26 — partial-risk publication fix replay

- With the original partial 2,100/9,216 risk rows still present, replayed `/api/public/v1/risk?horizon=0&limit=1000` after commit `8274b12`. It now returned JSON 503 `forecast unavailable`; status remained honestly unavailable/partial and no checkpoint timestamp was advanced.
- The authenticated `/forecast` query also withheld all partial rows, confirming the repaired client publication boundary. The settled page mislabeled the absence as an empty search result, so F-025 records the remaining communication defect separately.

### Checkpoint C1-27 — personal alert lifecycle and isolation

- Inserted one service-originated local alert for the signed-in admin fixture, loaded `/alerts`, and verified its title/body, unread count, mark-read, mark-unread, mark-all-read, and delete actions through the real UI. The row disappeared and the empty state returned.
- Ran `Check my zones now` with no current admin zones; it completed without an error or a new alert. No delivery provider was configured or contacted.
- In an authenticated-role transaction, user A saw zero rows and could neither update nor delete the admin-owned alert, while the owner saw exactly one. Rolled the transaction back; the prior UI fixture was already deleted. M12 passes Cycle 1.

### Checkpoint C1-28 — legitimate private report-photo rendering

- Uploaded a valid one-pixel PNG under the moderator's owner-scoped private folder, attached its storage path to a pending report, and opened the actual moderation queue as admin.
- The component generated the expected signed Storage link. A direct control fetch returned HTTP 200 `image/png` and 68 bytes, but the in-page image completed with zero natural width because CSP `img-src` omits the Supabase/Storage origin; recorded F-026.
- Deleted the exact report and object and confirmed both counts returned to zero.

### Checkpoint C1-29 — contribution contact privacy

- Created one fixed-id published idea with a disposable contact value in the isolated database, then queried the base table as an anonymous publishable-key client while explicitly selecting `contact`.
- The Data API returned the private contact column, reproducing F-027; the public UI's narrower projection is not an authorization boundary.
- Deleted the exact idea immediately and confirmed zero rows remained.

### Checkpoint C1-30 — watch-zone UI lifecycle

- As the isolated admin account, created a valid custom watch zone through `/zones`, verified its coordinates/radius/threshold and enabled fire/risk channels, paused it, reloaded to prove the paused state persisted, resumed it, and deleted it.
- The exact zone disappeared from the UI and a direct owner/name count returned zero. Together with the repaired invalid-boundary, 10-zone concurrency, and cross-owner RLS replays, M11 passes Cycle 1.

### Checkpoint C1-31 — history filters and fire-detail states

- Loaded `/history`, exercised the real wilaya filter to Bejaia, and verified totals, area, ranking, and the matching cluster row updated coherently. The English one-fire and unmatched summaries reproduced the broader F-006 pluralization defect.
- Opened the known `DZ9M2B` fire detail directly. Place/wilaya/state/confidence, wind direction, estimated area, FRP, 11 detections, first/last observation age, source labels, detection timeline, nearest settlements, zone/report calls to action, and emergency numbers rendered coherently.
- Opened an absent short id. The body offered a usable not-found message/map link, but HTTP and metadata claimed a valid entity; recorded F-028.

### Checkpoint C1-32 — source-status truthfulness

- Reloaded `/status` after the real ingest and quota-limited risk runs aged naturally. The page differentiated unavailable, degraded, stale, delayed, and operational states; displayed validity/validation ages, missing credentials, partial 2,100/9,216 FWI coverage, and upstream/internal reasons without private diagnostics.
- The FWI surface correctly said no valid data/never validated rather than treating staged partial rows as a forecast. The English `data source(s)` placeholder extends F-006; no new source-health truthfulness defect was found.

### Checkpoint C1-33 — localized public legal metadata

- Navigated to `/privacy` through the real browser, captured the English heading/title, switched to Arabic through the application locale control, and captured the resulting root locale/direction, visible heading, and document title.
- The body correctly translated and changed to RTL, but the browser title remained English. Route inspection confirmed that privacy, terms, and about metadata are static English rather than locale-aware; recorded F-029.

### Checkpoint C1-34 — contribution privacy repair replay

- Inserted one fixed-id published idea with a disposable private contact value in the isolated database after commit `f878321`.
- An anonymous real PostgREST request for `contribution_ideas?id=...&select=id,contact` returned HTTP 401, while the new `published_contribution_ideas` projection returned exactly `id`, `lane`, `message`, `published_at`, and `score`.
- Reloaded the public contribution board through the real browser. The idea rendered and its private contact did not. Deleted the exact fixture and confirmed its count returned to zero. F-027 remains open until independent specification, quality, and database review finish.

### Checkpoint C1-35 — moderation actor-attribution repair replay

- Inserted one fixed-id pending idea and one fixed-id pending Kabyle translation in the isolated database, then opened the actual admin moderation console.
- Published the exact idea and accepted the exact translation through their separate UI tabs. Both disappeared from their pending queues; direct database checks returned `published|true` and `accepted|true` for status plus `moderated_by = current admin`.
- Deleted both exact fixtures and confirmed both counts returned to zero. F-023 remains open until independent specification, quality, and database review finish.

### Checkpoint C1-36 — final-admin invariant repair and ordered-migration proof

- Reloaded `/team` as the isolated sole admin. The self-removal action was disabled and accompanied by the localized instruction to appoint another admin first; the exact database admin count remained one.
- The corrected harness held the production advisory key, proved both authenticated deletes were waiting, released them, and observed one commit plus one `last_admin_required`; repeated, forced-interruption, and mutation-disabled runs restored the exact prior role hash and removed all fixtures/sessions.
- Specification and engineering-quality review passed. Database review initially found that the primary audit stack's manually applied migrations were absent from its local Supabase ledger, so a separate disposable local stack applied every repository migration in order. All five new migration versions appeared without collision and F-014 pgTAP passed 18/18 inside a rolled-back transaction; the review stack was then stopped without backup. Database re-review passed and the primary audit stack was untouched.

### Checkpoint C1-37 — residual direct risk-table publication bypass

- After the immutable-generation correction, replayed both the curated API and the underlying Data API boundary against the isolated stack.
- The curated `/api/public/v1/risk` reader remained pinned to the complete publication checkpoint, but an anonymous publishable-key request directly selecting one `local_fwi` row with `snapshot_id IS NULL` from `risk_forecasts` still succeeded. Only a boolean/count summary was captured; row contents were not copied to the ledger.
- This is the same F-022 contract, not a duplicate finding: the original public SELECT grant/policy on the base table still bypasses the safe pointer and exposes legacy partial rows. F-022 remains open pending revocation or a safe current-public projection plus fresh Data API replay.

### Checkpoint C1-38 — risk Data API boundary correction replay

- After commit `3603682`, repeated the same anonymous publishable-key request against the base `risk_forecasts` table; it now returned HTTP 401.
- The no-argument `current_risk_forecasts` RPC returned HTTP 200 with zero rows because the isolated stack has no complete pointer, while the curated application endpoint returned its stable HTTP 503 unavailable response. The original 2,100 partial legacy rows were therefore no longer reachable through either public surface.
- The worker's true concurrent harness additionally published two complete generations and proved the RPC exposed only the newer pointer, historical/legacy filters returned no rows, service direct access remained available, and all fixtures were removed. F-022 remains open until corrected spec, quality, and database reviews pass.

### Checkpoint C1-39 — broadcast control and blank-warning correction replay

- Replayed the repaired Arabic `/broadcasts` console as the isolated administrator. OFF then ON both succeeded, the final kill-switch state is ON, and the audit table immediately showed separate `disabled` and `enabled` actions attributed to the exact current administrator.
- Submitted ordinary spaces as the public authority and Unicode EM spaces as the verbatim warning after selecting Algiers. The form returned the localized validation error `أدخل اسم السلطة ونص التحذير.` and a direct database count remained zero, so no malformed relay candidate or downstream broadcast was created.
- F-015/F-016 remain open until the implementation passes independent specification, engineering-quality, and database reviews.

### Checkpoint C1-40 — profile and webhook integrity correction replay

- The F-019/F-021 migration passed 40/40 focused pgTAP and 255/255 assertions across all seven database suites, including authenticated/service invalid writes, exact valid boundaries, existing HTTPS protection, RLS cross-owner isolation, preflight rollback rehearsals, and zero fixtures.
- In the real Arabic `/webhooks` UI, a valid label and HTTPS URL with both alert kinds unchecked produced `اختر نوع تنبيه واحدًا على الأقل.` and kept Save disabled. The endpoint list remained empty, so no webhook or delivery action occurred.
- F-019/F-021 remain open until specification, engineering-quality, and database reviews pass.

## Cycle 2 Evidence Log

Not started.

## Validation Runs

| Date / stage | Command | Exit | Evidence |
| --- | --- | --- | --- |
| 2026-08-31 baseline | `bun install --frozen-lockfile` | 0 | No dependency changes |
| 2026-08-31 baseline | `bunx tsc --noEmit` | 0 | No diagnostics |
| 2026-08-31 baseline | `bun run test` | 0 | 288 passed, 0 failed |
| 2026-08-31 baseline | `bun run lint` | 0 | 0 errors, 7 warnings |
| 2026-08-31 baseline | `bun run build` | 0 | Client, SSR, Nitro outputs generated |
| 2026-08-31 F-009/F-010 correction | focused pgTAP via direct `psql` | 0 | 34/34 passed; whitespace names rejected; authoritative `created_at` preserves supplied `updated_at` |
| 2026-08-31 F-009/F-010 correction | all `supabase/tests/*.test.sql` via direct `psql` | 0 | 73/73 passed across source reliability and user-safety suites |
| 2026-09-01 aggregate after F-014/F-022/F-023/F-027 implementation | `bun run test` | 0 | 42 files; 339/339 passed |
| 2026-09-01 aggregate after F-014/F-022/F-023/F-027 implementation | `bunx tsc --noEmit` | 0 | No diagnostics |
| 2026-09-01 aggregate after F-014/F-022/F-023/F-027 implementation | `bun run lint` | 0 | 0 errors; seven pre-existing Fast Refresh warnings |
| 2026-09-01 aggregate after F-014/F-022/F-023/F-027 implementation | all five `supabase/tests/*.test.sql` via direct local `psql` | 0 | Contribution privacy, final-admin, risk publication, source reliability, and safety-invariant suites all passed |
