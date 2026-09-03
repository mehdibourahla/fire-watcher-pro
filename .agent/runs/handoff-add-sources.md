# Handoff — extend the ingestion pipeline with new sources

## 1. Ground truth

- `main` at `fc5b5cb` (#94 merged); handoff edited on disk, uncommitted, after #94.
- Working tree clean apart from two long-standing untracked files
  (`data/telegram-channels.json`, `docs/superpowers/plans/2026-08-31-behavioral-qa-audit.md`).
- Run this first, before trusting anything below:

```sh
bunx tsc --noEmit && bun run test && bun run lint
```

Expect: tsc silent, 597 tests green, lint 7 warnings and 0 errors.

Database gate, when you touch schema (the repo's own Supabase is port-clashed; use a
port-shifted stack, recipe in `/private/tmp/claude-501/.../scratchpad/localdb`):

```sh
supabase migration up --local && supabase test db   # expect 428 assertions, Result: PASS
```

Production state right now: every contract healthy except `effis=stale` (JRC's own map server
has been broken since 29 Aug, not ours) and `s3_slstr=degraded` (the feed answers, the sky is
quiet; see traps).

## 2. In flight

- **EWDS calibration pull running** (started 2026-09-03 ~13:00 UTC): `data/ewds/pull.py`
  writes `data/ewds/raw/fwi-dz-<year>-jas.nc` (git-ignored), 1940–2025, Jul–Sep, consolidated
  FWI, 0.25°, Algeria box, three requests in flight; log `data/ewds/raw/pull.log`; resumable
  (re-run skips existing files). Token: `EWDS_PERSONAL_TOKEN` in `.env.local`, exported as
  `CDSAPI_URL`/`CDSAPI_KEY`; client venv in the 56205f10 scratchpad (`cdsenv`), recreate if gone.
- Decision taken: percentile is **per commune** (sample the grid at the commune centroid, like
  `local_fwi`), against a day-of-year window across 1940–2025.
- `local_fwi` failed 2026-09-03 06:13 UTC ("schema" class; hypothesis: Open-Meteo non-JSON 200
  body during its outage) and was not re-queued; today's forecast is missing. Re-run needs the
  service key (`enqueue_source_replay`) or tomorrow's 06:05 schedule.

## 3. Next action

1. **Done, this PR (`dgpc-24h-form-and-fetch-hardening`):** the Mechroha alias, the DGPC
   24-hour bulletin form, and `fetchDaily` treating a non-JSON body as upstream. Merge it.
2. When the pull completes: `data/ewds/` percentile build (commune × day-of-year table as a
   migration, percentile column on `risk_forecasts`, shown beside the danger class). Spec it
   with brainstorming first; GAPS §1.1 is the requirement.
3. Kabyle review; FCI growth term.

## 4. Constraints already decided

- Sources are **national only**. No per-wilaya or per-commune page, feed or channel, ever.
  A national source that names communes is right and preferred. Memory: `national-sources-only`.
- Only an **official source** may Confirm a fire. Satellites Detect. `CONTEXT.md` glossary:
  Detection, Fire, Candidate, Detected, Confirmed, Official Incident.
- A citizen Hazard Report **does not count as a look**; it corroborates and displays.
  Recorded in `docs/superpowers/plans/2026-09-02-evidence-ensemble.md` §3.
- A Confirmed fire with no pixel **is pushed**, once, with the bulletin's own as-of, exempt
  from the cap, skipped when a live thread already put a fire inside that commune. Same §3.
- Press RSS feeds were tried and withdrawn; do not re-propose them. Memory:
  `news-feeds-cadence`.
- Nadhir issues no Instruction and no route. ADR-0002, ADR-0003.
- Air quality is Information, and smoke guidance is Standing Guidance written in advance.
  Never compose safety wording at runtime, never with a model.

## 5. Traps

- `s3_slstr` reading `degraded` is **correct tonight**, not a bug to chase. The EUMETSAT feed
  answers; there was exactly one in-area detection all of 2 Sep (S3B, 36.777/4.876, FRP 13.6,
  10:19 UTC) and it aged out of the six-hour fetch window before the constraint fix deployed
  at 19:45. Two real defects were already fixed: the `detections.source` check rejected `s3`
  (#75) and the contract keyed freshness on an absent upstream slot (#91).
- `effis` stale is JRC's outage, served as HTTP 200 with `text/html`. Nothing to fix here.
- The pipeline is **not** a chain of independent polls. Every contract has
  `schedule_offset_minutes = 0`; the queue's dependency gate orders them. Since #90 the
  dispatcher drains the whole chain inside one Cron Event: production went from 4 minutes to
  5 seconds, ingest to delivery. Do not "optimise" the offsets.
- Meta's Page Public Content Access is the only lawful route to Info Trafic Algérie,
  Gendarmerie Tariki, the DGPC page and the wilaya pages. A scraper was considered and
  rejected. Draft application: `docs/meta-page-access-application.md`.
- LSA SAF MTG FRP-PIXEL exists at `https://datalsasaf.lsasvcs.ipma.pt/PRODUCTS/MTG/MTFRPPixel/NATIVE/`,
  1 km every 10 min, netCDF, HTTP 401 without a free registration. It is the **same FCI
  sensor** already ingested through the EUMETSAT WFS, so it corroborates pixel quality and is
  not an independent look. Low priority.
- GDACS/GWIS is derived from the MODIS/VIIRS pixels already ingested. Not independent.
- Regenerating `src/integrations/supabase/types.ts` wholesale reformats the file into a huge
  diff. Patch the affected table block by hand instead; every migration this session did.
- Migration filenames use offset minutes, never a round hour. Check the ledger first.

## 6. Pointers

- Plan and source verdicts: `docs/superpowers/plans/2026-09-02-evidence-ensemble.md`
- Glossary: `CONTEXT.md` · Decisions: `docs/adr/`
- Ledger of what is missing and why: `GAPS.md` (§1.4 detection, §1.5 official text, §2.4 control plane, §5 traps)
- Replay harness: `bun run replay:window`, data recipe in `data/replay/README.md`
- Meta application draft: `docs/meta-page-access-application.md`
- Tonight's merged work: PRs #79–#91
- Memory index: `~/.claude/projects/-Users-mehdibourahla-…/memory/MEMORY.md`, start with
  `session-2026-09-02-overnight`

## Owner actions that block work

1. `gh secret set NADHIR_OPERATOR_CHAT_ID` — the external watchdog currently fails red
   instead of paging, verified on run 33694697974.
2. Submit the Meta application above.
3. LSA SAF registration at `https://lsa-saf.eumetsat.int`.
4. An ECMWF/CDS account for the arid-zone percentile view (GAPS §1.1).
