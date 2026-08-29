# Survival Mode v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Survival Mode v1 — the personal survival layer validated in CONTEXT.md, ADR-0002/0003 and the mockup canvas — as working routes, logic, data and offline support on a feature branch.

**Architecture:** Pure survival logic lives in `src/lib/survival.ts` (threat assessment, position card, check-in message) with local persistence modules (`sos-queue.ts`, `survival-pack.ts`) taking an injected Storage. UI is a chrome-less `/survival` route family (hub-and-spoke, depth 1) plus three entry points on the home map (pill, position interstitial, zone-alert banner). Data adds one migration (open_areas, citizen_reports.kind, safe-columns hazard view) and an Overpass seed script. Offline is a minimal service worker plus the pack.

**Tech Stack:** TanStack Start/Router/Query, react-i18next (4 locales, parity-tested), Supabase JS, lucide-react, vitest.

## Global Constraints

- ADR-0002: Nadhir never generates a directive. No routes, ETAs, countdowns. Directive-shaped text is only relayed Instruction (none exist yet — the slot renders Standing Guidance) or pre-approved Standing Guidance (imperative but generic).
- ADR-0003: no evacuation routing of any kind.
- CONTEXT.md bans: the word "safe" as a status label; "request received" acknowledgment for SOS; labelling Open Areas safe/verified; showing all-clear reports unmoderated (v1 collects none).
- Emergency numbers are the repo canon: Protection Civile **14**, forest green line **1070**, general **112** (`emergency.*` keys, `EmergencyNumbers`).
- Every new i18n key exists in ar, fr, en, kab (parity test enforces). Western numerals everywhere.
- Every fact shown carries its age. Danger levels always numeral + name + icon.
- CI gates before any commit claim: `bunx tsc --noEmit`, `bun run test`, `bun run lint`; prettier on touched files.
- Migrations: version prefix must be unique and later than `20260829020000`; never apply to the live project (owner-gated).

---

### Task 1: Branch + discovery docs

**Files:** Create branch; commit `CONTEXT.md`, `docs/adr/0002-*.md`, `docs/adr/0003-*.md`, this plan.

- [ ] `git checkout -b survival-mode origin/main`
- [ ] `git add CONTEXT.md docs/adr docs/superpowers/plans/2026-08-29-survival-mode.md && git commit -m "Add domain glossary and survival-mode ADRs from discovery"`

### Task 2: Survival domain logic (`src/lib/survival.ts`)

**Files:** Create `src/lib/survival.ts`, `src/lib/__tests__/survival.test.ts`.

**Produces:**

- `SURVIVAL_AUTO_KM = 10` (auto-entry radius), `SURVIVAL_ACTIVE_KEY = "nadhir.survival.active"`.
- `type Threat = { cluster: FireCluster; km: number; bearing: number; closing: boolean | null }`
- `nearestThreat(lat, lon, clusters: FireCluster[]): Threat | null` — nearest LIVE_STATES cluster by haversine; `closing` true when `spread_bearing_deg` points within ±60° of the bearing cluster→user, null when no bearing.
- `positionCard(lat, lon, units: AdminUnit[], settlements: Settlement[], locale: Locale): { commune: string | null; wilaya: string | null; nearest: { name: string; km: number; bearing: number } | null; coords: string }` — nearest commune centroid (≤30 km else null) and its wilaya via parent_id; nearest settlement (≤30 km); `coords` = `"36.5231 N · 4.0517 E"` (4 decimals).
- `checkInMessage(kind: "ok" | "assist", name: string | null, card: ReturnType<typeof positionCard>, t: (k: string, o?: object) => string): string` — built from i18n keys `survival.checkin.msgOk` / `msgAssist` with place + coords interpolation.
- Tests: threat picks nearest live cluster and ignores extinguished; closing flag from spread bearing; positionCard distances/labels; coords formatting; checkInMessage contains coords and never the word "safe" (en).

- [ ] Write failing tests → `bun run test src/lib/__tests__/survival.test.ts` fails (module missing)
- [ ] Implement using `haversineKm`, `bearingBetween`, `coordLabel`-style formatting, `unitName`, `LIVE_STATES` from `@/lib/nadhir`
- [ ] Tests pass → commit "Add survival domain logic: threat, position card, check-in message"

### Task 3: SOS queue (`src/lib/sos-queue.ts`)

**Produces:** `type SosEntry = { id: string; created_at: string; lat: number | null; lon: number | null; note: string | null; sent: boolean }`; `loadSosQueue(storage)`, `enqueueSos(storage, entry)`, `markSosSent(storage, id)`, key `"nadhir.sos.queue"`. Pure, injected `Pick<Storage,"getItem"|"setItem">`, corrupt JSON → empty queue.

- [ ] Failing tests (enqueue/load round-trip, markSent, corrupt JSON) → implement → pass → commit "Add local SOS queue"

### Task 4: Survival Pack (`src/lib/survival-pack.ts`)

**Produces:** `type SurvivalPack = { saved_at: string; lat: number; lon: number; commune: string | null; wilaya: string | null; nearest: { name: string; km: number; bearing: number } | null; coords: string; openAreas: OpenArea[]; threats: { km: number; bearing: number; last_detected_at: string }[] }`; `savePack(storage, pack)`, `loadPack(storage): SurvivalPack | null`, key `"nadhir.survival.pack"`. Corrupt/missing → null.

- [ ] Failing tests → implement → pass → commit "Add offline Survival Pack persistence"

### Task 5: i18n `survival.*` keys, four locales

**Files:** Modify all four `src/i18n/locales/*.ts`.

Namespace (identical key set in ar/fr/en/kab): `survival.mode`, `enterTitle`, `enterBody`, `enterFetching`, `enterYes`, `enterCancel`, `enterFootnote`, `exit`, `exitConfirm`, `exitBody`, `exitYes`, `pill` ("In danger?"), `interTitle`, `interBody` ({{km}}), `interBasedOn`, `interObservation`, `interEnter`, `interNotHere`, `guidanceLabel`, `guidancePre`, `prepareTitle`, `prepareBody`, `prepareNoInstruction`, `knows`, `fireObserved` ({{km}}, {{bearing}}), `seenAgo` ({{time}}), `closer`, `satellite`, `wind` ({{kmh}}, {{bearing}}), `windToward`, `noFreshData`, `sos`, `sosCall`, `sosFree`, `sosPosition`, `sosCommune`, `sosNearest`, `sosNearestValue` ({{km}}, {{place}}), `sosCoords`, `sosWith`, `sosQueueNote`, `sosQueued` ({{time}}), `checkin`, `checkinIntro`, `checkinOk`, `checkinOkSub`, `checkinAssist`, `checkinAssistSub`, `checkinPreview`, `checkinTo`, `msgOk` ({{place}}, {{coords}}, {{time}}), `msgAssist` (same), `checkinSend`, `checkinNote` (the "no one shown as safe" line), `areas`, `areasIntro`, `areasUnverified`, `areasCriteria`, `areasCriteria1..4`, `areasRefugeNote`, `areasEmpty`, `offline`, `offlineBanner` ({{time}}), `lastKnown`, `packSaved` ({{date}}), `sinceCheck` ({{time}}), `report`, `reportFire`, `reportSmoke`, `reportRoadBlocked`, `reportPersonTrapped`, `bearing.N/NE/E/SE/S/SW/W/NW`, `zoneAlert` ({{km}}, {{place}}), `zoneElsewhere`, `zoneView`, `zoneImHere`.

Copy follows the validated mockups; Arabic from the Arabic artboard; Kabyle follows existing kab.ts vocabulary (flag for native review in PR notes). Nothing directive beyond Standing Guidance wording already approved.

- [ ] Add keys to en, fr, ar, kab → `bun run test src/lib/__tests__/i18n.test.ts` passes → commit "Add survival-mode strings in four languages"

### Task 6: Open areas data + hazard report kind (migration + lib + seed)

**Files:** Create `supabase/migrations/20260829100000_<uuid>.sql`, `src/lib/open-areas.ts`, `scripts/seed-open-areas.ts`. Modify `src/lib/reports.ts` (add `kind`).

Migration:

```sql
create table public.open_areas (
  id uuid primary key default gen_random_uuid(),
  osm_type text,
  osm_id bigint,
  unique (osm_type, osm_id),
  name text not null,
  name_ar text,
  area_type text not null check (area_type in ('stadium','pitch','schoolyard','parking','square','beach')),
  lat double precision not null,
  lon double precision not null,
  commune_id uuid references public.admin_units(id),
  source text not null default 'osm',
  created_at timestamptz not null default now()
);
alter table public.open_areas enable row level security;
create policy "open areas are public" on public.open_areas for select using (true);

alter table public.citizen_reports add column kind text not null default 'sighting'
  check (kind in ('sighting','road_blocked','person_trapped'));

-- Hazard asymmetry (CONTEXT.md): hazard reports may show unmoderated, through safe columns only.
create view public.hazard_reports with (security_invoker = off) as
  select id, kind, sighting, lat, lon, observed_at, created_at, status
  from public.citizen_reports
  where status in ('pending','approved');
grant select on public.hazard_reports to anon, authenticated;
```

`open-areas.ts`: `type OpenArea` mirroring the table; `openAreasQuery` via `fetchAllPages`; `hazardReportsQuery` selecting last 24 h from the view. Seed script: Overpass query per north-Algeria bbox for `leisure=stadium|pitch`, `amenity=school` (yard), `landuse=recreation_ground`, `amenity=parking` (surface), inserts with nearest commune id; runnable `bun run scripts/seed-open-areas.ts`; reads credentials like `scripts/seed-geo.ts` does.

- [ ] Write migration (uuid via `uuidgen`), lib, seed script; typecheck; commit "Add open_areas, report kinds and safe-columns hazard view"

### Task 7: `/survival` routes + chrome suppression

**Files:** Create `src/routes/survival/route.tsx` (layout), `index.tsx` (hub), `sos.tsx`, `checkin.tsx`, `areas.tsx`. Modify `src/routes/__root.tsx`.

- `__root.tsx` RootComponent: `useRouterState` pathname; when it starts with `/survival`, render `<main><Outlet/></main>` only (no header/footer/tabs).
- Layout `route.tsx`: survival header (red dot + `survival.mode` + online/offline state via `navigator.onLine` listener + freshest cluster age), offline amber banner when offline (`survival.offlineBanner` with pack age), Exit button (confirm dialog → clear `SURVIVAL_ACTIVE_KEY`, navigate `/`), `EmergencyNumbers compact` footer, `<Outlet/>`.
- Hub `index.tsx`: on mount if `SURVIVAL_ACTIVE_KEY` unset show entry confirm sheet (`enterTitle/Body/Yes/Cancel`; Yes: set key, request geolocation, refresh pack; Cancel: history back). Active hub: Standing Guidance primary card (`prepareTitle/Body/NoInstruction`, shield icon, pre-approved label); "what Nadhir knows" facts from `nearestThreat` + geolocation (fire distance/bearing/age chip via `relativeTime`, closing note; wind from cluster fields) with `noFreshData` state when offline/no data (pack fallback, `lastKnown` label); since-last-check strip (new clusters + hazard reports count since stored `nadhir.survival.lastCheck` timestamp); actions: SOS emergency button (link `/survival/sos`), Check-in + Open areas half buttons; report chips linking `/report?kind=...`.
- `sos.tsx`: Position Card rows from `positionCard` (geolocation; pack fallback); tel: buttons 14 (primary emergency solid), 1070, 112; amber `sosQueueNote`; on tapping call while offline → `enqueueSos`; queued entries listed with `sosQueued` label.
- `checkin.tsx`: two option cards (ok / assist, selected state), message preview from `checkInMessage`, send via `navigator.share` fallback `sms:?body=`; `checkinNote` footer.
- `areas.tsx`: `openAreasQuery` sorted by haversine from position, rows name + type + km + bearing label; `areasUnverified` banner; criteria card (`areasCriteria1..4`, `areasRefugeNote`); `areasEmpty` state when table empty. No map, no routing.
- All styling via existing tokens/utilities (card, tabular, emergency vars, risk tints), lucide icons, mockup hierarchy.

- [ ] Implement, verify in dev (`bun run dev` + curl / browser smoke), typecheck, lint → commit "Add chrome-less /survival hub, SOS, check-in and open-areas routes"

### Task 8: Home entry points

**Files:** Modify `src/routes/index.tsx`.

- Pill: absolute bottom-right inside map section, emergency-outline rounded button `survival.pill` → navigates `/survival` (confirm sheet handles the rest). Always rendered.
- Interstitial: on mount, `navigator.permissions.query({name:"geolocation"})`; only if `granted` get position; if `nearestThreat` ≤ `SURVIVAL_AUTO_KM` and cluster state `active` and `sessionStorage["nadhir.survival.dismissed"]` unset and survival not active → full-screen fixed overlay (`interTitle`, `interBody` with km, based-on/observation rows with ages, `interEnter` → set active + navigate, `interNotHere` → sessionStorage dismiss).
- Zone banner: `useQuery(alertsQuery)`; unread `kind==="fire"` alert → emergency-surface banner above the rail (`zoneAlert` with distance/place from alert row, `zoneElsewhere`, buttons `zoneView` → `/fire/$id` via payload.short_id, `zoneImHere` → `/survival`). Never auto-enters.

- [ ] Implement, typecheck, lint, browser smoke → commit "Add survival entry points to the live map: pill, position interstitial, zone banner"

### Task 9: Report kind wiring

**Files:** Modify `src/routes/_authenticated/report.tsx` (accept `kind` search param; for `road_blocked`/`person_trapped` preset kind + sighting "other" and show a kind chip; pass kind to `createReport`), `src/lib/reports.ts` (`kind` on types + insert), `src/routes/_authenticated/moderation.tsx` (show kind chip when not `sighting`).

- [ ] Implement, typecheck, lint → commit "Carry hazard kind through citizen reports"

### Task 10: Offline shell

**Files:** Create `public/sw.js`; modify `src/routes/__root.tsx` (register when `import.meta.env.PROD`), `public/site.webmanifest` (add `/survival` shortcut).

`sw.js`: versioned cache; install: `caches.open(V)`; fetch handler: `/assets/` cache-first; navigations under `/survival` network-first with cache fallback (cache successful responses); everything else pass-through. Hub saves the pack (`savePack`) whenever position + data resolve.

- [ ] Implement, typecheck, lint → commit "Cache the survival shell for offline use"

### Task 11: Docs + canvas copy

**Files:** Modify `roadmap.md` (P12 row), `GAPS.md` (new §3 items: seed not run on live, migration unapplied, quick reports auth-gated, no recorded audio, SW scope), mockup canvas SOS/footer numbers → 14 / 1070 / 112, republish artifact.

- [ ] Update docs → commit "Record survival mode in roadmap and gaps"
- [ ] Fix canvas numbers, re-seed, republish same artifact URL

### Task 12: Full gates

- [ ] `bunx tsc --noEmit` clean; `bun run test` all green; `bun run lint` clean; `bunx prettier --check` on touched files (write if needed)
- [ ] `git status` clean; summarize branch for owner (push/PR is owner-gated)

## Self-review

Spec coverage: ADR invariants (Tasks 5/7 copy), entry flow incl. zone≠position (Task 8), hub/SOS/check-in/areas (Task 7), offline pack + SW (Tasks 4/10), hazard asymmetry via safe view (Task 6), i18n ×4 (Task 5), docs (Task 11). Deferred deliberately (recorded in GAPS): recorded audio guidance, battery mode beyond text-first UI, all-clear report buttons, server SOS inbox (YAGNI — unmonitored), public map layer for hazard reports.
