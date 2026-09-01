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

### 1.1 The danger scale needs an arid-zone presentation (fuel mask shipped)

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

Largely closed 2026-08-30 by the Broadcast Alerts epic: confirmed fires and ONM Severe+
warnings publish as Broadcast Alerts and fan out to FCM commune topics and per-wilaya
Telegram channels (`src/lib/ingest/broadcast.server.ts`, `delivery.server.ts`), with an
accountless web subscription flow. Remaining unwired: the per-user zone `alerts` rows
(email/SMS, still gated on §1.2), and the runtime secrets — `FIREBASE_SERVICE_ACCOUNT`
and `TELEGRAM_BOT_TOKEN` — plus the Firebase web config, without which delivery reports
itself degraded on /status rather than pretending.

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

### 1.4 Geostationary detection — wired 2026-08-30, ~30–40 min latency

MTG FCI detections now ingest every 10 minutes from EUMETSAT's public WFS
(`mtg_fd:frp` on view.eumetsat.int — the same product the Data Store serves as
netCDF, pre-decoded to GeoJSON points, anonymous). `src/lib/ingest/fci.server.ts`
replaced the old catalogue-liveness poll; end-to-end latency is the feed's ~25 min
plus the 10-minute cron. The spec's sub-5-minute target is not met and cannot be
from this feed; it would need the Data Store push subscription plus a decode worker.

Guards, stated: the layer serves a months-deep archive, so the fetch is time-filtered
server-side; the CQL BBOX is lat-first, and a run whose features all fall outside the
watch box errors instead of ingesting the wrong hemisphere. Flare screening applies
unchanged (cell membership is cadence-free); the offline registry thresholds were
derived from ~4 looks/day and must be re-derived before FCI detections are ever fed
into registry _learning_ — today they are not.

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
  empty attributes and a continental bbox returns an empty body. A wholesale switch was
  considered and rejected: per-commune point queries mean 1,536 daily requests against
  JRC's free WMS versus one GetMap; the layer serves the cold-start guard and future
  spot-calibration instead.
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

### 2.3 Commune-to-wilaya assignment — reconciled with Loi 26-06 (2026-08-30)

The law (JORADP N° 25, transcribed with citations in `data/geo/loi-26-06.json`) is now
the applied authority: `bun run audit:loi` verifies 403 of the law's 404 listed
assignments against the live `admin_units`, zero misfiled. Five re-parents were applied
with article citations (El Aricha's four communes out of Tlemcen per Art. 52 bis 14;
Beni Khellad out of Aïn Témouchent per Art. 17) and mirrored in `data/geo/algeria-admin.json`
so reseeds agree; ten spelling variants are pinned in the law file's `name_mappings`
(each code verified against the database), and the audit consumes them.

Still open, stated in the law file's `open_items`: Bou Saâda's "Menaâ" (Art. 52 bis 19)
has no counterpart commune in the database; `2839 Ouled Atia` exists here but in no law
list; and `admin_units` holds 1537 communes against the law's 1541 — the missing rows
are unidentified and need the Arabic original or ONS tables to name.

### 2.4 Source reliability — truthful health and isolated execution built; publication remains open

The first slice of the Data Reliability Control Plane replaces the two most dangerous health
shortcuts. Freshness is no longer guessed in the browser from hard-coded intervals, and raw
`ingest_runs.error` is no longer public. Every current source and derived stage reports a
structured outcome to an append-only private `source_runs` ledger; one atomic recorder advances
the corresponding `source_checkpoints` row; and the `source_health` view derives `healthy`,
`delayed`, `degraded`, `stale`, `unavailable` or `paused` from the versioned contract and its
watermarks. The status page, homepage signal and `/api/public/v1/status` consume that same
sanitized projection. This is milestone M1A in `roadmap.md`.

M2 replaces the direct HTTP cron pipelines with durable per-contract `source_jobs` and one active
lease per contract. Supabase and Cloudflare independently enqueue the same normalized slots;
short jobs run on the Worker, while FWI and EFFIS have separate GitHub consumers. Attempts and
retry windows are bounded, expired leases are recovered, missing intervals become `source_gaps`,
and exact interval replay accepts only a recorded FIRMS or FCI gap UUID inside provider
retention. Terminal gaps for other contracts are marked unrecoverable rather than pretending
they can be reconstructed. A five-minute GitHub watchdog queries Supabase
directly, so the Worker is not its own monitor. Its failures report breached database evidence,
not an inferred Worker crash. Queue, lease, gap, run, and replay internals remain service-role-only.
Current-only backlog is explicit: an older queued slot is failed with an audited `data_delayed`
run and unrecoverable gap before the consumer drains the newest useful slot.
Consumers keep polling while a retry is pending, and an expired usefulness window is terminalized
in bounded 25-row maintenance batches with an audited run plus a replayable or explicitly
unrecoverable gap. Replayability also respects the provider's retention window.
This implementation is locally verified but not yet deployed; production observation is still
required before claiming operational reliability.

What is deliberately still open:

- **Atomic FWI publication (M3).** The daily workflow records partial coverage honestly, but it
  can still update part of the current forecast set in place. A staged 9,216-row snapshot and one
  publication manifest must precede any new daily enrichment layer.
- **Channel-isolated delivery (M4).** Publish and delivery health are distinct contracts now, but
  Telegram and FCM attempts do not yet have independent durable queues, retries and backlog
  objectives. One channel succeeding must not erase evidence that another failed.

The dormant `data_sources` and `ingest_runs` relations exist only for the expand/contract deploy
window. The inactive database HTTP helper and token table also remain until the queue-backed
release completes its observation window. The contract-release checklist in
`docs/superpowers/plans/2026-08-31-source-health-contract-cleanup.md` removes them after
production evidence proves that no deployed code still uses them.

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
- **ONM vigilance is relayed** since 2026-08-30: the met office's CAP warnings
  (CC BY 4.0, WMO-registered authority) ingest every pipeline run into
  `onm_vigilance` and display verbatim per wilaya on the forecast page. Honest
  limits: ONM publishes no wildfire event type (heat and wind are the
  fire-relevant channels); titles are English-only in the feed (the per-warning
  CAP XML carries FR/EN, not Arabic); publication cadence is unproven. Health is
  therefore based on successful validated polls, so a quiet weather day is not
  treated as a dead feed.
- **Admin console** has no cluster resolve (US-6). It gained a **Suggestions** tab on
  2026-08-30 for the `/contribute` idea board (nothing user-submitted reaches the public
  board until a moderator publishes it), and broadcast controls at `/broadcasts`:
  kill-switch, append-only audit view, and manual relay of attributed authority warnings
  (the phone-call case).
- **`/contribute` collects notes that nobody answers yet.** The box records a submission and
  the copy says so — a person reviews it, expect days not minutes — but there is no reply
  path. When the planned agent is wired in, its reply must state that it is an agent: a
  project whose pitch is that every fact carries its source cannot have a bot signing as a
  person. Voting is anonymous by necessity (§1.2 makes accounts unreachable) and keyed to a
  `localStorage` value, so clearing storage earns another vote; the UI says the count shows
  interest rather than a number of people. Open-area verification has a column
  (`verified_at`) but no submission form — verifications arrive as free text in the idea box
  and a maintainer transcribes them, so the headline deficit only moves by hand.
- **Translation review is a real surface** since 2026-08-30:
  `/contribute/language/<ar|fr|kab>` shows all 671 strings beside their English source,
  accepts a suggestion or a "reads right" confirmation per string, keeps drafts in the
  browser across sessions, and submits in rate-limited batches. Accepting in the moderation
  console records a decision only — `bun run apply:translations <locale>` rewrites the
  locale file and leaves a normal diff, so every word a person is shown still arrives
  through a reviewed commit. Suggestions whose `current_text` no longer matches the file are
  skipped and named rather than applied to changed copy. Kabyle stays out of the language
  pickers until a speaker has been through it.
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
  (with `?format=geojson`), `/api/public/v1/risk`, `/api/public/v1/stats` and the sanitized
  `/api/public/v1/status`; the risk endpoint takes `?commune=<code>` using
  `admin_units.code`, not a place name.

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

334 tests across 40 files cover the FWI maths, FWI state advancement, alert rule evaluation, geo
seeding, i18n key parity, ingest guards, the cross-border watch area, place labelling, Exif
stripping, CAP construction, the public API helpers, the webhook URL guard, and the
persistent-source grid, registration criteria, screen radius and drift heuristic. Source-run
classification, public-status serialization, shared health summarization, job execution,
scheduling, watchdog, and replay are included. Separate 39- and 87-assertion pgTAP suites cover
the reliability and execution schemas, grants, state transitions, leases, gaps, and replay; a
10-assertion two-session suite exercises lease collisions and completion/recovery races.
Most older RLS policies, route handlers end to end, and UI behavior still have no
coverage. Fusion remains the weakest spot: both its commune attribution and its `fp_reason` filter —
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
  Check existing versions and the ledger before adding one, and re-check after merging `main`:
  a long-running branch collided twice in one afternoon because everyone picks round-hour
  timestamps. Offset minutes (`…095000`, `…105000`) sidestep it.
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
- **`REVOKE ... FROM PUBLIC` does not lock down a Postgres function here.** Supabase grants
  EXECUTE on new public-schema functions to `anon` and `authenticated` through default
  privileges, which a revoke from PUBLIC leaves untouched. `consume_rate_limit` was callable
  by `anon` from 2026-08-28 until 2026-08-30 — enough to exhaust any caller's bucket. Revoke
  from `anon, authenticated` by name, and check with
  `select proname, proacl from pg_proc where proname = '<fn>'`.
- **The CSP blocked the local-stack workflow this file documents.** `connect-src` allowed only
  `https://*.supabase.co`, so a contributor following CONTRIBUTING.md's `supabase start`
  instructions got a browser that silently refused every call to their own database.
  `src/server.ts` now allows localhost origins in dev only.

## Where to start

| If you want                    | Look at                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| A genuinely small first PR     | §4.1 licence, §4.3 formatting, §4.4 CI                         |
| Data engineering               | §2.1 ESA WorldCover, §2.2 EFFIS                                |
| Backend with real consequences | §1.3 wiring a delivery channel onto the CAP object             |
| Domain science                 | §1.1 danger-scale calibration — the highest-value problem here |
| Ops                            | §1.2 SMTP, §2.4 isolated execution and replay                  |

Before changing anything that decides what a user is told, read `ORIGINAL-SPEC.md` for the
intended model and `roadmap.md` for what is already built. The spec is authoritative except on
the wilaya count: Algeria has 69, not the 58 the spec lists, and the code asserts 69 in
`src/lib/__tests__/geo-seed.test.ts`.
