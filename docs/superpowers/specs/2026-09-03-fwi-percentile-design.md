# FWI local-percentile view — design

Status: approved by Mehdi 2026-09-03, implemented on `fwi-local-percentile`. Build/seed scripts
written but not yet run against production — see the handoff's owner-action item.

## 1. Problem

`GAPS.md` §1.1: the absolute 1–5 danger scale saturates in arid zones. El Bayadh reads level
5 on 92 of 92 July days in the 3-year climatology already checked into the repo — the
absolute class carries no information there, even though the scale is not broken (it
discriminates real fire days fine elsewhere; see §1.1's own numbers). The documented remedy
is a local-percentile view: today's FWI ranked against that same commune's own history on
that calendar day, so "Extreme" in the steppe in July, which is unremarkable, reads
differently from "Extreme" somewhere that is Extreme once a decade.

## 2. Data source

`cems-fire-historical-v1` on the CEMS Early Warning Data Store (moved off the Climate Data
Store; see memory `ewds-fire-reanalysis`). Reanalysis, consolidated, system version 4.1,
variable `fire_weather_index`, 0.25° grid, NetCDF, Algeria bounding box `[38, -9, 18, 12]`
(north/west/south/east). 86 years, 1940–2025 (2026 is not in the consolidated series past
June). Pulled April–October per year, one request per year, into
`data/ewds/raw/fwi-dz-<year>-apr-oct.nc` (git-ignored). Licence CC BY 4.0, accepted on
Mehdi's EWDS account.

Season scope is April–October, not July–September only: the steppe saturation is documented
for July but the wider fire season deserves the same treatment, and pulling more months costs
only download time, not a schema change.

## 3. Batch build (offline, not a source contract)

Two scripts, run by hand, the same shape as the existing `seed-geo.ts` / `data/geo` pair:

- `data/ewds/build-climatology.py` (Python, xarray/numpy — already the tool used to inspect
  the raw files): for each commune centroid (from `admin_units`, `level = 'commune'`, nearest
  grid cell — the same nearest-point convention `enrichClusterWinds` uses for wind), and for
  each calendar day 1 April–31 October, gather FWI values from a ±15-day window across all 86
  years (clipped, not wrapped, at the two range ends), and compute the 0th–100th percentile
  breakpoints (101 values, `numpy.percentile`). Writes one JSON file per commune under
  `data/ewds/climatology/<commune_id>.json` — mirrors `pull.py`'s per-year files, so a
  crashed or interrupted build resumes by skipping communes already written, and no single
  parse has to hold the whole ~130 MB table in memory.
- `scripts/seed-fwi-climatology.ts` (Bun/TS, `SUPABASE_SERVICE_ROLE_KEY`): reads that output,
  bulk-upserts into `fwi_climatology` in chunks of 500, matching `seed-geo.ts`'s `CHUNK`
  convention. Idempotent (upsert on the natural key).

This is a manual, occasional rebuild — re-run when EWDS publishes new consolidated years, not
a cron contract. It does not appear in `source_runs`, `/status`, or the source registry.

## 4. Storage

```sql
create table public.fwi_climatology (
  commune_id uuid not null references public.admin_units(id),
  month smallint not null check (month between 4 and 10),
  day smallint not null check (day between 1 and 31),
  breakpoints real[] not null,  -- length 101, index i = the i-th percentile FWI value
  built_at timestamptz not null default now(),
  primary key (commune_id, month, day)
);
```

Roughly 1,536 communes × 214 days ≈ 330,000 rows, ~130 MB. Breakpoints, not raw samples:
a percentile is a 1%-resolution number by nature, so storing the 101 breakpoints (rather than
up to 2,666 raw samples per row) loses nothing a reader would notice and keeps the table two
orders of magnitude smaller.

`risk_forecasts` gets one new nullable column: `fwi_percentile smallint`. Null outside
April–October, or where no climatology row exists for that commune (new commune, gap in the
gazetteer) — the same "not rated" pattern `fuel_limited` already establishes; no new empty
state to design.

## 5. Runtime lookup

Inside `refreshRiskForecasts` (`src/lib/ingest/weather.server.ts`), after `seriesFwi` produces
each day's FWI for a commune, a pure function looks up the climatology row for
`(commune_id, month, day)` of `forecast_date` and finds where the computed FWI ranks among the
101 breakpoints via binary search, interpolating between the two nearest when the value falls
between them. Returns `null` when month is outside 4–10 or no climatology row exists. This
function is added to `weather.server.ts` beside `seriesFwi`, unit-tested directly (no
Supabase mock needed — pure in, pure out), and its result is added to the `Row` written to
`risk_forecast_staging` via the existing `stage_risk_forecast_batch` RPC and `Row` type.

The climatology rows needed for a batch (one per distinct commune × forecast-date pair
touched in a run) are fetched once per `refreshRiskForecasts` call, batched like `fwi_state`
already is, not queried per commune.

## 6. Surfacing

Display-only, per Mehdi's explicit decision: no change to `alerts-engine.server.ts`,
`broadcast.server.ts`, `MIN_CONFIDENCE`, or any push/confirmation logic. Same doctrine as air
quality — Information, not a control input.

- `DangerScale.tsx` gets one new optional prop, `percentile?: number | null`, rendered as one
  more line under the existing scale, shown only when present: "hotter than {{pct}}% of years
  on this date" (exact copy to be finalized in the four locales during implementation,
  matching the file's existing `t(...)` pattern). Explicitly worded so a saturated commune's
  high percentile does not read as reassurance — the whole point is that "Extreme" can still
  be ordinary for that place.
- Public API (`/api/public/v1/risk`): the new `fwi_percentile` column rides along, since the
  route already selects the full `risk_forecasts` row shape.
- Home sheet / fire page wherever `DangerScale` is already rendered: threaded through from the
  same query that already carries `fwi`.

## 7. Testing

- `weather.server.ts`: new pure function `percentileFor(breakpoints, fwi)` (or similar),
  TDD'd first — exact breakpoint match, interpolation between two breakpoints, value below p0
  and above p100 (clamped), and the null path (no row / out of season) tested at the
  `refreshRiskForecasts` level with the existing `risk-snapshot-ingest.test.ts` harness.
- `DangerScale.tsx`: existing component, extend its test coverage (if any exists — check at
  implementation time) or add a small render test for the percentile line's presence/absence.
- No test coverage for the Python build script or the seed script — same as `seed-geo.ts`,
  which has none; these are one-shot data tools, not application code.
- `supabase test db`: the new table and column go through the standard migration gate on the
  port-shifted local stack.

## 8. Explicitly out of scope

- No change to alerting, broadcast, or confirmation logic.
- No percentile outside April–October.
- No re-derivation of the FWI maths itself (doctrine already froze that, per `GAPS.md` §1.1:
  "do not edit the FWI maths").
- No UI for browsing the raw climatology or the historical archive itself — percentile only.
