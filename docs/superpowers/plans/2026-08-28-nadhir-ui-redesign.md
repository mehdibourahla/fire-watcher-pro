# Nadhir UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Nadhir's entire presentation layer across all routes with a validated token system, a new component vocabulary, and honest data states — and fix the three constraint defects that make the new screens render seed data.

**Architecture:** A rewritten `styles.css` supplies chrome and hazard tokens for both themes. A new `src/components/nadhir/` directory holds the design primitives every route composes from. The map becomes a full-bleed ground layer with a sheet/rail over it. Routes are rewritten to consume primitives rather than ad-hoc `.panel` divs.

**Tech Stack:** TanStack Start, React 19, Tailwind CSS 4, MapLibre GL 6, recharts 2, i18next, Supabase JS 2, vitest (added).

## Global Constraints

- Zero comments and zero docstrings unless a non-obvious _why_ — one short line.
- Every user-facing string goes through i18next. No hardcoded copy in components.
- Danger level never communicated by colour alone: numeral + name + icon always.
- Hazard solids only on marks ≥8px. Chips use tint background + same-hue ink.
- Dark mode has its own token steps, never an inversion.
- All four locales (ar, fr, en, kab) keep exact key parity; ar is default and RTL.
- Western Arabic numerals (0–9) in every locale.
- Tabular numerals wherever digits align.
- `prefers-reduced-motion` disables pulse and sheet animation.
- Emergency numbers 14 / 1070 / 112 remain `tel:` links.

---

### Task 1: Token system

**Files:**

- Modify: `src/styles.css` (full rewrite of the token blocks)

**Interfaces:**

- Produces: CSS custom properties `--ground --surface --raised --border --ink --ink-soft --ink-faint --accent --risk-1..5 --risk-tint-1..5 --risk-ink-1..5 --emergency`, and Tailwind theme bindings for each.

- [ ] **Step 1:** Replace `:root` and `.dark` blocks with the chrome and hazard values from the design spec's colour tables.
- [ ] **Step 2:** Add `--risk-tint-N` and `--risk-ink-N` for the chip pattern in both themes.
- [ ] **Step 3:** Bind every token in `@theme inline` so Tailwind utilities resolve.
- [ ] **Step 4:** Verify `bun run build` compiles CSS without unresolved-variable errors.

---

### Task 2: Risk primitives

**Files:**

- Create: `src/components/nadhir/DangerScale.tsx`
- Create: `src/components/nadhir/RiskChip.tsx`
- Delete: `src/components/DangerDial.tsx`
- Test: `src/lib/__tests__/risk.test.ts`

**Interfaces:**

- Consumes: `dangerLevelKey`, `levelFromFwi` from `src/lib/nadhir.ts`.
- Produces:
  - `DangerScale({ level, fwi?, size?: "sm"|"md"|"lg", guidance?: boolean, caption?: string })`
  - `RiskChip({ level, showName?: boolean })`

- [ ] **Step 1: Write the failing test** for `levelFromFwi` boundaries.

```ts
import { describe, expect, it } from "vitest";
import { levelFromFwi } from "@/lib/nadhir";

describe("levelFromFwi", () => {
  it("maps EFFIS thresholds from ORIGINAL-SPEC 9.1", () => {
    expect(levelFromFwi(0)).toBe(1);
    expect(levelFromFwi(11.1)).toBe(1);
    expect(levelFromFwi(11.2)).toBe(2);
    expect(levelFromFwi(21.3)).toBe(3);
    expect(levelFromFwi(38)).toBe(4);
    expect(levelFromFwi(50)).toBe(5);
  });
});
```

- [ ] **Step 2:** Run `bunx vitest run` — expect FAIL (no vitest configured yet).
- [ ] **Step 3:** Add vitest to devDependencies, add `"test": "vitest run"` script, add `vitest` config to `vite.config.ts`.
- [ ] **Step 4:** Run `bun run test` — expect PASS.
- [ ] **Step 5:** Build `DangerScale` — gradient track across the five tokens, marker at the level, hero numeral in Fraunces, level name, and `risk.guidance.{level}` sentence above supporting detail.
- [ ] **Step 6:** Build `RiskChip` — `--risk-tint-N` background, `--risk-ink-N` text, icon plus numeral plus optional name.
- [ ] **Step 7:** Delete `DangerDial.tsx` and update every import site.

---

### Task 3: Layout and state primitives

**Files:**

- Create: `src/components/nadhir/StatCard.tsx`
- Create: `src/components/nadhir/states.tsx`
- Create: `src/components/nadhir/DetectionStrip.tsx`
- Create: `src/components/nadhir/SourceHealth.tsx`

**Interfaces:**

- Produces:
  - `StatCard({ label, value, sub?, tone?: "default"|"emergency" })`
  - `Skeleton({ className })`, `EmptyState({ title, body, action? })`, `ErrorState({ title, body, onRetry })`
  - `DetectionStrip({ detections, className })`
  - `SourceHealth({ source })`

- [ ] **Step 1:** `StatCard` — label in `--ink-faint`, value in Fraunces with tabular numerals, optional sub-line.
- [ ] **Step 2:** `states.tsx` — skeleton uses `animate-pulse` on `--raised`; empty and error states take i18n keys only.
- [ ] **Step 3:** `DetectionStrip` — one dot per detection positioned by time, filled by source, with a legend. Never colour-only: legend carries source names.
- [ ] **Step 4:** `SourceHealth` — status dot plus localised state, relative age, and note.

---

### Task 4: Map ground and sheet

**Files:**

- Modify: `src/components/FireMap.tsx` (rewrite)
- Create: `src/components/nadhir/DetailSheet.tsx`
- Modify: `src/components/MapCanvas.tsx`

**Interfaces:**

- Produces:
  - `FireMap({ clusters, selectedShortId, onSelect, center?, zoom?, layers })`
  - `DetailSheet({ open, onClose, children })` — bottom sheet under `lg`, right rail at `lg` and up.
  - `LayerState = { fires: boolean; risk: boolean; unverified: boolean; wind: boolean }`

- [ ] **Step 1:** Rewrite `FireMap` so the map fills its container, markers size by `est_area_ha` in three buckets and colour by state.
- [ ] **Step 2:** Confidence below 0.6 renders at 50% opacity with a dashed ring and an "unverified" chip, per §12.3.
- [ ] **Step 3:** Add the layer-toggle control, top-end aligned so it mirrors correctly in RTL.
- [ ] **Step 4:** Build `DetailSheet` with drag-to-dismiss on touch, respecting `prefers-reduced-motion`.

---

### Task 5: App shell

**Files:**

- Modify: `src/components/SiteChrome.tsx` (rewrite)
- Modify: `src/routes/__root.tsx`

**Interfaces:**

- Produces: `SiteHeader`, `BottomTabs`, `EmergencyNumbers`, `RiskLegend`.

- [ ] **Step 1:** Top bar — wordmark, language switcher, auth avatar, degraded-source banner slot.
- [ ] **Step 2:** `BottomTabs` — Map, Forecast, Alerts, Settings; visible below `lg`; mirrors in RTL.
- [ ] **Step 3:** `RiskLegend` — all five levels with numeral, name and swatch.
- [ ] **Step 4:** Confirm focus rings are visible on every interactive element.

---

### Task 6: Public routes

**Files:**

- Modify: `src/routes/index.tsx`, `forecast.tsx`, `fire.$id.tsx`, `history.tsx`, `status.tsx`, `about.tsx`, `developers.tsx`
- Modify: `src/lib/nadhir.ts` (add `historyClustersQuery`)

**Interfaces:**

- Produces: `historyClustersQuery` — unbounded by time, paginated, ordered by `first_detected_at` desc.

- [ ] **Step 1:** `/` — map ground, sheet/rail, layer toggle, today summary using `DangerScale`, cluster list sorted by distance-to-settlement, empty state.
- [ ] **Step 2:** `/forecast` — commune search, `DangerScale` per horizon d0–d5, guidance sentence first.
- [ ] **Step 3:** `/fire/:id` — status sentence, `DetectionStrip`, wind and spread bearing, nearest settlements, CTAs.
- [ ] **Step 4:** `/history` — swap `clustersQuery` for `historyClustersQuery`, recharts monthly bar and cumulative area line, CSV export over the full filtered set.
- [ ] **Step 5:** `/status` — `SourceHealth` rows.
- [ ] **Step 6:** `/about` — remove the EFFIS attribution until that source is contacted.

---

### Task 7: Authenticated routes

**Files:**

- Modify: `src/routes/_authenticated/{alerts,zones,settings,report,moderation,team,webhooks}.tsx`

- [ ] **Step 1:** `/alerts` — severity stripe using `RiskChip`, unread state, link to fire. Fix the `var(var(--risk-N))` double-wrap bug at `alerts.tsx:123`.
- [ ] **Step 2:** `/zones` — map picker, radius slider, per-zone toggles, 10-zone limit enforced client-side with an i18n message.
- [ ] **Step 3:** `/settings` — channel toggles, quiet hours, language, `min_danger_level`.
- [ ] **Step 4:** `/report` — three-step flow with progress, geolocation, photo, confirm.
- [ ] **Step 5:** `/moderation`, `/team`, `/webhooks` — dense desktop tables, localised strings, LTR layout per §12.8.

---

### Task 8: Blocking data fixes

**Files:**

- Modify: `src/lib/ingest/weather.server.ts:6`
- Modify: `src/lib/ingest/eumetsat.server.ts:126`
- Modify: `src/lib/ingest/fusion.server.ts:43`
- Modify: `src/lib/ingest/firms.server.ts:111-114`
- Test: `src/lib/__tests__/ingest.test.ts`

**Interfaces:**

- Consumes: the `CHECK` constraints in `supabase/migrations/20260828131723_*.sql`.

- [ ] **Step 1: Write the failing test** asserting every emitted literal is inside its constraint.

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("emitted literals satisfy DB CHECK constraints", () => {
  it("risk_forecasts.source", () => {
    expect(read("src/lib/ingest/weather.server.ts")).toMatch(
      /SOURCE = "local_fwi"/,
    );
  });
  it("detections.source", () => {
    expect(read("src/lib/ingest/eumetsat.server.ts")).toMatch(/source: "fci"/);
  });
  it("fire_clusters.state", () => {
    const src = read("src/lib/ingest/fusion.server.ts");
    expect(src).not.toMatch(/"resolved"/);
    expect(src).toMatch(/"extinguished"/);
  });
});
```

- [ ] **Step 2:** Run `bun run test` — expect FAIL on all three.
- [ ] **Step 3:** Apply the three literal changes.
- [ ] **Step 4:** Make the four discarded upsert errors throw, and check the cluster-update error.
- [ ] **Step 5:** Run `bun run test` — expect PASS.

---

### Task 9: Verification

- [ ] **Step 1:** `bunx tsc --noEmit` clean.
- [ ] **Step 2:** `bun run lint` clean.
- [ ] **Step 3:** `bun run test` green.
- [ ] **Step 4:** `bun run build` succeeds.
- [ ] **Step 5:** Dev server up; every route rendered at 390px and 1440px.
- [ ] **Step 6:** Full pass in `ar` confirming RTL mirroring on every route.
- [ ] **Step 7:** Re-run the dataviz palette validator on the final token values.
