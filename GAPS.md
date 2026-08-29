# Known gaps

What Nadhir does not do yet, why it matters, and where to start. Every claim here was checked
against the running system on 2026-08-28; where a number is quoted, the query that produced it
is named so you can re-run it rather than trust this file.

Nadhir is a wildfire early-warning service. A gap in a warning system is not the same as a
missing feature in a normal app: if the danger scale is wrong or an alert never sends, the
product is confidently useless at the moment it matters. The list is ordered accordingly.

**The project is not a safe warning service today.** It is a working data platform with an
honest status page. Treat §1 as the distance between those two things.

## 1. Blocking a real warning service

### 1.1 The danger scale lacks a fuel mask and an arid-zone presentation

An earlier version of this section said the scale "carries no information" because 68.8% of
communes read Extreme with none at Low. That predates the noon-LST input fix and was
investigated on 2026-08-29 against a 3-year FWI climatology (the repo's own code over ERA5
archive weather) and ten years of NASA-labelled vegetation fires. The distribution is
seasonal, not broken: Tizi Ouzou spends 48% of the year at level 1 (January: 88 of 93 days)
and ~half of August days at level 5, so "no commune at Low in late August" is what a working
Mediterranean fire-weather scale says at seasonal peak. The scale also discriminates — the 15
largest real-fire days near Tizi Ouzou (2023–25) average level 4.47 against an all-day mean
of 2.25, and 71% of the 697 communes at Extreme on 2026-08-29 had ≥10 vegetation-fire
detections within ~10 km in 2016–25. Do not re-derive "the thresholds are uncalibrated" from
the old text, and do not edit the FWI maths (verified against Van Wagner's worked example in
`src/lib/__tests__/risk.test.ts`).

Two real gaps remain:

- **Fuel mask — shipped 2026-08-30.** FWI is a weather index with no fuel term; Tamanrasset
  read level 5 on 89% of all days including winter. Since the WorldCover enrichment, a
  commune below 5% burnable cover (tree+shrub+grass+crop, `isFuelLimited` in
  `src/lib/zonal.ts`) is written with `risk_forecasts.fuel_limited`; surfaces show "not
  rated", rollups and risk alerts skip it. Dense-urban cores (Alger-Centre) mask too, same
  as EFFIS's own no-data treatment of cities. Absent land-cover data never masks.
- **Arid-zone saturation.** The steppe (El Bayadh) is level 5 on 92 of 92 July days —
  absolute thresholds carry no information there. The standard remedy is a local-percentile
  view beside the absolute class; the CEMS fire-danger reanalysis (86 years of ECMWF FWI,
  CC BY 4.0) is the calibration source, and EFFIS publishes anomaly/ranking indices per
  pixel via the same query layer as §2.2.

Reproduce the seasonality and discrimination numbers: the queries and scripts are described
in the 2026-08-29 investigation; the distribution itself is
`select danger_level, count(*) from risk_forecasts where horizon_days=0 group by 1;`

### 1.2 Nobody can register

`auth.users` is **0**. Sign-up requires an email confirmation, and the project has no custom
SMTP, so it falls back to Supabase's built-in sender — capped at **2 emails/hour project-wide**
and documented by Supabase as not for production.

Login itself is fine, and was verified end to end: password grant issues a token, the app's
lazy profile creation succeeds, zone creation succeeds, and RLS holds (inserting a zone under
another user's id is rejected 403). The wall is purely getting confirmed in the first place.

Two related settings were wrong and are now fixed: `site_url` pointed at `http://localhost:3000`
so every confirmation link was dead, and `uri_allow_list` was empty so the app's
`emailRedirectTo` was ignored.

Remaining work: configure an SMTP provider (Resend, Postmark, SES) in Supabase Auth. Until
then no user account can exist, so zones, alerts and the whole authenticated half of the
product are unreachable.

### 1.3 No alert reaches a human

Alerts are computed and stored (`alerts` table) but nothing delivers them. Push, SMS, email
and Telegram are all unwired; a Firebase service account exists but is not connected. The
alerts table currently holds 0 rows, which is expected given §1.2.

The **CAP object** every channel must render is now built (`cap_alerts`, `src/lib/cap.ts`):
each fire alert links to one CAP 1.2 warning carrying all four languages, so a channel added
later renders an approved object instead of inventing its own payload. It was done while zero
channels exist because that is one table and a serializer; after four channels ship it would
be four rewrites plus a backfill. Signing, approval chains and Cell Broadcast remain
institutional work, not code.

What is left is the delivery itself: pick a provider per channel and render the CAP object to
it. The `cap_alerts` migration was applied to the live project on 2026-08-29
(ledger version 20260829010000).

Start at: `src/lib/alerts-engine.server.ts`, `src/lib/cap.ts`.

### 1.4 No sub-5-minute detection

The spec's §1.4 target depends on the geostationary EUMETSAT MTG FCI feed. Credentials are valid and
the feed is polled for health, but the granules are netCDF and the edge runtime cannot decode
them, so **no FCI detection is ever written**. A test pins this behaviour in
`src/lib/__tests__/ingest.test.ts` so it cannot regress silently.

Detection latency is therefore whatever the polar-orbiting satellites give — hours, not
minutes. Fixing it means decoding netCDF somewhere that is not a Worker.

## 2. Data quality

### 2.1 Land cover and terrain — populated 2026-08-30

All **1536 communes** now carry WorldCover 2021 class fractions (`landcover`),
`forest_fraction` from tree cover, and Copernicus DEM slope/aspect stats (`terrain`).
Commune polygons were seeded from Overpass into `admin_units.geom` (join by `ref:ONS`,
1536/1537). The §9.3 wind bump has 250 eligible communes (was 13); 168 communes fall under
the 5% burnable-cover fuel mask. Verified against an independent benchmark at Tizi Ouzou
(tree 0.499 vs 0.431, mean slope 7.7° vs 6.0°, p90 18.9° vs 19.9°).

Remaining, stated rather than hidden: wilaya rows are not enriched (the model reads commune
values only); WorldCover is frozen at 2021, so a commune that burned since is still modelled
as vegetated — Impact Observatory's annual product is the refresh path; `terrain` has no
reader in the risk model yet, stored so the raster pass is not run twice.

Re-run: `bun run seed:polygons`, `bun run enrich:zonal`.
Reproduce: `select count(*) filter (where landcover is not null) from admin_units where level='commune';`

### 2.2 EFFIS / GWIS is connected for danger classes only

Since 2026-08-29 the daily risk refresh samples the EFFIS WMS danger map per commune into
`effis_danger` — the external comparator §1.1 needs. Three corrections to what this section
originally claimed, all verified live on 2026-08-29:

- **Raw FWI is available programmatically.** GetFeatureInfo on layer `ecmwf007.query` with
  `info_format=text/html` returns FWI, FFMC, DMC, DC, ISI, BUI and the danger/anomaly/
  ranking indices as numbers. Earlier checks missed it because text/plain and GML return
  empty attributes and a continental bbox returns an empty body. Switching the ingest to
  this layer would supersede the palette decode entirely.
- **The palette labels were shifted one class.** The legend's six classes start at Low —
  there is no very_low, and the top class is Very Extreme. Fixed in `effis.server.ts`;
  the mislabeled 2026-08-29 rows were deleted by migration. White pixels are EFFIS
  declining to rate unvegetated land and are stored as `masked` rather than dropped.
- **EFFIS runs can be cold-started.** On 2026-08-29 every Mediterranean pixel (Tizi Ouzou,
  Seville, Sicily) carried DMC ≈ 6.5 and DC ≈ 16 — the CFFDRS initialization values,
  physically impossible in late August. The ingest now checks sentinel DC values through
  the query layer and refuses the run during the dry season when all sit below 100.

The layer only serves its current run, so each row is stamped with the fetch date, and a
palette change on their side still degrades the source loudly (the run errors when zero
communes match).

### 2.3 Commune-to-wilaya assignment diverges from the 2026 law

`admin_units` holds **1536** communes against the official **1541**, but the honest finding
is wider than five missing rows: per-wilaya counts differ from post-Loi-26-06 lists in
**27 wilayas, in both directions** (e.g. Bou Saâda holds 23 communes here vs 13 officially;
M'Sila 24 vs 34; El Aricha has zero). The OSM extract in `data/geo` encodes a different
post-2026 reassignment than the law's, and the secondary datasets disagree with each other
(a widely used community dataset gives El Aricha 8 communes; the Journal Officiel gives 4).
Reconciliation therefore needs the Journal Officiel itself (Loi 26-06, JORADP
F2026025.pdf) as the authority — build the canonical commune→wilaya table from it, diff
against `admin_units`, then correct `data/geo` and reseed. Until then, wilaya groupings in
the UI show OSM's opinion of the assignment, not necessarily the law's.

Reproduce: fetch any 1541-commune reference list and compare per-wilaya counts against
`select w.code, count(*) from admin_units c join admin_units w on w.id = c.parent_id
where c.level='commune' group by 1;`

## 3. Product surface

- **Alert rules R2 (growth) and R5 (all-clear)** are unimplemented. R5 additionally needs the
  `alerts.kind` CHECK constraint widened before it can be inserted.
- **Citizen reports** strip Exif before upload (`src/lib/image-metadata.ts`), which also
  narrows accepted photos to JPEG and PNG — anything else is refused rather than stored
  unsanitised. The strip runs **in the browser**, so it protects a reporter from leaking their
  own GPS but is not a control against someone who uploads to Storage without it; the bucket
  enforces the size and mime limits server-side, nothing more. Captcha and antivirus scanning
  are still missing. Currently 0 reports, so those are gaps to close before promoting the
  feature, not a live exposure.
- **Persistent industrial sources are screened** since 2026-08-29. NASA's science-processed
  archive labels 76.8% of Algeria's 1.1M detections (2016–2025) as `type=2` static land
  sources — gas flares, refineries, power plants — and the NRT feeds Nadhir ingests carry no
  such label, so a registry of 567 grid cells in 158 sites is learned offline and applied at
  ingest (`src/lib/ingest/persistent.server.ts`, `data/flares/`). Held out on 2024–25 inside
  the ingest box, it removes **98.4%** of alerting-size false events (1319 → 21) and loses
  **5.5%** of real ones (181 → 171); the losses are almost all inside the Arzew and Skikda
  complexes, peak FRP 19.3 MW. Residual: ~0.9 false alerting events per month and ~5 genuine
  low-intensity events a year. On the live database this resolved 17 clusters as `flare`,
  including Arzew and Skikda, which the confidence model had scored at 0.82 — above the 0.6
  alerting bar, while a genuine new wildfire scores ~0.40.
  Reproduce: `bun run evaluate:sources`.
- **Admin console** has no cluster resolve (US-6), no broadcast, and no audit log.
- **Survival mode** (`/survival`) ships with deliberate limits, each stated in the UI
  rather than papered over: the SOS queue is **local-only** — no server inbox exists
  because nobody would monitor it (§1.3), and the copy says so; quick hazard reports
  reuse the authenticated report flow, so they are unreachable until §1.2's SMTP wall
  falls; `open_areas` was seeded on 2026-08-29 (2068 rows from OSM — reproduce:
  `select count(*) from open_areas;`) but has had no field verification of any entry;
  threat facts inherit §1.4's
  hours of detection latency and always display their age; the service worker caches the
  survival shell only; spoken/recorded guidance audio (accessibility for low literacy)
  does not exist yet and must be human-recorded, not TTS.
- **Public API** has no WebSocket and no tiles. What exists is `/api/public/v1/fires`
  (with `?format=geojson`), `/api/public/v1/risk` and `/api/public/v1/stats`; the risk
  endpoint takes `?commune=<code>` using `admin_units.code`, not a place name.

## 4. Contributing, tooling and licence

### 4.1 Dependency advisories are dev-only

`bun audit` reports 5 high advisories in `brace-expansion`, `nanoid` and `js-yaml`. All three
arrive through eslint, typescript-eslint and vite's postcss chain, and all are denial-of-service
classes. None reach the deployed Worker — verified by searching the built bundle for the package
names _and_ for their runtime signatures (nanoid's alphabet constant, js-yaml's `YAMLException`),
which returns nothing. Dependabot is enabled and will carry the fixes; clearing them today means
taking the eslint 10 and vitest 4 major bumps, which is a judgement call, not a security urgency.

### 4.2 Password policy is inconsistent

Supabase Auth accepts a 6-character minimum while the sign-up form asks for 8. The API is the
real boundary, so the effective policy is 6. Captcha is disabled, which combined with §1.2's
2-emails/hour ceiling means a bot could exhaust the project's email quota trivially.

### 4.3 Test coverage is narrow

126 tests across 18 files cover the FWI maths, FWI state advancement, alert rule evaluation, geo
seeding, i18n key parity, ingest guards, the cross-border watch area, place labelling, Exif
stripping, CAP construction, the public API helpers, the webhook URL guard, and the
persistent-source grid, registration criteria, screen radius and drift heuristic. There is still
no coverage of clustering/fusion internals, RLS policies, the route handlers end to end, or any
UI. Fusion remains the weakest spot: both its commune attribution and its `fp_reason` filter —
the one the whole screening design rests on — are guarded only by assertions over the source
text, not by exercising the function. The screening thresholds are separately gated on a
held-out confusion matrix (`.github/workflows/screening-gate.yml`), which is a real behavioural
test but of the registry, not of fusion.

### 4.4 Hosting needs the Workers Paid plan

React SSR costs more than the Cloudflare free plan's 10 ms CPU budget. On the free plan roughly
70% of page loads return 503 `exceededCpu` while the JSON API and static assets keep returning
200 — that asymmetry is the signature of the CPU limit, not a broken deploy. The paid plan's
default is 50 ms, which is also too low; the deployed limit is set explicitly to 30 s in
`vite.config.ts`.

## 5. Traps

Things that cost real debugging time here, none of them obvious from the code.

- **Migrations.** Two agents adding migrations the same hour produced a duplicate version
  prefix, which the Supabase ledger cannot hold. Applying one with `psql` without inserting a
  row into `supabase_migrations.schema_migrations` silently breaks the next `supabase db push`.
  Check existing versions and the ledger before adding one.
- **`main` is protected.** Pull request with a review required; force-push and deletion blocked.
  An admin push still succeeds while printing the rule warning — that output is not an error.
- **Declaring `routes` in the wrangler config flips `workers_dev` to false.** Attaching the
  custom domain silently disabled the old `workers.dev` hostname, which broke a scheduled cron
  that was still pointed at it. Update the `nadhir_app_url` vault secret in the same change.
- **maplibre loads its worker as a sibling file of its own chunk.** Nothing emits that file by
  default; a small plugin in `vite.config.ts` does. Remove it and the map renders blank with no
  console error and no failed request — it simply never asks for a tile.
- **PostgREST truncates at 1000 rows.** Use `fetchAllPages` from `src/lib/paginate.ts` for any
  select that can exceed it. Reads only; `.in()` on update or delete is fine.
- **One GitHub setting is not API-reachable**: Settings → Actions → fork pull request workflows.
  It should require approval for all outside collaborators.

## Where to start

| If you want                    | Look at                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| A genuinely small first PR     | §4.1 licence, §4.3 formatting, §4.4 CI                         |
| Data engineering               | §2.1 ESA WorldCover, §2.2 EFFIS                                |
| Backend with real consequences | §1.3 wiring a delivery channel onto the CAP object             |
| Domain science                 | §1.1 danger-scale calibration — the highest-value problem here |
| Ops                            | §1.2 SMTP, §1.4 netCDF decoding off-Worker                     |

Before changing anything that decides what a user is told, read `ORIGINAL-SPEC.md` for the
intended model and `roadmap.md` for what is already built. The spec is authoritative except on
the wilaya count: Algeria has 69, not the 58 the spec lists, and the code asserts 69 in
`src/lib/__tests__/geo-seed.test.ts`.
