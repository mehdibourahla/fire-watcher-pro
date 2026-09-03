# Handoff — source autonomy, EFFIS restored, fire growth term

## 1. Ground truth

- `main` at `1b62e4b` (#104 merged). Working tree clean apart from two long-standing
  untracked files (`data/telegram-channels.json`,
  `docs/superpowers/plans/2026-08-31-behavioral-qa-audit.md`).
- Run this first, before trusting anything below:

```sh
bunx tsc --noEmit && bun run test && bun run lint
```

Expect: tsc silent, 624 tests green, lint 7 warnings and 0 errors.

Database gate, when you touch schema (the repo's own Supabase is port-clashed; use a
port-shifted stack, recipe in `/private/tmp/claude-501/.../scratchpad/localdb`):

```sh
supabase migration up --local && supabase test db   # expect 441 assertions, Result: PASS
```

Production, verified 2026-09-03 ~21:00 UTC: all 12 Cloudflare contracts healthy on cadence.
`fci` fails ~12% of runs with `upstream_unreachable` and now self-heals through the gap drain.
`effis` and `local_fwi` are daily at 06:00 and had not yet run on the new code at handoff time.

## 2. What shipped this session

Merged #97–#104. The through-line: an audit asked whether every source is self-provisioning,
the answer was no, and the fixes cascaded.

- **#98** staleness caption on `/forecast` and the home map when horizon-0 has not published
  today; plus the extraction retry gap — an unresolved commune is now queued in
  `document_extractions`, so a later alias fix can repair an already-processed document.
- **#99** a JSON parse failure is transient, not a schema verdict. `publicReasonForError`
  matched the `parse` keyword *before* the upstream branch, returning `schema_invalid` →
  `permanent`, and `_retryable` is the first conjunct of `_will_retry` in `complete_source_job`
  — so `local_fwi` retired with an attempt and 12h of window unused.
- **#100** `private.replay_open_source_gaps` on a 5-minute pg_cron. 92 gaps sat open and 157
  had aged into `unrecoverable` because **nothing ever called `enqueue_source_replay`** outside
  a manual script. Bounded: oldest-first, interval-replayable contracts only, `replay_count < 3`,
  2 per tick. Also widened `local_fwi`/`effis` retries to `max_attempts 5`,
  `retry_base_seconds 1800` (~7.5h spread instead of 20 minutes).
- **#101** EFFIS migrated to `maps.effis.emergency.copernicus.eu`, layer `mf010.fwi`. Details
  and traps in memory `effis-endpoint-migration`. `ingestEffis(day?)` now fetches the day its
  job asks for, which is what makes `effis` honestly replayable (`interval`, 7-day window).
- **#102** `effisDangerQuery` asked for `.limit(1600)`; PostgREST caps at 1000, so ~536 of 1536
  communes silently lost their comparison, non-deterministically (it ordered only by a date
  every row shares). Now `fetchAllPages` + a `commune_id` tiebreak.
- **#103/#104** FCI growth term: `fciGrowth()` compares mean pixel count of recent vs earlier
  slots, stored as `fire_clusters.fci_growth`, rendered on the fire page.

Also done by hand, not in any PR: the FWI climatology was **built and seeded** (328,704 rows,
1536 communes) and a forecast snapshot republished, so `fwi_percentile` is live — verified on
`/forecast`. And the Mechroha/Aïn El Assel DGPC document was reprocessed; that incident is live.

## 3. Next action

1. **06:00 UTC daily runs are the first scheduled exercise of #100 and #101.** I ran EFFIS by
   hand; the scheduler has never run it on the new endpoint, and `local_fwi`'s new retry spread
   has never been exercised. Check `source_runs` for both, and that `effis_danger` gains a row
   for the new date rather than re-upserting the old one.
2. **The `growing` branch of `fciGrowth` has never fired on real data** — only `steady` has been
   observed. Its logic is covered by unit tests, which are assertions about the system, not
   evidence from it. Watch an afternoon burn (Algeria peak ~13:00–18:00 UTC) before trusting it.
   Coverage is thin by design: 1 of 40 live clusters at 20:00 UTC, because the 2h staleness rule
   correctly excludes the 31 clusters unseen for 6+ hours.
3. **Kabyle review** of everything accumulated across recent sessions. Needs a human speaker;
   no agent can close this.

## 4. Known-broken upstream, not ours

- `mf010.query` renders its GetFeatureInfo HTML template but never substitutes values
  (`[FWI]`, `[DC]`…), across every parameter variant tried. So EFFIS exposes no raw FWI/DC.
  The DC-sentinel cold-start guard was replaced by a raster check because of this.
- The old JRC host `ies-ows.jrc.ec.europa.eu/effis` returns a mapfile error for every request.
  Do not "fix" code pointing at it — the fix is the new host.
- 157 `source_gaps` are permanently `unrecoverable`; they aged out before the drain existed.

## 5. Traps that cost real time this session

- **`replay_capability` is overloaded.** It does not only gate replay; it also decides whether
  an obsolete daily slot may run. Flipping `local_fwi` to `'interval'` broke four pgTAP tests
  guarding "a current-only daily consumer discards a stale slot". Never flip it for a source
  that fetches the *current* product without first making its ingester accept a date.
- **PostgREST caps every response at 1000 rows**, whatever `.limit()` says. Any per-commune
  table needs `fetchAllPages` plus a unique tiebreak — ordering by a column every row shares
  makes the truncation non-deterministic and very hard to notice.
- **Unit tests pass over rendered-sentence bugs.** #103 shipped Arabic reading "steady *during
  6 hours ago*" with all 624 tests green, because none assert on rendered copy. `relativeTime`
  returns a relative phrase and does not compose with duration wording; use `algiersTime`.
  Load the real page.
- `gh pr merge --admin` failing on permissions usually means the active `gh` account silently
  switched. Check `gh auth status` before believing the PR is unmergeable.
- Postgres refuses `CREATE OR REPLACE` on a `RETURNS TABLE` function whose column set changes
  (`DROP FUNCTION` first), and restating a function from an earlier migration silently reverts
  a *later* migration's `ALTER FUNCTION`. Grep every migration for `alter function` on a symbol
  before restating it.

## 6. Constraints already decided

- Sources are **national only**. No per-wilaya or per-commune page, feed or channel, ever.
  A national source that names communes is right and preferred. Memory: `national-sources-only`.
- Only an **official source** may Confirm a fire. Satellites Detect. `CONTEXT.md` glossary:
  Detection, Fire, Candidate, Detected, Confirmed, Official Incident.
- A citizen Hazard Report **does not count as a look**; it corroborates and displays.
  Recorded in `docs/superpowers/plans/2026-09-02-evidence-ensemble.md` §3.
- A falling FCI pixel count is **never presented as reassurance** — it can be cloud or smoke.
  Growth is prominent; decline is a neutral factual line. Mehdi's call, 2026-09-03.
- `geo` has `schedule_enabled = false` deliberately; auto-running the gazetteer/polygon seed
  would rewrite hand-curated geometry. Not a gap.
