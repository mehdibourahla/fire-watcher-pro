# Map Grammar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The live map reads as "the day's state at a glance": ONM warnings are wilaya tints in ONM's own colors with a texture per phenomenon, every marker's color says who reports it, heat signals only appear from wilaya zoom, no mixed clusters, and a status line replaces the raw situation count.

**Architecture:** Pure builders produce the GeoJSON and the summary (`civil-map-geometry.ts`, `civil-map.ts`); `FireMap.tsx` only styles by properties. ONM outlines come from a small view (one polygon per wilaya) fetched once per session, not with the 60 s refresh. Badges are pre-drawn per symbol × confidence × selection; textures are canvas patterns added as map images.

**Tech Stack:** MapLibre GL, React, TanStack Query, Supabase view, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-22-incident-lifecycle-and-map.md`, sub-project 4.
- Only an authority gets red; Nadhir's own evidence tops out at orange; single source is grey.
- ONM keeps its own scale: Moderate yellow, Severe orange, Extreme red, as tints only.
- One pulse, for a live probable/confirmed fire within 20 km of an already-granted position; none under `prefers-reduced-motion`.
- Gates: `bunx tsc --noEmit`, `bun run test`, `bun run lint`, `bash scripts/test-db.sh`.

---

### Task 1: ONM outlines view
**Files:** `supabase/migrations/20260922210000_onm_wilaya_outlines.sql`, `supabase/tests/onm_wilaya_outlines.test.sql`, `src/integrations/supabase/types.ts`, `src/lib/nadhir.ts` (`onmOutlinesQuery(wilayaIds)`).
- [ ] pgTAP: one row per wilaya, newest polygon wins, anon can read.
- [ ] View `security_invoker`, `distinct on (wilaya_id)`; query with `staleTime: Infinity`.

### Task 2: Warnings as tints
**Files:** `src/lib/civil-map-geometry.ts`, tests `civil-map-geometry.test.ts`.
- [ ] Failing tests: an ONM situation with an outline yields one Polygon feature carrying `severity`, `event` key (rain/storm/sand/wind/heat/other) and `upcoming`; no ONM point when the outline exists; a point fallback when it does not.
- [ ] Every point feature carries `confidence`.

### Task 3: Styling
**Files:** `src/components/map-symbols.ts`, `src/components/FireMap.tsx`, `src/components/map-patterns.ts` (new), tests `map-symbols.test.ts`.
- [ ] Badge per symbol × confidence × selected; fire features carry `level` and `minor` (heat signal or past live); `minor` fires in a layer with `minzoom` 7; clustering and the `group` symbol removed.
- [ ] Warning fill colors by ONM severity, pattern per event, hatch + dashed outline when upcoming.
- [ ] Pulse circle layer for `pulse` features, animated only without reduced motion.

### Task 4: Status line
**Files:** `src/lib/civil-map.ts` (`situationSummary`), `src/routes/index.tsx`, `src/i18n/locales/*`, tests `civil-map.test.ts`.
- [ ] Failing test: counts confirmed/probable fires, heat signals, wilayas under ONM warning and road items among live/upcoming situations.
- [ ] Header renders the summary instead of "N situations"; legend explains grey/orange/red.

### Task 5: Verify in the browser
- [ ] `bun run dev` against the public read-only data; screenshots at national and wilaya zoom (fr, ar); fix what looks wrong; commit; push; PR stacked on sub-project 3.
