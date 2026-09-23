# Wilaya Incident Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A DGPC incident located only to a wilaya makes the single satellite fire that matches it a Probable fire.

**Architecture:** One pure function picks, for each wilaya-only official incident, the unconfirmed satellite fires of that wilaya whose last look falls within 24 h before to 6 h after the report, and links the fire only when it is the only candidate. The result is a new `officialMention` flag in `FireContext`, used by the map and by both push paths through `fireLevel`. It never confirms or ends a fire. Replaces the LLM reviewer of sub-project 7 (spec, "Sub-project 7, re-scoped").

**Tech Stack:** TypeScript, Vitest, Supabase JS.

## Global Constraints

- Measured 2026-09-23: 26 of 85 DGPC incidents in 30 days lack a commune; 12 had candidate fires, 7 of them exactly one.
- Only national-tier incidents; media tier never links. Ambiguity (2+ candidates) links nothing.
- Gates: `bunx tsc --noEmit`, `bun run test`, `bun run lint`.

### Task 1: `singleCandidateLinks` and `officialMention`
**Files:** `src/lib/fire-confidence.ts`, tests.
- [ ] Failing tests: one candidate → linked; two → none; commune-located, media-tier or other-wilaya incidents → none; confirmed or false-positive fires are not candidates; window edges; `officialMention` makes a detected fire probable, never a candidate.

### Task 2: Context on the server and the map
**Files:** `src/lib/ingest/fire-context.server.ts`, `src/lib/civil-map.ts`, tests.
- [ ] Server reads wilaya-only national incidents and the candidate fires of their wilayas; map uses the incidents and fires it already loads.
- [ ] All gates; spec amended; PR.
