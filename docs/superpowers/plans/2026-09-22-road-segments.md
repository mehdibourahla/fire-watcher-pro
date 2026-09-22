# Road Segments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A road publication that names its road and a commune is drawn as a ~4 km segment of that road, oriented toward the destination the post names, instead of a marker at the commune centre.

**Architecture:** No road import. Carto's basemap tiles already carry `ref` ("RN 12", "A2") on `transportation_name` lines (checked on tile 10/522/399, 2026-09-22). The map reads the loaded lines with `querySourceFeatures`, cuts a segment around the point nearest the commune centre and orients it toward the destination. Pure parsing and geometry live in `src/lib`; FireMap only queries and draws. Anything unresolved keeps today's marker.

**Tech Stack:** MapLibre GL 6.6, TypeScript, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-22-incident-lifecycle-and-map.md`, sub-project 5.
- Segment only for commune-level publications whose road lies within 3 km of the commune centre; a wilaya-level publication never gets a segment (a wilaya centre says nothing about where on the road).
- Single-source colour (grey); segment length 4 km; marker kept as the clickable anchor.
- Gates: `bunx tsc --noEmit`, `bun run test`, `bun run lint`.

---

### Task 1: Parse road and destination
**Files:** `src/lib/road-ref.ts`, `src/lib/__tests__/road-ref.test.ts`
- [ ] Failing tests on the 8 real ITA summaries of 22 Sept: "RN11" → "RN 11", "route nationale numéro 12" → "RN 12", "autoroute A2" → "A2", "autoroute Est-Ouest" → "A1", no road → null; destination after "en direction de/d'/vers" → place name.
- [ ] Implement `parseRoadRef(text): string | null`, `parseDestination(text): string | null`.

### Task 2: Cut a segment
**Files:** `src/lib/road-segment.ts`, tests.
- [ ] Failing tests: a straight line yields a 4 km piece centred on the nearest point; a road farther than 3 km yields null; pieces split at tile edges are joined; the segment is reversed to end nearer the destination.
- [ ] Implement `cutSegment(lines, anchor, { lengthKm, maxOffsetKm, toward })`.

### Task 3: Hints and drawing
**Files:** `src/lib/civil-map.ts` (`roadHints(items, units)`), `src/components/FireMap.tsx`, `src/components/MapCanvas.tsx`, `src/routes/index.tsx`, tests.
- [ ] Failing test: a live commune-level road publication naming a road yields `{ id, ref, anchor, toward }`; wilaya-level or unnamed roads yield none; destination resolved through place search.
- [ ] FireMap recomputes segments on `idle` from source `carto`, draws a cased grey line with direction arrows.
- [ ] Browser check on a seeded publication; commit; push; PR stacked on sub-project 4.
