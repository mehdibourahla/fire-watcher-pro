# Persistent-source screening — design

Date: 2026-08-29
Status: approved
Closes: the unimplemented `detections.fp_reason` screen; prerequisite for any
occurrence-based calibration of the danger scale (GAPS §1.1)

## Mandate

Nadhir ingests satellite hotspots and calls them fires. Most of what it ingests is not
fire. Build the screen that separates permanent industrial heat sources from wildfires,
apply it at ingest, reconcile the history, and keep it from rotting.

`detections.fp_reason` already exists and `fuseDetections` already filters on it
(`src/lib/ingest/fusion.server.ts:152`). Nothing has ever written it. This work supplies
the writer; fusion itself is not modified.

## Why the current pipeline fails

Measured 2026-08-29 from 10 fire seasons of FIRMS `VIIRS_SNPP_SP` (2016–2025, 1 May –
15 Nov, 1959 observation days, ~598k detections inside Algeria).

NASA classifies every detection in the science-processed archive with a `type` field.
For Algeria:

| type                             | detections  | share     |
| -------------------------------- | ----------- | --------- |
| 0 — presumed vegetation fire     | 47,872      | 31.3%     |
| **2 — other static land source** | **104,176** | **68.1%** |
| 3 — offshore                     | 892         | 0.6%      |

**68% of Algerian fire detections are classified by NASA itself as static land
sources** — gas flares and industrial plant. The physics corroborates it: type=2 is 78%
night-detected (a flare contrasts best against cool ground), type=0 is 58% day-detected.

Restricted to Nadhir's own ingest box (`AREA`, `src/lib/ingest/firms.server.ts:6`) over
the held-out period 2024–25, and clustered with Nadhir's own fusion parameters (3 km,
24 h), events large enough to alert on (≥5 detections):

- **157 real fire events. 801 false ones. 84% of Nadhir's alertable "fires" are flares.**

The confidence model makes this worse rather than catching it:

```
confidence = 0.45·mean(raw) + 0.30·min(1, n/6) + 0.25·min(1, sensors/3)
```

55% of the weight rewards detection volume and multi-sensor agreement — precisely what a
permanent flare maximises. A flare saturates both terms and scores ~0.82 (observed:
DZRQFCM at 0.82). A genuine new single-detection wildfire scores ~0.40. `MIN_CONFIDENCE
= 0.6` sits between them, so **flares clear the alerting bar and new wildfires do not.**
Several sit within `SETTLEMENT_EMERGENCY_KM` of a settlement, so under rule R3 they would
raise _emergency_ alerts. This is latent only because `zones` is empty.

## Why a location registry, and not the label directly

The `type` field exists only in the science-processed archive. **Verified 2026-08-29: none
of `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT` or `MODIS_NRT` — the three feeds Nadhir actually
ingests — return a `type` column at all.** The label is available for building a registry
offline; it is not available at ingest time.

So: learn the locations from the labelled archive, screen the live feed by location.

## Registry

Grid **0.01°** (~1.1 km), matching VIIRS geolocation scatter without merging adjacent
stacks. A cell is registered when all three hold:

| criterion                                         | threshold | purpose                         |
| ------------------------------------------------- | --------- | ------------------------------- |
| share of its archive detections labelled `type=2` | ≥ 0.70    | the discriminator               |
| distinct active days                              | ≥ 5       | excludes one-off coincidence    |
| total detections                                  | ≥ 10      | stability of the share estimate |

523 cells nationwide, 118 inside the ingest box.

An earlier draft of this spec used persistence and aseasonality heuristics (≥60 active
days, Jul+Aug share ≤0.45) instead of the NASA label. Those were **measured to be
substantially worse** and are abandoned: on the same held-out test they left 177 false
alerting-size events against 19 for the rule above. The share criterion does nearly all
the work — varying the active-days threshold from 5 to 60 changes the outcome by one
event. Seasonality is still computed by the build script as a sanity statistic, but it is
not a criterion.

### Storage

Follows the existing `data/geo` → `seed:geo` → table pattern.

- `scripts/build-persistent-sources.ts` — derives the registry from the labelled FIRMS
  archive. Requires `FIRMS_MAP_KEY`. Resumable: skips windows already on disk.
- `data/flares/algeria-persistent-sources.json` — committed, reviewable output. A change
  to what Nadhir stops showing must appear in a pull-request diff, never silently in a job.
- `persistent_sources` table, seeded from that file.

Per cell: `lat`, `lon`, `site_id`, `static_share`, `active_days`, `detection_count`,
`observation_days`, `first_seen`, `last_seen`, `frp_p50`, `frp_p90`, `jul_aug_share`.

Adjacent cells group into named **sites** (Arzew, Skikda, Hassi Messaoud) for review and
display. Cells are the screening unit; sites are the human unit. Built Algeria-wide, so
the registry survives any future widening of `AREA`.

The production build pulls the **full calendar year**, not the fire season. The research
above used 1 May – 15 Nov because that window served parallel FWI work; a full-year
archive strengthens the label counts. The build script must not inherit the seasonal
window, and `observation_days` must record whatever window was actually pulled.

## The screen

New module `src/lib/ingest/persistent.ts`, invoked from `runDetectionPipeline` between
`ingestFirms()` and `fuseDetections()`. It sets `fp_reason = 'persistent_source:<site_id>'`
on newly inserted detections within **1.5 km** of a registry cell. Fusion is untouched —
its existing `.is("fp_reason", null)` filter does the rest.

There is no escalation exemption, and that is a deliberate reversal of the earlier draft.
Both candidate exemptions were measured and both cost more than they returned:

| exemption                                    | real events recovered | false events added |
| -------------------------------------------- | --------------------- | ------------------ |
| FRP > 3× cell p90 and > 25 MW                | 0 of 157              | +2                 |
| ≥3 non-registry detections within 5 km, ±3 h | 1 of 157              | +10                |

The protection they were meant to provide is already structural. The registry is 118
cells inside the ingest box; a large fire spans terrain far beyond it, screening is
per-detection, and fusion clusters whatever survives. **A big fire cannot be hidden by a
small registry because it extends past it** — which is why every real event lost in
testing had ≤6 detections and ≤19 MW peak FRP. Adding a rule to cover a case the
architecture already covers buys nothing and costs false fires.

## Measured error rates

Temporal holdout: registry trained on 2016–2023, evaluated on 2024–25, scored against
NASA's `type` label, at the event level using Nadhir's own clustering parameters, inside
the ingest box.

|                                                 | without screen | with screen                   |
| ----------------------------------------------- | -------------- | ----------------------------- |
| real fire events, alerting size (≥5 detections) | 157            | **150 kept — 7 lost (4.5%)**  |
| false events, alerting size                     | 801            | **19 remain (97.6% removed)** |

The 7 lost events were inspected individually. Five are inside the Arzew and Skikda
refinery complexes themselves (Aïn El Bia ×3, Mersat El Hadjadj, Skikda) — industrial
ground, not wildfires threatening a settlement. Two are plausibly genuine vegetation
fires, near El Milia and Debil, with peak FRP of 4.2 and 2.0 MW against 17.1 MW for the
Jijel wildfire burning on the day this was written.

**Residual risk, stated rather than hidden:** roughly 0.8 false alerting-size events per
month remain, and about 3 genuine low-intensity events per year are lost. Neither figure
is zero and no location-based screen can make them zero.

Detection-level rates are worse than event-level (10.8% of real fire detections screened)
and are the wrong measure: Nadhir alerts on clusters, not detections, and the lost
detections belong overwhelmingly to one- and two-detection blips that score 0.22–0.40
confidence — below `MIN_CONFIDENCE` — so Nadhir would never have alerted on them.

## Reconciliation

- Re-screen all existing detections (4,263 at time of writing).
- Clusters whose surviving unscreened detection count falls to zero are resolved with
  `resolution_reason = 'persistent_source'` and `resolved_at` set. **Resolved, not
  deleted** — the record that Nadhir once called a flare a fire is worth keeping.
- Clusters retaining unscreened detections are recomputed (centroid, confidence, state).
- Counts of detections screened and clusters resolved are written to `ingest_runs`.

## Drift

A registry is a snapshot and it rots — wells are drilled, flares are shut.

- **Monthly rebuild** in GitHub Actions alongside `risk-refresh.yml`, opening a pull
  request with the regenerated JSON so a human reviews what changed before it takes effect.
- **Online candidate detection**: a cluster that stays live beyond a persistence threshold
  with flat FRP variance is flagged `suspected_persistent_source` for moderation. Flagged,
  **never auto-suppressed** — a genuine long-burning fire must never be silenced by a
  heuristic. This covers the window between rebuilds in the safe direction.

## What users see

Screened detections remain in the database, suppressed from the fire map, and available
as a **toggleable "known industrial heat sources" layer, off by default**, labelled as
what they are. This follows the Information doctrine in `CONTEXT.md`, and it makes a wrong
registry entry visible — silent suppression would mean nobody can see that Nadhir stopped
showing a location. The layer joins the existing `LayerToggle`. The registry is exposed
at `/api/public/v1/sources`.

## Verification

Fusion is the weakest-tested area in the codebase (GAPS §4.3), so this work carries its
own tests.

- Unit: registration criteria — a cell at 0.71 static share with 12 detections over 6 days
  registers; the same cell at 0.69 does not; a cell at 0.9 share with 8 detections does not.
- Unit: a detection 1.4 km from a registry cell is screened; one at 1.6 km is not.
- Regression: `fuseDetections` produces no cluster from a screened detection.
- Reconciliation: a cluster built entirely from registry-cell detections resolves with
  `persistent_source`; a mixed cluster survives with recomputed confidence.
- **Holdout harness**: the build script emits the confusion matrix above from a
  train/test split. CI asserts real-event loss ≤6% and false-event removal ≥95%, so a
  future change to the thresholds cannot silently degrade either side.

Acceptance on the live database, verified 2026-08-29: 16 of 54 live clusters are screened,
5 of them currently `state='active'` — including DZQJFKN (Arzew) and DZRQFCM (Skikda) —
while DZKVLV6 (298 detections, 4,847 ha), DZ62QZY (9,624 ha), DZPWMRD (2,489 ha) and
DZVVQPN (1,078 ha), the four large genuine fires burning that day, are all kept.
