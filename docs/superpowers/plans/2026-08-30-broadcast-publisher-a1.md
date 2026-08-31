# Broadcast Publisher (AMBER slice A1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CAP → broadcast publisher: on each detection-pipeline run, open, update, and observation-honestly close Broadcast Alerts for confirmed fire clusters, relay ONM Severe+ vigilance rows, under a per-commune daily rate limit, a global kill-switch, and an append-only audit log. No delivery yet (FCM is A2, Telegram is A4) — A1 produces the durable rows every channel will render.

**Architecture:** Pure decision logic (`broadcast-rules.ts`: polygon targeting, lifecycle planning, rate limiting) and pure copy assembly (`broadcast-copy.ts`) feed a thin orchestrator (`ingest/broadcast.server.ts`) hooked at the end of `runDetectionPipeline`. One CAP object per fire message (ADR-0004), chained `Alert → Update/Cancel` with fresh identifiers via CAP `references` (never reusing an identifier — the `cap_alerts` unique-identifier upsert would silently drop an update; the publisher therefore uses plain inserts). ONM relays reference the authority's own `onm_vigilance` row and compose no Nadhir CAP (verbatim relay, CONTEXT.md Instruction invariant).

**Tech Stack:** TypeScript, Supabase (postgres + supabase-js admin client), vitest. No new dependencies.

## Global Constraints

- Copied from roadmap A1: trigger = confirmed clusters (state `active`, confidence ≥ 0.6 = `MIN_CONFIDENCE` from `alerts-rules.ts`) and ONM Severe+; targeting = containing commune + ~15 km polygon ring; updates extend pure-downwind; lifecycle initial → update → observation-honest end; per-commune daily rate limit; global kill-switch; append-only audit log.
- CAP lifecycle: msgType `Alert` for the initial, `Update`/`Cancel` with fresh identifiers chained via `references`. Never reuse an identifier.
- Doctrine (maquette sticky notes, approved): end copy is "no detections for 12 h", never all-clear; no danger-level broadcasts; ONM relayed verbatim with source + timestamps; Standing Guidance instruction lines are pre-approved text only.
- Approved AR copy comes verbatim from maquette artboard "3 · Push lifecycle"; FR/EN translated to match; KAB best-effort, flagged for the pending Kabyle review.
- Parameters fixed by this plan: `BROADCAST_END_AFTER_HOURS = 12` (maquette); `BROADCAST_RING_KM = 15` (roadmap); `BROADCAST_DAILY_COMMUNE_LIMIT = 6` fire messages per commune per Algiers day. Exempt from the limit: `end`/`cancel` phases (a thread must always close), `Extreme` severity (an emergency escalation must never be muted by our own throttle), and ONM relays (muting an authority's official warning with our spam guard would be worse than the spam; volume is bounded at one message per CAP row).
- Severity: `Extreme` when `nearest_settlement_km ≤ SETTLEMENT_EMERGENCY_KM (5)`, else `Severe` ("severity by settlement proximity" — plain proximity, deliberately not the downwind-gated R3 rule, which stays per-user in alerts-engine).
- Kill-switch and audit tables get **no** anon/authenticated read policies in A1 — the admin surface is A6. `broadcasts` is public-read (A5's accountless banner reads it).
- CI gates (from `.github/workflows/ci.yml`): `bunx tsc --noEmit`, `bun run test`, `bun run lint`. Merging to main deploys and `db push`es migrations to prod — the PR waits for Mehdi's OK.
- Load `supabase:supabase-postgres-best-practices` before writing the migration.
- Zero comments except non-obvious whys. Commits 1–2 lines, no attribution trailers.

## File Structure

- Create `supabase/migrations/20260830090000_<uuid>.sql` — `broadcasts`, `broadcast_audit` (+ immutability trigger), `broadcast_settings` singleton, `cap_alerts.cap_references` column.
- Modify `src/integrations/supabase/types.ts` — hand-add the three tables and the new column (established repo pattern).
- Modify `src/lib/cap.ts` — widen `CapAlert` to `Alert|Update|Cancel` + optional `references`; add `buildBroadcastCap` / `broadcastCapIdentifier`; emit `<references>` in XML.
- Create `src/lib/broadcast-rules.ts` — constants; `pointInMultiPolygon`, `kmToMultiPolygon`, `targetCommunes`, `downwindAdditions`, `fireSeverity`, `planFireBroadcast`, `applyDailyLimit`.
- Create `src/lib/broadcast-copy.ts` — 4-locale copy, localized compass words, `broadcastTexts(phase, locale→CapText[])`.
- Create `src/lib/ingest/broadcast.server.ts` — `publishBroadcasts()` orchestrator.
- Modify `src/lib/ingest/pipeline.server.ts` — call publisher after wind enrichment; `recordRun("broadcast", …)`.
- Tests: `src/lib/__tests__/broadcast-rules.test.ts`, `src/lib/__tests__/broadcast-copy.test.ts`, additions to `src/lib/__tests__/cap.test.ts`.

---

### Task 1: Schema — broadcasts, audit, kill-switch, CAP references

**Files:**
- Create: `supabase/migrations/20260830090000_<fresh uuid4>.sql`
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces tables `broadcasts`, `broadcast_audit`, `broadcast_settings`, column `cap_alerts.cap_references text`. Later tasks use supabase-js typed access to all three.

- [ ] **Step 1: Load `supabase:supabase-postgres-best-practices`, then write the migration**

```sql
-- A1 broadcast publisher: public lifecycle rows, append-only audit, kill-switch.
create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fire','onm')),
  phase text not null default 'initial' check (phase in ('initial','update','end','cancel')),
  cluster_id uuid references public.fire_clusters(id) on delete set null,
  onm_vigilance_id uuid references public.onm_vigilance(id) on delete set null,
  cap_alert_id uuid references public.cap_alerts(id) on delete set null,
  severity text not null check (severity in ('Extreme','Severe')),
  commune_codes text[] not null,
  created_at timestamptz not null default now(),
  check ((kind = 'fire' and cluster_id is not null)
      or (kind = 'onm' and onm_vigilance_id is not null))
);
create index idx_broadcasts_cluster on public.broadcasts (cluster_id, created_at desc);
create index idx_broadcasts_created on public.broadcasts (created_at desc);
create unique index idx_broadcasts_onm_once on public.broadcasts (onm_vigilance_id) where kind = 'onm';

create table public.broadcast_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  action text not null check (action in ('published','suppressed')),
  reason text not null,
  kind text,
  cluster_id uuid,
  onm_vigilance_id uuid,
  phase text,
  severity text,
  commune_codes text[],
  payload jsonb
);
create index idx_broadcast_audit_at on public.broadcast_audit (at desc);

-- append-only is a stated property of the log, not a convention: block rewrites
-- even for service_role, which bypasses RLS
create function public.broadcast_audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'broadcast_audit is append-only';
end $$;
create trigger broadcast_audit_no_rewrite
  before update or delete on public.broadcast_audit
  for each row execute function public.broadcast_audit_immutable();

create table public.broadcast_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.broadcast_settings (id, enabled) values (true, true);

alter table public.cap_alerts add column cap_references text;

grant select on public.broadcasts to anon, authenticated;
grant all on public.broadcasts, public.broadcast_audit, public.broadcast_settings to service_role;

alter table public.broadcasts enable row level security;
alter table public.broadcast_audit enable row level security;
alter table public.broadcast_settings enable row level security;

create policy "public read broadcasts" on public.broadcasts
  for select to anon, authenticated using (true);
```

- [ ] **Step 2: Hand-add the tables to `types.ts`** following the exact Row/Insert/Update shape of the `onm_vigilance` entry (alphabetical key order within each block; keep `Relationships` arrays matching neighbors' style if present). Add `cap_references: string | null` to the three `cap_alerts` blocks.

- [ ] **Step 3: Verify** `bunx tsc --noEmit` passes.

- [ ] **Step 4: Commit** `feat: broadcast tables — lifecycle rows, append-only audit, kill-switch`

### Task 2: CAP broadcast builder (Update/Cancel + references)

**Files:**
- Modify: `src/lib/cap.ts`
- Test: `src/lib/__tests__/cap.test.ts`

**Interfaces:**
- Produces: `broadcastCapIdentifier(shortId: string, seq: number): string` → `nadhir-brd-<shortId>-<seq>`; `type BroadcastPhase = "initial"|"update"|"end"|"cancel"`; `buildBroadcastCap(input: BroadcastCapInput): CapAlert`; `CapAlert.msgType` widened to `"Alert"|"Update"|"Cancel"`, optional `references?: string`.

```ts
export type BroadcastPhase = "initial" | "update" | "end" | "cancel";

export type BroadcastCapInput = {
  shortId: string;
  seq: number;
  phase: BroadcastPhase;
  lat: number;
  lon: number;
  severity: "Extreme" | "Severe";
  confidence: number;
  areaDesc: string;
  sentAt: Date;
  texts: CapText[];
  references: { identifier: string; sent: string }[];
};
```

- [ ] **Step 1: Write failing tests** in `cap.test.ts`: initial → msgType `Alert`, identifier `nadhir-brd-DZ7K4A-1`, no references; update seq 2 with one reference → msgType `Update`, `references === "alerts@nadhir.app,nadhir-brd-DZ7K4A-1,<sent>"`; cancel → msgType `Cancel`, urgency `Past`; end phase (`"end"`) → msgType `Update`, urgency `Past`, expires 24 h after sent; `capToXml` includes `<references>` element only when set; severity flows through (`Extreme` input → `Extreme` in every info block); update urgency `Immediate` when Extreme else `Expected`.

- [ ] **Step 2: Run** `bun run test src/lib/__tests__/cap.test.ts` — expect FAIL (missing exports).

- [ ] **Step 3: Implement.** msgType map: initial→`Alert`, update/end→`Update`, cancel→`Cancel`. Urgency: end/cancel→`Past`; else `Immediate` if severity `Extreme` else `Expected`. Certainty: cancel→`Unlikely`, end→`Possible`, else existing `confidence >= 0.8 ? Observed : Likely`. Expires: end/cancel → sent + 24 h, else the existing 180 min. `references` string = space-separated `sender,identifier,sent` triples. Circle radius = 15 (`BROADCAST_RING_KM`, hardcode via parameter `radiusKm` if cleaner — keep the existing `FireCapInput` path untouched).

- [ ] **Step 4: Run tests — PASS.** Then `bunx tsc --noEmit` (alerts-engine still compiles against the widened type).

- [ ] **Step 5: Commit** `feat: CAP broadcast builder with Update/Cancel chaining via references`

### Task 3: Targeting + lifecycle rules (pure)

**Files:**
- Create: `src/lib/broadcast-rules.ts`
- Test: `src/lib/__tests__/broadcast-rules.test.ts`

**Interfaces:**
- Consumes: `downwindOf`, `MIN_CONFIDENCE`, `SETTLEMENT_EMERGENCY_KM` from `@/lib/alerts-rules`; `bearingBetween`, `haversineKm` from `@/lib/nadhir`.
- Produces:

```ts
export const BROADCAST_RING_KM = 15;
export const BROADCAST_END_AFTER_HOURS = 12;
export const BROADCAST_DAILY_COMMUNE_LIMIT = 6;

export type CommuneShape = {
  code: string;
  lat: number;   // centroid, downwind checks
  lon: number;
  geom: { type: "Polygon" | "MultiPolygon"; coordinates: unknown } | null;
};

export function pointInMultiPolygon(lat: number, lon: number, geom: CommuneShape["geom"]): boolean;
export function kmToMultiPolygon(lat: number, lon: number, geom: CommuneShape["geom"]): number; // Infinity when geom null, 0 inside
export function targetCommunes(fire: { lat: number; lon: number; communeCode: string | null }, communes: CommuneShape[]): string[];
  // containing commune first (polygon containment; fallback fire.communeCode when nothing contains), then ring: kmToMultiPolygon ≤ BROADCAST_RING_KM
export function fireSeverity(nearestSettlementKm: number | null): "Extreme" | "Severe";
export function downwindAdditions(fire: { lat: number; lon: number; spreadBearing: number | null }, current: string[], targets: string[], byCode: Map<string, CommuneShape>): string[];
export type FirePlan =
  | { action: "initial"; codes: string[] }
  | { action: "update"; codes: string[]; added: string[] }
  | { action: "end" }
  | { action: "cancel" }
  | null;
export function planFireBroadcast(args: {
  state: string; confidence: number; lastDetectedMs: number; nowMs: number;
  severity: "Extreme" | "Severe";
  open: { phase: string; communeCodes: string[]; severity: string } | null;
  targets: string[]; additions: string[];
}): FirePlan;
export function applyDailyLimit(codes: string[], sentToday: Map<string, number>, exempt: boolean): { allowed: string[]; dropped: string[] };
```

- [ ] **Step 1: Write failing tests.** Geometry: unit square MultiPolygon around (36.7, 4.3)±0.1° — containment inside/outside; `kmToMultiPolygon` ≈ 0 inside, ~11 km for a point 0.1° lat south of the edge (assert 10–12.5 range), Infinity for null geom. `targetCommunes`: containing + a commune whose polygon edge is ~8 km away included, one ~25 km away excluded; fallback to `communeCode` when no polygon contains the point. `fireSeverity`: 4.9 → Extreme, 5.1/null → Severe. `downwindAdditions`: fire spreading east (90°): commune due east added, commune due west not; `spreadBearing null` → no additions. `planFireBroadcast` table: no open + active + conf 0.7 → initial; no open + conf 0.5 → null; no open + state unconfirmed → null; open initial + last detection 13 h ago → end; open + state false_positive → cancel; open Severe + severity Extreme → update (escalation, `added: []`); open + additions → update with union codes; open phase `end` + active again → initial (new thread); open, no change → null. `applyDailyLimit`: under limit passes, at limit drops with `dropped`, `exempt: true` never drops.

- [ ] **Step 2: Run** `bun run test src/lib/__tests__/broadcast-rules.test.ts` — FAIL.

- [ ] **Step 3: Implement.** Ray-casting per ring (outer minus holes) as in `geo.ts:pointInRing`; distance = min point-to-segment over all rings via equirectangular projection (`kx = 111.32·cos(lat)`, `ky = 110.574`). `planFireBroadcast` order: closed thread (`end`/`cancel`) treated as no-open for a re-flare; cancel before end before update. End condition: `nowMs - lastDetectedMs ≥ 12 h` regardless of current state; cancel on `state === "false_positive"`.

- [ ] **Step 4: Run tests — PASS.**

- [ ] **Step 5: Commit** `feat: broadcast targeting and lifecycle rules`

### Task 4: Broadcast copy (4 locales)

**Files:**
- Create: `src/lib/broadcast-copy.ts`
- Test: `src/lib/__tests__/broadcast-copy.test.ts`

**Interfaces:**
- Consumes: `CapText` from `@/lib/cap`; `BroadcastPhase`.
- Produces: `broadcastTexts(phase: BroadcastPhase, vars: BroadcastVars): CapText[]` (4 entries, RFC 3066 tags `ar-DZ`, `fr-DZ`, `en`, `kab` matching alerts-engine).

```ts
export type BroadcastVars = {
  place: string;            // nearest settlement, or commune name
  wilaya: string;
  km: number | null;        // nearest_settlement_km
  bearingDeg: number | null; // spread_bearing_deg
  hotspots: number;         // detection_count
  hours: number;            // BROADCAST_END_AFTER_HOURS
};
```

AR copy verbatim from the approved maquette (initial headline `حريق مؤكد — {{place}}، {{wilaya}}`; body `حريق مؤكد عبر القمر الاصطناعي على بعد نحو {{km}} كلم من {{place}}، يتقدم مع الريح نحو {{bearing}}.`; update `تحديث — حريق {{place}}` / `اتسع الرصد إلى {{hotspots}} نقطة حرارية. اتجاه التقدم نحو {{bearing}}.`; end `حريق {{place}} — لا رصد جديد` / `لم تُرصد نقاط حرارية منذ {{hours}} ساعة. قد تفوت الأقمار الاصطناعية نارًا نشطة — اتبع تعليمات الحماية المدنية.`; cancel `إلغاء تنبيه حريق {{place}}` / `تبيّن أن الرصد قرب {{place}} لم يكن حريقًا نشطًا.`). FR/EN faithful translations; KAB following the existing alerts-engine register (flag for Kabyle review in the PR). Instruction for initial/update = the already-approved `capInstruction` per locale copied from `alerts-engine.server.ts`; empty for end/cancel. Localized 8-point compass words per locale (AR الشمال…, FR le nord…, EN north…, KAB agafa…). When `km` is null, use a no-distance variant (`قرب {{place}}`); when `bearingDeg` is null, omit the drift sentence.

- [ ] **Step 1: Write failing tests:** 4 texts per phase with correct language tags; no unfilled `{{` remains for every phase × locale × (km null / bearing null / both set); AR initial contains the maquette headline; end text contains `12`; instruction empty on end/cancel and non-empty on initial/update.

- [ ] **Step 2: Run — FAIL.** **Step 3: Implement.** **Step 4: Run — PASS.**

- [ ] **Step 5: Commit** `feat: broadcast copy in four locales`

### Task 5: Publisher orchestrator + pipeline hook

**Files:**
- Create: `src/lib/ingest/broadcast.server.ts`
- Modify: `src/lib/ingest/pipeline.server.ts`

**Interfaces:**
- Consumes everything above; `supabaseAdmin`, `fetchAllPages`, `algiersToday`.
- Produces: `publishBroadcasts(): Promise<BroadcastRun>` with `type BroadcastRun = { published: number; suppressed: number; error?: string }`.

- [ ] **Step 1: Implement `publishBroadcasts`** (glue — no unit test, matching the repo's `*.server.ts` pattern; logic lives in Tasks 2–4):
  1. Read `broadcast_settings`; if `enabled === false`, insert one audit row `{action:'suppressed', reason:'kill_switch'}` and return `{published: 0, suppressed: 1}`.
  2. Load fire broadcasts (`kind='fire'`), newest-first; reduce to latest row + total count (`seq`) per cluster.
  3. Candidate clusters = union of (state `active` ∧ confidence ≥ `MIN_CONFIDENCE`) and clusters with an open (`initial`/`update`) broadcast. Select `id, short_id, state, lat, lon, confidence, detection_count, spread_bearing_deg, last_detected_at, nearest_settlement_km, commune_id, wilaya_id` plus nearest settlement name via a second query.
  4. Communes: fetch all `admin_units` commune `id, code, name_ar, name_fr, name_en, name_kab, parent_id, lat, lon` (light); shortlist ids with centroid ≤ 80 km of any candidate; fetch `geom` only for the shortlist (`.in("id", …)` in slices of 50 — geom holds megabytes per page).
  5. Per cluster: `targets = targetCommunes(...)`, `severity = fireSeverity(...)`, `additions = downwindAdditions(...)`, `plan = planFireBroadcast(...)`. Skip null plans.
  6. Rate limit: count today's (`created_at ≥ <algiersToday> 00:00+01:00`) fire `initial`/`update` broadcast rows per commune code; `applyDailyLimit` with `exempt = phase end/cancel || severity Extreme`. Initial with zero allowed codes → audit `suppressed/rate_limit`, skip. Update whose additions all dropped and no escalation → skip silently is wrong — audit `suppressed/rate_limit`.
  7. Publish fire: `buildBroadcastCap` (references = prior `cap_alerts` rows for the cluster with identifier prefix `nadhir-brd-`, ordered by sent); **insert** (not upsert) into `cap_alerts` including `cap_references`; insert `broadcasts` row (end/cancel keep the open row's codes); insert audit `published` row with identifier + dropped codes in payload.
  8. ONM: `onm_vigilance` where severity in (`Severe`,`Extreme`) ∧ `wilaya_id` not null ∧ (`expires` is null or > now) ∧ no existing broadcast (query `broadcasts.onm_vigilance_id`); target codes = communes with `parent_id = wilaya_id`; severity check-constraint-safe (`Extreme`|`Severe`); insert broadcast + audit. No CAP row composed.
  9. Every insert error throws (fail loud); the pipeline hook catches.

- [ ] **Step 2: Hook into `runDetectionPipeline`** after `enrichClusterWinds`, following the fusion pattern: `recordRun("broadcast", startedAt, {status, recordsNew: published, error?})`, catch without rethrow, surface `broadcast` in `PipelineResult`.

- [ ] **Step 3: Verify** `bunx tsc --noEmit && bun run test && bun run lint`.

- [ ] **Step 4: Commit** `feat: broadcast publisher wired into the detection pipeline`

### Task 6: Roadmap tick, lean pass, PR

- [ ] **Step 1:** Tick the A1 checkbox in `roadmap.md`.
- [ ] **Step 2:** Lean re-read of the full diff (YAGNI fields, comment prose, duplicated fixtures) before finalizing.
- [ ] **Step 3:** Branch `feat/broadcast-publisher-a1`, push, open PR titled `Broadcast publisher (A1): CAP lifecycle, targeting, rate limit, kill-switch, audit`; body lists the fixed parameters + exemptions, the Kabyle-review flag, and that audit/settings read surfaces arrive in A6. Present the PR — never merge.

## Self-Review

- Spec coverage: trigger (Task 5.3/5.8), targeting + ring (Task 3), downwind updates (Task 3), lifecycle incl. observation-honest end and Cancel (Tasks 2/3/4), fresh identifiers + references (Task 2), rate limit (Tasks 3/5), kill-switch (Tasks 1/5), append-only audit (Tasks 1/5). ✓
- No placeholders; signatures consistent across tasks. ✓
- Deliberately out of scope: delivery (A2/A4), UI (A3/A5/A6), status row (A7), admin kill-switch toggle (A6 — the row is flipped via SQL until then).
