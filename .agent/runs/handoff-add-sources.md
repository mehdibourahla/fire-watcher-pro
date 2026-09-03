# Handoff — extend the ingestion pipeline with new sources

## 1. Ground truth

- Branch `air-quality-smoke`, HEAD `0d31447`, forked from `main` at `df79388`.
- Working tree clean apart from two long-standing untracked files
  (`data/telegram-channels.json`, `docs/superpowers/plans/2026-08-31-behavioral-qa-audit.md`).
- Run this first, before trusting anything below:

```sh
bunx tsc --noEmit && bun run test && bun run lint
```

Expect: tsc silent, **580 tests with exactly 1 file failing to collect**, lint 7 warnings and
0 errors. The failure is deliberate, see §2. `main` on its own is fully green.

Database gate, when you touch schema (the repo's own Supabase is port-clashed; use a
port-shifted stack, recipe in `/private/tmp/claude-501/.../scratchpad/localdb`):

```sh
supabase migration up --local && supabase test db   # expect 428 assertions, Result: PASS
```

Production state right now: every contract healthy except `effis=stale` (JRC's own map server
has been broken since 29 Aug, not ours) and `s3_slstr=degraded` (the feed answers, the sky is
quiet; see traps).

## 2. In flight

`src/lib/__tests__/air-quality.test.ts` is red and is meant to be. It fails to collect with
`Cannot find module '@/lib/air-quality'`. The test fixes the contract for a module that does
not exist yet:

- `parseAirQuality(response)` → `{ pm2_5, pm10, dust, peakPm25, observedAt }` or `null`,
  never a partial reading. `observedAt` is the API's own `current.time` in UTC, not now.
- `smokeLevel(µg/m³)` → `"low" | "elevated" | "high" | "severe"`, banded on
  `WHO_PM25_24H = 15`, with no band that reads as an all-clear.

`src/server.ts:54` already allows `https://air-quality-api.open-meteo.com` in `connect-src`;
without it the browser silently refuses the call (GAPS §5 records that exact trap).

## 3. Next action

Write `src/lib/air-quality.ts` until that test is green, then surface the reading in Survival
Mode beside the Position Card: value, its own timestamp, the WHO comparison, and the
pre-authored smoke guidance. Call the API from the browser at the user's coordinates — the
app holds no server-side position and must keep it that way.

Response shape, recorded live 2026-09-03 for Béjaïa:

```
current: { time: "2026-09-03T00:00", interval: 3600, pm2_5: 12.1, pm10: 27.5, dust: 12 }
current_units: { pm2_5: "μg/m³", ... }
hourly: { time: [...24], pm2_5: [...24 with nulls] }
```

Endpoint: `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=..&longitude=..&current=pm2_5,pm10,dust&hourly=pm2_5&forecast_days=1&timezone=UTC`.
Free, no key, CAMS-backed.

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
