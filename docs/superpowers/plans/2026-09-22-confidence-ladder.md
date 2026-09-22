# Confidence Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every situation carries a confidence level (official, corroborated, single, model), a satellite fire becomes a Probable fire only with context, and a bare heat signal is never pushed to the public.

**Architecture:** A pure `fireLevel` decides heat signal / probable / confirmed from the fire's stage and a context (commune forest fraction, today's danger level, a nearby citizen sighting). A server helper gathers that context in bulk for both push paths; the map computes it from data it already loads. Push gating applies to new broadcast threads and "new" zone alerts; open threads keep updating, and the zone "urgent" tier (settlement downwind) is not gated.

**Tech Stack:** TypeScript, Vitest, Supabase JS.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-22-incident-lifecycle-and-map.md`, sub-project 3.
- Thresholds (measured 2026-09-22): forest fraction ≥ 0.10 keeps 54 of 59 DGPC incidents located to a commune and drops 160 of 223 unconfirmed detected fires; extreme danger = `danger_level` 5; citizen sighting within 5 km and 6 h before the last look.
- "Confirmed" stays reserved for an official source (CONTEXT.md).
- Gates: `bunx tsc --noEmit`, `bun run test`, `bun run lint`.

---

### Task 1: `fire-confidence.ts`

**Files:** Create `src/lib/fire-confidence.ts`, `src/lib/__tests__/fire-confidence.test.ts`

**Interfaces — Produces:**
`type FireLevel = "heat_signal" | "probable" | "confirmed"`;
`type FireContext = { forestFraction: number | null; dangerLevel: number | null; nearbySighting: boolean }`;
`fireLevel(stage: "candidate" | "detected" | "confirmed", ctx: FireContext): FireLevel`;
`hasSightingNear(fire: {lat; lon; last_detected_at}, reports: {kind; lat; lon; observed_at; status}[]): boolean`;
`type Confidence = "official" | "corroborated" | "single"`;
`fireConfidence(level: FireLevel): Confidence`.

- [ ] Failing tests: candidate is a heat signal whatever the context; detected without context is a heat signal; forest 0.10, danger 5 or a sighting each make it probable, forest 0.099 and danger 4 do not; confirmed stays confirmed without context; sighting rules (radius, window, rejected, road reports ignored).
- [ ] Implement; pass; commit.

### Task 2: Map situations carry confidence

**Files:** Modify `src/lib/civil-map.ts` (`buildSituations` input `danger?: ReadonlyMap<string, number>`, `Situation.confidence`, satellite `level`), `src/routes/index.tsx` (pass today's danger), `src/components/nadhir/CivilSituation.tsx` (satellite label), `src/i18n/locales/*` (`civilMap.heatSignal`, `civilMap.probable`); tests in `civil-map.test.ts`, `CivilSituation.test.tsx`.

- [ ] Failing tests: official DGPC and ONM are `official`, media-tier DGPC, citizen and ITA are `single`; a detected fire in a 0.4-forest commune is `corroborated` with level `probable`, in a desert commune `single` with level `heat_signal`; the card says "Signal thermique" / "Feu probable".
- [ ] Implement; pass; commit.

### Task 3: Push gate

**Files:** Create `src/lib/ingest/fire-context.server.ts`; modify `src/lib/broadcast-rules.ts` (`planFireBroadcast` gains `eligible: boolean`), `src/lib/ingest/broadcast.server.ts`, `src/lib/alerts-engine.server.ts`; tests in `src/lib/__tests__/broadcast-rules*.test.ts`, new `fire-context.test.ts`.

- [ ] Failing tests: no initial or reopened thread for an ineligible fire; an open thread still updates, ends and cancels; zone "new" alert skipped for a heat signal, "urgent" still raised; context helper maps forest, today's danger and sightings per cluster and throws on query errors.
- [ ] Implement; pass all gates; commit.

### Task 4: Glossary

**Files:** Modify `CONTEXT.md`

- [ ] Add **Heat signal** and **Probable fire**; Detected stays the internal two-look bar and its user-facing wording becomes "heat signal"; push rule updated.
- [ ] Commit; push; PR stacked on sub-project 2.
