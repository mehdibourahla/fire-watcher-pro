# Nadhir Behavioral QA Audit Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete repeated, evidence-backed behavioral audits of every Nadhir audience and module until two consecutive full cycles produce no new reproducible critical, high, or medium defects.

**Architecture:** `QA_AUDIT.md` is the durable control plane: it owns inventory, cycle state, coverage, findings, evidence, blockers, and the next test. The application runs against the existing local Supabase stack with process-level environment overrides so the live project configured in `.env.local` is never tested or mutated. Browser evidence proves user-visible behavior; direct HTTP, local database inspection, logs, and automated checks support but never replace it.

**Tech Stack:** Bun 1.3.14, TanStack Start/Vite, React 19, Supabase local development stack, Vitest, ESLint, TypeScript, in-app browser automation.

**Spec:** `QA_AUDIT.md`

## Global Constraints

- Never exercise or mutate the production Supabase project or `https://nadhir.app`.
- Preserve the pre-existing untracked `data/telegram-channels.json`.
- A pass requires real UI or external-interface execution; code reading and green tests are supporting evidence only.
- A finding requires reproduction steps, expected and observed behavior, role, module, environment, severity, impact, and captured evidence.
- Fix only reproduced defects with an unambiguous contract; use the smallest safe change and behaviorally replay the original reproduction.
- Stop only after two consecutive complete cycles find no new reproducible critical, high, or medium defects and all fixes pass behavioral verification.

---

### Task 1: Establish the durable inventory and safe environment

**Files:**
- Create: `QA_AUDIT.md`
- Modify: `QA_AUDIT.md`

**Interfaces:**
- Consumes: repository docs, routes, generated route tree, migrations, RLS policies, workflows, `.env.example`, package scripts.
- Produces: role/module/route/job/integration inventory, environment guardrails, coverage matrix, cycle state, next action.

- [x] Read `README.md`, `CONTEXT.md`, `ORIGINAL-SPEC.md`, `GAPS.md`, `roadmap.md`, ADRs, feature specs, route files, migrations, and CI workflows.
- [x] Confirm the local stack with `bunx supabase status` and record that `.env.local` targets production.
- [x] Inventory anonymous, authenticated user, moderator, admin, developer/API consumer, authority stakeholder, and accountless subscriber paths.
- [x] Start `bun run dev` on port 8080 with local Supabase URL, publishable key, and secret key explicitly overriding `.env.local`.
- [x] Prove the server uses local Supabase by creating uniquely prefixed local QA fixtures and observing only the local database.

### Task 2: Baseline validation and public-surface cycle 1

**Files:**
- Modify: `QA_AUDIT.md`
- Test: public routes in `src/routes/`, public API routes in `src/routes/api/public/`

**Interfaces:**
- Consumes: running local application and seeded public reference data.
- Produces: browser screenshots, console/network evidence, HTTP response evidence, and verified public-surface findings.

- [x] Run `bunx tsc --noEmit`, `bun run test`, `bun run lint`, and `bun run build`; record exact outcomes without treating them as behavioral proof.
- [ ] Exercise `/`, `/fire/:id`, `/forecast`, `/history`, `/status`, `/about`, `/developers`, `/privacy`, `/terms`, and not-found/error behavior.
- [ ] Exercise `/survival`, `/survival/sos`, `/survival/checkin`, `/survival/areas`, offline/service-worker behavior, geolocation denial, repeated actions, back/refresh, and zero-data states.
- [ ] Exercise `/contribute`, `/contribute/language/:locale`, idea submission/voting, translation submission/history, invalid locales, duplicate actions, rate limits, and malicious input.
- [ ] Exercise every `/api/public/v1/*` and `/api/public/contribute/*` method with valid, empty, malformed, boundary, repeated, and unauthorized requests.
- [ ] Repeat critical public flows at desktop and narrow mobile widths, with keyboard-only navigation, Arabic RTL, French, English, Kabyle, dark/light/system themes, and browser console/network inspection.

### Task 3: Authenticated and privileged cycle 1

**Files:**
- Modify: `QA_AUDIT.md`
- Test: `src/routes/_authenticated/`, auth and account libraries, relevant RLS policies.

**Interfaces:**
- Consumes: isolated local accounts for user, moderator, and admin.
- Produces: permission, ownership, state-transition, persistence, and cross-account evidence.

- [ ] Create isolated local QA identities for ordinary user A, ordinary user B, moderator, and admin; grant roles only in the local database.
- [ ] Exercise sign-up, confirmation through local Mailpit, sign-in, invalid credentials, refresh persistence, signed-in redirect, sign-out, and protected-route redirects.
- [ ] Exercise zones create/update/pause/resume/delete, limit and boundary inputs, duplicate/out-of-order/terminal actions, reload/session persistence, and user A versus user B isolation.
- [ ] Exercise alert listing/read/unread/mark-all/check-now, settings persistence and validation, webhook CRUD/delivery display, citizen report/photo lifecycle, deletion, and cross-account access.
- [ ] Exercise moderator report/idea/translation queues, approval/rejection repeated and terminal actions, false-positive cluster paths, and ordinary-user denial.
- [ ] Exercise admin team role grant/revoke, broadcast kill switch/manual authority warning/audit display, repeated operations, self-role changes, and moderator/user denial.

### Task 4: Pipelines, jobs, integrations, and cross-module cycle 1

**Files:**
- Modify: `QA_AUDIT.md`
- Test: cron routes, ingestion/fusion/risk/alert/broadcast/delivery libraries, local database state.

**Interfaces:**
- Consumes: local scheduler secret, controlled fixtures/mocks, source contracts, and local database.
- Produces: authenticated/unauthenticated job responses, append-only run evidence, failure-state behavior, and end-to-end journey evidence.

- [ ] Exercise cron endpoints without a secret, with a wrong secret, and with the local secret; prevent real provider sends by leaving delivery credentials empty in the process environment.
- [ ] Exercise missing credentials, upstream errors, malformed payloads, partial coverage, retry/idempotency, concurrent invocation, source-health projection, and sanitized public errors.
- [ ] Follow detection → fusion → fire detail → broadcast/alert; weather → FWI → forecast/zone alert; report → moderation → public visibility; subscription → banner/topic sync; source run → status UI/API.
- [ ] Verify RLS and action parity directly against the local Data API for anon, user A, user B, moderator, admin, and service role where appropriate.
- [ ] Re-run every cycle-1 fix through the original real interface, adjacent roles, refresh, and persistence checks.

### Task 5: Complete cycle 1 and run cycle 2

**Files:**
- Modify: `QA_AUDIT.md`

**Interfaces:**
- Consumes: completed cycle-1 matrix and verified fixes.
- Produces: full validation result and a second complete matrix using changed data/order.

- [ ] Close every cycle-1 matrix row as passed, finding, or explicitly blocked with reason and residual risk.
- [ ] Run the full CI-derived validation set: dependency install state, `bunx tsc --noEmit`, `bun run test`, `bun run lint`, `bun run build`, plus any path-triggered workflow gates affected by fixes.
- [ ] Start cycle 2 with new QA identities/data, reverse journey order, altered boundaries, repeated terminal actions, refresh/retry, and cross-module concurrency.
- [ ] Re-exercise every module, role, locale, viewport, API, integration failure, job, and prior finding through its actual interface.
- [ ] If cycle 2 finds a new critical/high/medium defect, fix and verify it, mark cycle 2 non-clean, and begin cycle 3; otherwise record cycle 2 as the first clean cycle only if cycle 1 was non-clean.

### Task 6: Satisfy the two-clean-cycle exit gate

**Files:**
- Modify: `QA_AUDIT.md`

**Interfaces:**
- Consumes: the latest clean-cycle count and all previously fixed finding reproductions.
- Produces: two consecutive clean complete cycles or a documented blocker that prevents that claim.

- [ ] Run another complete cycle whenever fewer than two consecutive clean cycles exist, changing data, journey order, and adversarial combinations again.
- [ ] Replay every fixed finding through the real UI/external interface and record fresh evidence.
- [ ] Run the full CI-derived validation set from the current worktree and record exit codes and failure counts.
- [ ] Audit the ledger for missing audiences, states, integrations, cross-module journeys, screenshots/logs/network evidence, duplicate findings, and stale claims.
- [ ] Mark the goal complete only when the last two complete cycles are clean for critical/high/medium defects and every fixed finding has fresh behavioral verification.
