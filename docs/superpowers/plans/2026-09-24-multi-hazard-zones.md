# Multi-hazard watch zones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A watch zone follows fire, fire danger, ONM weather, official warnings and road incidents, and its alerts reach the owner's phones through a per-user FCM topic.

**Architecture:** Pure matchers in `src/lib/zone-hazards.ts` decide whether a hazard concerns a zone; `alerts-engine.server.ts` builds one alert row per zone per hazard item and upserts on `(user_id, dedupe_key)` as today; a push step sends new rows to `v1.user.<user_id>`.

**Tech Stack:** Supabase Postgres + pgTAP, TanStack Start server functions, Vitest, FCM topics (`src/lib/fcm.ts`), React + i18next.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-24-multi-hazard-zones.md` (approved 2026-09-24).
- Wording rules from `CONTEXT.md`: ONM text verbatim with attribution; "confirmed" only from authority evidence; expiry or withdrawal is never an all-clear; candidate fires never pushed.
- Quiet hours: break-through only for fire inside the zone (unchanged), ONM `severity = 'Extreme'`, and `official`.
- ONM severities in prod are CAP words (`Moderate`, `Severe`, `Extreme`).
- Authority warnings carry no expiry: they are eligible for 24 h after `created_at` (decision recorded here).
- Official incidents are eligible while `officialPhase(...)` is `live` (reuse `src/lib/incident-lifecycle.ts`).
- pgTAP must pick communes by data, never by code (codes differ between seeds).
- Four locales (en, fr, ar, kab — kab gets French text until translated). No comments beyond a one-line why.

---

### Task 1: Schema — zone switches, alert kinds, alert source

**Files:**

- Create: `supabase/migrations/20260924230000_multi_hazard_zones.sql`
- Create: `supabase/tests/multi_hazard_zones.test.sql`
- Modify: `src/integrations/supabase/types.ts` (zones + alerts Row/Insert/Update)
- Modify: `src/lib/account.ts` (`Zone`, `ZoneInput`)

- [x] Write the pgTAP test: new columns exist and default true for an inserted zone; existing zones backfilled; `alerts` accepts `weather`, `official`, `road` and still rejects `flood`; `source_table`/`source_id` nullable.
- [x] Migration: add `notify_weather`, `notify_official`, `notify_road` boolean not null default true to `zones`; replace the `alerts` kind CHECK with `fire, risk, weather, official, road`; add `source_table text`, `source_id uuid` to `alerts` with a CHECK that both are null or both set.
- [x] Update types and `Zone`/`ZoneInput`; run `DB=1 gates.sh`; commit.

### Task 2: Pure matchers

**Files:**

- Create: `src/lib/zone-hazards.ts`
- Create: `src/lib/__tests__/zone-hazards.test.ts`

**Interfaces — Produces:**

- `circleTouchesPolygon(lat, lon, km, polygon: Polygon | MultiPolygon): boolean` — centre inside, or any vertex within `km`, or any edge within `km`.
- `weatherConcernsZone(zone, warning, zoneWilayaId): boolean` — polygon test, fallback `warning.wilaya_id === zoneWilayaId`.
- `officialConcernsZone(zone, incident, zoneWilayaId): boolean`
- `authorityConcernsZone(zoneCommuneCode, zoneWilayaId, warning): boolean`
- `roadConcernsZone(zone, publication, zoneWilayaId): boolean` — `area_id` equals zone commune or zone wilaya.

- [x] Tests first: point-in-polygon, circle grazing an edge, circle far away, MultiPolygon, missing polygon falls back to wilaya; each concern function's commune/wilaya branches.
- [x] Implement; tests green; commit.

### Task 3: Engine — weather, official, road

**Files:**

- Modify: `src/lib/alerts-engine.server.ts`
- Create/extend: `src/lib/__tests__/alerts-engine-hazards.test.ts`

- [x] Load active items once per run: ONM (`superseded_at is null`, `expires > now()` or null onset window), official incidents (live phase), authority warnings (last 24 h), road publications (`state = 'published'`, `hazard = 'road'`, `expires_at > now()`), plus the commune→wilaya map for zones.
- [x] Per zone and switch, push one row: `kind`, `severity` (ONM: Moderate 2, Severe 3, Extreme 4; official 4; authority by its severity; road 2), `dedupe_key` `<kind>:<zone>:<source_id>`, `source_table`, `source_id`, localized `title`/`body` from `COPY`, ONM `headline_fr`/`title` quoted verbatim with "ONM" attribution.
- [x] Quiet hours: suppress unless the break-through rule applies; count in `suppressed`.
- [x] No CAP event for the new kinds.
- [x] Tests with a mocked Supabase (follow `alerts-engine-risk-publication.test.ts`): one alert per kind for a matching zone, none when the switch is off, none outside the area, dedupe key stable across runs, quiet-hours suppression and break-through.
- [x] Commit.

### Task 4: Push to the user's devices

**Files:**

- Modify: `src/lib/fcm.ts` (user topic name + send), `src/lib/push.ts` (join/leave user topic), server function for join/leave, `src/lib/alerts-engine.server.ts` (send after upsert)
- Tests alongside.

- [x] Verify first, read-only: prod broadcast delivery receipts show FCM sends succeeding (credentials work).
- [x] `userTopic(userId)` → `v1.user.<userId>`; authenticated server function subscribes/unsubscribes the caller's token to their own topic only.
- [x] After upsert, send each inserted row to its user's topic with `tag = source_id ?? cluster_id` and the alert's title/body; record failures, never swallow them.
- [x] Client: join on sign-in when permission is granted, leave on sign-out.
- [x] Commit.

### Task 5: UI and copy

**Files:** `src/components/zones/ZoneEditor.tsx`, `src/components/zones/ZoneCard.tsx`, `src/routes/_authenticated/alerts.tsx`, `src/routes/_authenticated/settings.tsx`, `src/i18n/locales/*.ts`

- [x] Editor: five switches; card "Follows" lists enabled hazards.
- [x] Alerts inbox: rows for weather/official/road with attribution and a map link.
- [x] Settings: "Push on this device" with states on / off / blocked / unsupported.
- [x] Browser pass en/ar at 390 and 1280 px; commit.

### Task 6: Replay and ship

- [x] Read-only replay of the last 7 days of prod hazards against prod zones: alerts per kind per zone, no duplicate `dedupe_key`, quiet-hours suppressions.
- [ ] Full gates (`DB=1`), CI-derived checks, build; PR; merge only on a named OK.
