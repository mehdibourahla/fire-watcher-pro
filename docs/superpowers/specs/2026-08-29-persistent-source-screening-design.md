# Persistent-source screening — design

Date: 2026-08-29
Status: approved
Closes: GAPS §3 "citizen reports / fusion" false-positive gap; prerequisite for any
occurrence-based calibration of the danger scale (GAPS §1.1)

## Mandate

Nadhir ingests satellite hotspots and calls them fires. The majority of what it ingests
is not fire. Build the screen that separates permanent industrial heat sources from
wildfires, apply it at ingest, reconcile the history, and keep it from rotting.

The `detections.fp_reason` column already exists and `fuseDetections` already filters on
it (`src/lib/ingest/fusion.server.ts:152`). Nothing has ever written it. This work
supplies the writer; fusion itself is not modified.

## Why the current pipeline fails

Measured 2026-08-29 from 10 fire seasons of FIRMS `VIIRS_SNPP_SP` (2016–2025, 1 May –
15 Nov, 1959 observation days, ~598k detections inside Algeria, gridded at 0.01°).
Every number below is reproducible with `scripts/build-persistent-sources.ts`.

- **237 cells (0.9% of all cells) produce 73% of Algeria's fire detections.** Extending
  to cells active on ≥151 days: 377 cells, 82%.
- Dropping cells active ≥60 days leaves **47%** of northern (lat ≥ 34) and **6%** of
  southern detections. So 53% of what Nadhir ingests in the populated north, and 94% in
  the south, is permanent industrial infrastructure.
- The top "fire" communes in Algeria are hydrocarbon sites: In Amenas (62,748), Aïn El
  Beïda (54,026), Bordj Omar Driss (42,264), Hassi R'Mel (19,057), **Aïn El Bia /
  Arzew (10,849)**. Arzew is inside the current ingest box.
- **121 persistent cells lie inside `AREA` (`src/lib/ingest/firms.server.ts:6`)** —
  Arzew (4 adjacent cells, 850–1091 active days), Skikda (3 cells, 845–1070), Algiers
  (36.750, 3.080 — 798 days).
- **16 of 54 live clusters satisfy all four registration criteria below; 6 are
  `state='active'`** — DZC2UJA (1605/1959 active days), DZQJFKN (1443, Arzew), DZRQFCM
  (1054, Skikda), DZQEGWX (581), DZVHW4B (483), DZUANVY (206).

The confidence model makes this worse rather than catching it:

```
confidence = 0.45·mean(raw) + 0.30·min(1, n/6) + 0.25·min(1, sensors/3)
```

55% of the weight rewards detection volume and multi-sensor agreement — precisely what a
permanent flare maximises. A flare saturates both terms and scores ~0.82 (observed:
DZRQFCM at 0.82 on a cell active 1054/1959 days). A genuine new single-detection wildfire
scores ~0.40. `MIN_CONFIDENCE = 0.6` sits between them, so **flares always clear the
alerting bar and new wildfires never do.** Several sit within `SETTLEMENT_EMERGENCY_KM`
of a settlement, so under rule R3 they would raise *emergency* alerts. This is latent
only because `zones` is empty.

## Discriminators

Two orthogonal, both measured. A cell must satisfy both to be registered.

**Persistence.** Registry candidates run 316 active days (median) against genuine fire
cells at 1–20. There is no ambiguous middle.

**Aseasonality.** Share of a cell's active days falling in July–August:

| cell class | Jul+Aug share |
| ---------- | ------------- |
| ≥60 active days | **31%** (calendar baseline for 1 May–15 Nov is 29%) |
| 4–20 active days | **50%** |

Registry cells burn independently of fire weather; real fire ground concentrates in
summer. This is what protects a Kabylie forest that burns every year from being
registered as permanent — the failure mode a persistence-only threshold would have.

It is not theoretical. Two live clusters are highly persistent yet summer-concentrated —
DZQYVPP (466 active days, 57% Jul+Aug) and DZQCNZV (115 days, 68%) — and the
aseasonality criterion excludes both. A persistence-only rule would have suppressed
recurring fire ground.

Northern cells with ≥60 active days show a median of 7 distinct months and 10 distinct
years present. A forest cannot burn in every month of every year.

## Registry

Grid: **0.01°** (~1.1 km), chosen to match VIIRS 375 m geolocation scatter without
merging adjacent distinct stacks.

A cell is registered when **all four** hold:

| criterion | threshold |
| --------- | --------- |
| active days | ≥ 60 |
| distinct years present | ≥ 3 |
| distinct months present | ≥ 4 |
| Jul+Aug share of active days | ≤ 0.45 |

The production build pulls the **full calendar year**, not the fire season. The research
above used 1 May – 15 Nov because that window served the parallel FWI work; a full-year
archive strengthens the aseasonality test decisively, because a flare burns in January
and a wildfire never does. The build script must therefore not inherit the seasonal
window, and the recorded `observation_days` denominator must reflect whatever window was
actually pulled.

Adjacent registered cells are grouped into named **sites** (Arzew, Skikda, Hassi
Messaoud) for review and display. Cells are the screening unit; sites are the human unit.

### Storage

Follows the existing `data/geo` → `seed:geo` → table pattern.

- `scripts/build-persistent-sources.ts` — derives the registry from the FIRMS archive.
  Requires `FIRMS_MAP_KEY`. Resumable: skips windows already on disk.
- `data/flares/algeria-persistent-sources.json` — committed, reviewable output. A change
  to what Nadhir suppresses must be visible in a pull request diff, never buried in a job.
- `persistent_sources` table, seeded from that file.

Per cell: `lat`, `lon`, `site_id`, `active_days`, `observation_days`, `first_seen`,
`last_seen`, `distinct_years`, `distinct_months`, `jul_aug_share`, `frp_p50`, `frp_p90`,
`frp_p99`, `detection_count`.

Built Algeria-wide rather than only inside the current ingest box: the data costs nothing
extra and the registry then survives any future widening of `AREA`.

## The screen

New module `src/lib/ingest/persistent.ts`, invoked from `runDetectionPipeline` between
`ingestFirms()` and `fuseDetections()`. It sets `fp_reason` on newly inserted detections
that have none. Fusion is untouched — its existing `.is("fp_reason", null)` filter does
the rest.

Suppress detection `D` when a registry cell `C` exists within **1.5 km** and `D` does not
escalate. `fp_reason` is set to `persistent_source:<site_id>`.

Escalation is the **OR** of two independent tests, because neither is sufficient alone:

1. **Baseline breakout** — `D.frp_mw > 3 × C.frp_p90` **and** `D.frp_mw > 25`.
   Measured leak: 0.36% of flare detections.
2. **Spatial breakout** — at least 3 other detections within 5 km and ±90 minutes of `D`
   that are *not* within 1.5 km of any registry cell.

Test 1 alone is not safe: genuine one-off fire detections exceed 25 MW only **17.4%** of
the time, so a fire igniting on a registry cell would be mostly suppressed. Test 2 covers
it, because a real fire spreads beyond the industrial footprint and a flare does not.

The parameters of test 2 (3 detections, 5 km, ±90 min) are **initial values that must be
validated during implementation** against the archive, not asserted. Acceptance: the
August 2021 Kabylie fires and the current Jijel cluster DZKVLV6 must escalate; the Arzew
and Skikda baselines must not. If the values fail either direction, they change and the
spec is amended.

## Reconciliation

Screening only affects new detections, so history must be corrected explicitly.

- Re-screen all existing detections (4,263 at time of writing), setting `fp_reason` under
  the same rule.
- Clusters whose surviving unscreened detection count falls to zero are resolved with
  `resolution_reason = 'persistent_source'` and `resolved_at` set. **Resolved, not
  deleted** — the record that Nadhir once called a flare a fire is worth keeping.
- Clusters that retain unscreened detections are recomputed (centroid, confidence, state)
  from what remains.
- The run reports counts of detections screened and clusters resolved, into `ingest_runs`.

## Drift

A registry is a snapshot and it rots — wells are drilled, flares are shut.

- **Monthly rebuild** in GitHub Actions alongside `risk-refresh.yml`, opening a pull
  request with the regenerated `data/flares/algeria-persistent-sources.json` so a human
  reviews what changed before it takes effect.
- **Online candidate detection**: a cluster that stays live beyond a persistence threshold
  with flat FRP variance is flagged `suspected_persistent_source` for moderation. Flagged,
  **never auto-suppressed** — a genuine long-burning fire must never be silenced by a
  heuristic. This closes the window between rebuilds in the safe direction.

## What users see

Screened detections stay in the database and are suppressed from the fire map. They are
available as a **toggleable "known industrial heat sources" layer, off by default**,
labelled as what they are.

This follows the Information doctrine in `CONTEXT.md`: the data is real, and stating what
it is beats hiding it. It also makes a wrong registry entry visible — silent suppression
would mean nobody can see that Nadhir stopped showing a location.

The layer joins the existing `LayerToggle` component. The registry is exposed on the
public API as `/api/public/v1/sources` for the same reason.

## Verification

Fusion is the weakest-tested area in the codebase (GAPS §4.3), so this work carries its
own tests rather than inheriting confidence.

- Unit: registration criteria — a synthetic persistent aseasonal cell registers; a
  synthetic summer-concentrated cell with the same active-day count does not.
- Unit: both escalation tests, each in isolation and ORed, including the case that test 1
  fails and test 2 passes.
- Unit: a detection 1.4 km from a registry cell is screened; one 1.6 km away is not.
- Integration against the real archive: the Arzew, Skikda and Hassi Messaoud sites are
  registered; the August 2021 Kabylie detections are not screened.
- Regression: `fuseDetections` produces no cluster from a screened detection.
- Reconciliation: a cluster built entirely from registry-cell detections resolves with
  `persistent_source`; a mixed cluster survives with recomputed confidence.

Acceptance on the live database, verified against the archive on 2026-08-29:

- The 16 live clusters meeting all four criteria are screened or resolved, including the
  6 currently in `state='active'`.
- The four large genuine fires burning that day are untouched. Their measured registry
  statistics, none of which qualify:

  | cluster | area | active days | years | months | Jul+Aug |
  | ------- | ---- | ----------- | ----- | ------ | ------- |
  | DZKVLV6 | 4,847 ha | 9 | 2 | 3 | 44% |
  | DZ62QZY | 9,624 ha | 3 | 2 | 1 | 100% |
  | DZPWMRD | 2,489 ha | 1 | 1 | 1 | 0% |
  | DZVVQPN | 1,078 ha | 11 | 6 | 4 | 64% |
