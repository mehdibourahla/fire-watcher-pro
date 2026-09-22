# Incident Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every map situation carries a lifecycle phase (upcoming, live, fading, archived, ended) derived from evidence timestamps, and no surface says a fire ended because a satellite stopped seeing it.

**Architecture:** One pure module computes the phase per source from timestamps and authority facts. Internal DB states (`contained_guess`, `extinguished`) stay: they have ~20 consumers (fusion, admin, public API) and are not user-facing vocabulary. `Situation.ended` is replaced by `Situation.phase`; wording and filters read the phase. The civil agent's validity is clamped per hazard in code because the prompt alone produced 72 h on 20 of 27 road items.

**Tech Stack:** TypeScript, Vitest, React (i18n via react-i18next).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-22-incident-lifecycle-and-map.md`, sub-project 2.
- "Ended" only from an authority or a human operator; silence never produces an end.
- Four locales (ar, fr, en, kab); new kab strings use the French text, as existing untranslated `civilMap` kab strings do.
- Gates: `bunx tsc --noEmit`, `bun run test`, `bun run lint`, prettier.

## Phase rules (the contract every task uses)

| Source | ended | upcoming | live | fading | archived |
|---|---|---|---|---|---|
| Satellite fire | `extinguished` with `resolved_at` (operator) | — | last look < 6 h | 6–24 h | > 24 h (fusion stops attaching evidence) |
| DGPC incident | status `extinguished` | — | last mention < 24 h and still listed | 24–72 h, or unlisted | > 72 h |
| Citizen report | — | — | sighting < 3 h, road < 2 h, trapped < 3 h | until 24 h | > 24 h |
| ITA publication | — | — | before `expires_at` | until source + 72 h | after that, or withdrawn |
| ONM warning | past its own `expires` | onset in the future | onset ≤ now < expires | — | superseded |

Default list/map: upcoming + live; fading when an area is selected; archived + ended only with "include ended and history".

---

### Task 1: `incident-lifecycle.ts`

**Files:** Create `src/lib/incident-lifecycle.ts`, `src/lib/__tests__/incident-lifecycle.test.ts`

**Interfaces — Produces:**
`type Phase = "upcoming" | "live" | "fading" | "archived" | "ended"`;
`firePhase(fire: Pick<FireCluster,"state"|"last_detected_at"|"resolved_at">, now: number): Phase`;
`officialPhase(i: Pick<OfficialIncident,"status"|"last_reported_at"|"unlisted_at">, now): Phase`;
`reportPhase(r: Pick<HazardReport,"kind"|"observed_at">, now): Phase`;
`publicationPhase(p: Pick<CivilPublication,"state"|"expires_at"|"source_published_at">, now): Phase`;
`warningPhase(w: Pick<OnmVigilance,"onset"|"expires"|"superseded_at">, now): Phase`;
`civilLeaseHours(hazard: CivilHazard): number` (road 2, fire 3, flood 6, weather 6, other 6);
`isVisibleByDefault(phase)`.

- [ ] Table-driven failing tests for every row above, each boundary on both sides, a fading fire revived by a newer `last_detected_at`, a timer-`extinguished` fire staying archived (never ended), unparseable timestamps → archived.
- [ ] Implement; tests pass; commit.

### Task 2: Situations carry a phase

**Files:** Modify `src/lib/civil-map.ts`, `src/lib/civil-publication-client.ts`, `src/components/FireMap.tsx`, `src/lib/nadhir.ts` (`FireCluster.resolved_at`); tests `src/lib/__tests__/civil-map.test.ts`

- [ ] Failing tests: `buildSituations` sets `phase` per source; `filterSituations` shows fading only with an area selected, archived/ended only with `showEnded`; a satellite fire silent 30 h is `archived`, not `ended`.
- [ ] Replace `ended` with `phase` in `SituationBase`, both functions and every consumer; default publication query fetches published items with `source_published_at` in the last 72 h instead of only unexpired ones; FireMap's `ended` style becomes `phase` archived/ended.
- [ ] Tests pass; commit.

### Task 3: Honest wording

**Files:** Modify `src/components/nadhir/CivilSituation.tsx`, `src/i18n/locales/{ar,fr,en,kab}.ts`, `src/routes/fire.$id.tsx`, `src/routes/history.tsx`

- [ ] Failing render test: a satellite fire silent 30 h shows "no new detections" wording, never "Éteint"/"Terminé"; a DGPC incident whose last mention is 40 h old shows "last known status".
- [ ] Status labels read the phase: satellite fading → existing `civilMap.quiet`; archived → new `civilMap.archived`; DGPC fading → new `civilMap.lastKnown` with the authority status; ended → `civilMap.ended`. `state.contained_guess` / `state.extinguished` strings become "Not seen recently" / "No new detections" in all locales; the fire page shows `civilMap.ended` only when the phase is ended.
- [ ] Tests pass; commit.

### Task 4: Per-hazard lease for agent publications

**Files:** Modify `src/lib/civil-agent.server.ts` (validation at the publish decision and the prompt); test `src/lib/__tests__/civil-agent.test.ts`

- [ ] Failing test: an agent road decision expiring 72 h after the source is published with `expires_at` = source + 2 h; a shorter one is kept; one already in the past is still rejected.
- [ ] Clamp to `min(agent, source + civilLeaseHours(hazard))`; state the per-hazard maxima in the prompt.
- [ ] All gates; commit; push; PR stacked on sub-project 1.
