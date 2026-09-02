# Evidence ensemble: research memo and phased plan

Status 2026-09-02, evening. Research done against production data and live endpoints; the
design has two decisions still open (§3). Nothing here is implemented.

## 1. What exists today, measured

**One fusion point.** Detections from FIRMS (four polar sensors), FCI and now SLSTR land in
`detections` with confidence squeezed to 0–1 by per-sensor rules of thumb, are screened
(persistent-source registry, watch polygon), and clustered by space and time only (3 km,
24 h). Pooling is two hand-written formulas in `src/lib/ingest/fusion.server.ts`:
`active` on two detections or two sensors; confidence = 0.45·mean pixel confidence +
0.30·min(1, n/6) + 0.25·min(1, sensors/3). No weight was ever fitted. Everything else —
DGPC incidents, ONM, FWI, land cover, hazard reports — sits beside the cluster and never
enters its state or score.

**The inputs are not on one scale.** Since 28 Aug in production:

| pixel evidence             | real clusters  | retired false positives |
| -------------------------- | -------------- | ----------------------- |
| FCI pixel confidence, mean | 0.86           | 0.73                    |
| FCI FRP, median MW         | 17.1           | 11.5                    |
| VIIRS pixel confidence     | 0.60–0.63 flat | —                       |

VIIRS "nominal" is a constant, not evidence. FCI confidence separates real from artefact
only weakly. FRP separates better. Pixel count rewards a staring sensor (two adjacent FCI
pixels in one slot make a cluster `active`).

**Labels available for fitting.** Clusters since 28 Aug: 57 corroborated by a DGPC
commune mention within ±24 h (mean 48 detections, 72 MW peak); 398 `false_positive`, but
395 of those are the Saharan FCI artefact the watch polygon now excludes, so they are not
representative negatives any more; 148 real-looking clusters with no DGPC mention (DGPC
names only notable fires) — unlabelled, not negative. Honest conclusion: enough to
calibrate a few terms with priors, not enough to fit a free model. The FIRMS science
archive (`type` 0/2, 2016–2025, 1.1M detections) is the large labelled set, VIIRS only,
and lags five months, so the 2026 season is unlabelled until early 2027.

**Where confidence is projected.** Every surface below shows or gates on the unfitted
number and must change together:

| surface                            | today                                      |
| ---------------------------------- | ------------------------------------------ |
| fire page and home sheet           | "Confidence 77 %"                          |
| map                                | "Unverified" below 0.6                     |
| broadcast planner, alert engine    | `MIN_CONFIDENCE` 0.6                       |
| CAP `certainty`                    | "Observed" at ≥ 0.8, else "Likely"         |
| broadcast headline, four languages | "Confirmed fire" for any satellite cluster |
| about page `how`                   | "scored for confidence"                    |
| public API, history CSV            | raw `confidence` field                     |

Under the glossary agreed today (`CONTEXT.md`: Detection, Fire, Candidate, Detected,
Confirmed, Official Incident) the headline and the CAP certainty are now wrong: only an
official source confirms.

**Authority cadence.** DGPC fire bulletins 1–4/day, as-of 07/13/17/20 h, published 0.7–2.6 h
later, median gap 10 h (2.7 h same-day only), nothing at night; 66 of 67 mentions are
"ongoing" and 35 of 46 communes are named once and never closed. ONM 7–21 issues/day.

## 2. Sources researched

| source                                                           | verdict                          | why                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LSA SAF MTG FRP-PIXEL (LSA-509)                                  | **add, low priority**            | 1 km, 10-min, ~20 min timeliness, netCDF full disk (260 files/day) on `datalsasaf.lsasvcs.ipma.pt`, HTTP 401 without a free registration. Same FCI sensor as the WFS layer, different algorithm with QA and FRP uncertainty — corroboration of pixel quality, not an independent look. |
| EUMETSAT Data Store Notifications (pilot since Oct 2025)         | **add later**                    | push on new FCI products; saves minutes off the 22-min ingest lag, not the chain cadence.                                                                                                                                                                                              |
| Sentinel-3 SLSTR                                                 | **fixed today (#75)**            | first stored pass expected 21:30 UTC; second independent look on morning/evening passes.                                                                                                                                                                                               |
| Open-Meteo hourly gusts, VPD, soil moisture                      | **add**                          | already on the endpoint in use; inputs for growth and spread terms.                                                                                                                                                                                                                    |
| Open-Meteo air quality (CAMS PM2.5, dust)                        | **add as projection**            | smoke Information for Survival Mode and the fire page; not evidence for the ensemble.                                                                                                                                                                                                  |
| FIRMS science archive `type` labels                              | **use offline**                  | VIIRS per-pixel prior (vegetation vs static) by cell and FRP; five-month lag.                                                                                                                                                                                                          |
| CEMS FWI reanalysis / ECMWF PoF                                  | **needs an ECMWF/CDS account**   | arid-zone percentile presentation; PoF is registered ECCharts only.                                                                                                                                                                                                                    |
| DGPC national Telegram                                           | **keep, the only official text** | resolution to commune via gazetteer.                                                                                                                                                                                                                                                   |
| Gendarmerie Tariki, Info Trafic Algérie, DGPC Facebook page, DGF | **institutional**                | Facebook-only; one Meta Page Public Content Access review covers all; ITA's Telegram mirrors are dead (last posts Oct 2024, Jun 2026).                                                                                                                                                 |
| Press RSS                                                        | **rejected (#78)**               | web editions publish after the fact.                                                                                                                                                                                                                                                   |
| TV/radio via YouTube titles or speech-to-text                    | **declined for now**             | the only live media; not text.                                                                                                                                                                                                                                                         |
| GDACS/GWIS                                                       | **no**                           | same MODIS/VIIRS pixels, credited to JRC.                                                                                                                                                                                                                                              |

Rule in force: sources stay national; no per-wilaya or per-commune page is ever registered.

## 3. Decisions still open (answer before Phase 2)

1. **Confirmed fires with no satellite pixel: push, and how they end.** Proposal on the
   table: push once at the highest commune level with the bulletin's "as of" time; never
   re-push unless a later bulletin changes status or names it again after a gap; end in
   Nadhir's words "no longer listed since bulletin X; no detection for N h"; "extinguished"
   only when the authority said it. Alternative: map-only, polygon fades after the last
   mention.
2. **Does a citizen Hazard Report count as a second look?** The glossary draft says a
   sensor plus a report makes a Fire Detected. If not, reports are corroboration only.

## 4. Plan

### Phase 1 — vocabulary and projection (no model change)

Goal: what a person sees stops overclaiming, before any weight moves.

- `fire_clusters` gains `confirmed_at timestamptz` and `confirmed_mention_id` set by a
  matcher in the text pipeline (same commune, mention `as_of` within −24/+12 h of the
  cluster's detection window); the recall view already encodes this join.
- Projection map, one place (`src/lib/nadhir.ts`): `unconfirmed` → Candidate, `active`
  and `contained_guess` → Detected, `confirmed_at` set → Confirmed. Database state values
  stay; the UI, CAP and API read the projected term.
- Copy: every "Confirmed fire" headline becomes "Fire detected by satellite" in four
  languages; the Arabic maquette wording must be re-approved. Authority-relayed copy keeps
  "confirmed" with the source named.
- CAP `certainty`: "Observed" only when Confirmed; "Likely" for Detected; Candidates are
  never in a CAP.
- Fire page: replace "Confidence 77 %" with evidence lines — one per sensor with slot count
  and first/last time, one per official mention with the quoted line and as-of, one per
  hazard report with age. The percentage leaves the UI; it stays in the API as
  `score` with a documented meaning.
- Map legend: "Unverified" → "Candidate", with age.

- Text pipeline: a document whose LLM extraction failed is stored before extraction and
  skipped on every later run (review on #78, pre-existing). Record an extraction state per
  document and re-extract failed ones on the next run, bounded.

### Phase 2 — evidence model

Goal: replace three guessed weights with a calibrated log-odds sum whose terms are named
and fitted where labels allow, with priors elsewhere.

- Terms per cluster: per-sensor look terms (FCI one slot, FCI ≥N slots, VIIRS, MODIS,
  SLSTR), peak FRP band, growth in distinct pixels between slots, night flag, burnable
  fraction of the commune, FWI class of the day, persistent-source proximity (negative),
  DGPC mention (large positive, also sets Confirmed), hazard report within 3 km (small
  positive). No source is ever negative evidence except the registry.
- Weights live in a table (`evidence_terms`), not in code; `scripts/fit-evidence.ts`
  refits from labels and prints a reliability diagram and a held-out false-alarm rate,
  gated like `screening-gate.yml`. Until the label set grows, terms without support keep
  their prior.
- `MIN_CONFIDENCE` becomes a probability threshold with a measured false-alarm rate;
  `stateFor` requires two looks (slots or sensors) as the glossary says.
- The replay harness runs the model over the cached Jijel window with the DGPC mentions of
  25–28 Aug (fetchable from the Telegram preview) and reports the same tables as today.

### Phase 3 — sources

- LSA SAF registration; `lsa_frp_pixel` contract reading the 10-min netCDF for the watch
  box; QA flags and FRP uncertainty as pixel attributes, not a new look.
- Hourly gusts and VPD attached to live clusters beside wind; a growth term computed from
  FCI slot-to-slot pixel counts; observed front displacement from the FCI series replaces
  "wind + 180" as the primary spread bearing.
- PM2.5 and dust on the fire page and in Survival Mode as Information with age.
- Meta Page Public Content Access application drafted for Tariki, Info Trafic Algérie and
  the DGPC page; this is the only path to live road status.

### Phase 4 — re-measure

- Extend `bun run replay:window` to ingest archived DGPC posts for the window and to emit
  the per-commune-day table: first pixel, first Detected push, first bulletin, first
  Confirmed push.
- Standing metrics on `/status`: recall against DGPC (exists), false-alarm rate against
  retirements, median pixel-to-push and bulletin-to-push.
