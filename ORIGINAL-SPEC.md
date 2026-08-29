NADHIR (نذير) — Wildfire Early-Warning Platform for Algeria

Full Product & Engineering Specification v1.0

Working name: "Nadhir" (Arabic: the one who warns). Rename via the APP_NAME env var and branding.json — nothing else in this spec hardcodes the name.

0. How to use this document (instructions for the coding agent)

This document is the single source of truth for building the complete application end-to-end. Follow these rules:

Build in the order defined in §19 (Build Phases). Each phase has acceptance criteria; do not start a phase until the previous one passes its criteria.

Every external API credential is an env var (see §17.3). When a credential is missing, the relevant ingestion worker must degrade gracefully (log a warning, mark source as unavailable in the data_sources table) — never crash the system.

All timestamps in UTC in storage; convert to Africa/Algiers (UTC+1, no DST) only at presentation.

All geospatial data in EPSG:4326 in the DB; use PostGIS geography type for distance calculations.

Every user-facing string goes through i18n (§15). No hardcoded strings in components. Languages: ar (default, RTL), fr, en, kab (Tamazight, Latin script).

Write tests as specified in §18. Ingestion parsers must have fixture-based tests using the sample payloads described per source.

Where this spec says "MUST", it is an acceptance criterion. "SHOULD" is strongly preferred. "MAY" is at your discretion.

1. Product overview

1.1 Mission

Detect wildfires in Algeria as early as satellite data allows, forecast daily fire danger, and deliver localized, actionable alerts to citizens and civil-protection stakeholders in their language — for free, open source.

1.2 What the system does

Detects active fires by fusing NASA FIRMS (VIIRS/MODIS) and EUMETSAT Meteosat MTG FCI hotspot data.

Forecasts fire danger 1–6 days ahead per wilaya/commune using Fire Weather Index (FWI) data from EFFIS/GWIS and locally computed FWI from Open-Meteo weather forecasts.

Alerts subscribed users through push notifications, SMS, Telegram, and email when a confirmed fire cluster appears within their subscribed zones, or when danger level reaches Extreme.

Visualizes live fires, danger forecasts, historical burned areas, and fire progression on a public web map and mobile app.

Serves an open public API + webhooks so Protection Civile, municipalities, journalists, and researchers can build on top.

1.3 Non-goals

No prediction of individual ignition events (scientifically not feasible) — only danger rating.

No dispatch/firefighting operations management (out of scope; we expose webhooks for authorities instead).

No user-generated fire reports in v1.0 of this spec... INCLUDED: §12.6 defines citizen reporting with moderation, since this is the full app spec.

No monetization features.

1.4 Success metrics (instrument these)

Median detection-to-alert latency < 5 min from data availability (MTG FCI path).

False-positive alert rate < 5% (measured via admin resolution labels).

Alert delivery success rate > 99% (push), > 95% (SMS).

Map first-paint < 2.5 s on 3G-class connections.

2. Users & personas

Persona Needs Primary surface Rural resident (Kabylie, Aurès, Ouarsenis) Immediate alert when fire nears their village; works on cheap Android, poor connectivity; Arabic/Tamazight Android app, SMS Urban relative Monitor danger where family lives Mobile app, web Protection Civile officer Live feed, cluster details, FRP trend, wind vector, webhook into their systems Web dashboard, API Municipality/wilaya staff Commune-level danger forecast for prevention decisions (grazing bans, patrols) Web, email digest Journalist/researcher Historical data, burned-area stats, API Web, public API Volunteer moderator Verify citizen reports, mark false positives Admin console

2.1 Core user stories (numbered; referenced by tests)

US-1: As a resident, I subscribe to my commune (and up to 10 zones) and receive a push/SMS within minutes of a confirmed hotspot inside or within a configurable radius (default 10 km) of my zone.

US-2: As a resident, I open the app with no connectivity and still see the last synced danger level and safety instructions.

US-3: As a Protection Civile officer, I see each fire as a cluster object with first-seen time, satellite sources, FRP history, spread direction estimate, and nearest settlements.

US-4: As any user, I switch the entire UI between Arabic (RTL), French, English, and Tamazight instantly.

US-5: As a citizen, I submit a geolocated photo report of smoke/fire; it enters a moderation queue and can upgrade a satellite cluster's confidence.

US-6: As an admin, I can mark a cluster as false positive; subscribers get no further alerts for it and the event trains the FP heuristics (logged for offline analysis).

US-7: As a developer, I query GET /v1/fires?bbox=...&since=... without auth (rate-limited) and subscribe to webhooks with HMAC signatures.

US-8: As a user, I see a 6-day danger forecast for any commune with plain-language guidance per level.

3. System architecture

                        ┌─────────────────────────────────────────────┐
                        │                 INGESTION                   │

NASA FIRMS ──poll──▶ │ firms_worker (every 10 min) │
EUMETSAT DataStore ─▶ │ fci_worker (every 10 min) │
EFFIS/GWIS WMS ────▶ │ effis_worker (daily 06:00 UTC) │
Open-Meteo ────────▶ │ weather_worker (hourly) │
OSM/GADM (static) ─▶ │ geo_seeder (one-off + monthly) │
└───────────────┬─────────────────────────────┘
▼
┌─────────────────────────────────────────────┐
│ PostgreSQL 16 + PostGIS 3.4 + Timescale │
│ Redis 7 (queues, cache, rate limits) │
└───────────────┬─────────────────────────────┘
▼
┌──────────────────────┼──────────────────────┐
▼ ▼ ▼
┌───────────────┐ ┌───────────────┐ ┌────────────────┐
│ FUSION ENGINE │ │ RISK ENGINE │ │ ALERT ENGINE │
│ cluster, dedup│ │ FWI, levels │ │ rules, fan-out │
│ lifecycle FSM │ │ per commune │ │ FCM/SMS/TG/mail│
└───────┬───────┘ └───────┬───────┘ └───────┬────────┘
└──────────────┬──────┘ │
▼ ▼
┌────────────────┐ ┌────────────────┐
│ API SERVICE │◀──────────▶│ Delivery │
│ FastAPI + WS │ │ providers │
└───────┬────────┘ └────────────────┘
▼
┌──────────────┬──────────────┬───────────────┐
│ Web app │ Mobile app │ Admin console │
│ React+Vite │ Expo RN │ (web, /admin) │
└──────────────┴──────────────┴───────────────┘

Services (each a separate process, all in one docker-compose):

api — FastAPI REST + WebSocket.

workers — Celery workers + beat scheduler (ingestion, fusion, risk, alert fan-out as queues: ingest, fusion, risk, alerts).

db — Postgres+PostGIS+TimescaleDB.

redis — broker/cache.

tiles — Martin (vector tile server) serving MVT directly from PostGIS.

web — static build served by Caddy (also reverse proxy for api/tiles).

Mobile app builds separately via Expo (EAS or local).

4. Tech stack (pinned — do not substitute)

Layer Choice Notes Backend Python 3.12, FastAPI ≥0.110, SQLAlchemy 2 + GeoAlchemy2, Alembic, Pydantic v2 Jobs Celery 5 + Redis, celery-beat Queues listed in §3 DB PostgreSQL 16, PostGIS 3.4, TimescaleDB (hypertables for detections & weather) Sat parsing httpx, pandas (FIRMS CSV), xarray+netCDF4+eumdac (FCI), rasterio (rasters), shapely Tiles Martin tile server MVT from PostGIS functions Web React 18 + TypeScript + Vite, MapLibre GL JS 4, TanStack Query, Zustand, i18next, Tailwind CSS 4 Mobile Expo SDK ≥51 (React Native), MapLibre React Native, expo-notifications, expo-sqlite (offline cache), expo-location Push Firebase Cloud Messaging (Android + web push), APNs via FCM (iOS) SMS Provider abstraction (§10.5): Twilio driver + generic HTTP driver for local aggregators Telegram Bot API (channel-per-wilaya + personal bot alerts) Auth Phone OTP (primary, SMS) + email magic link (secondary); JWT access 15 min / refresh 30 d; admin: email+password+TOTP Observability structlog JSON logs, Prometheus metrics /metrics, Sentry hooks (env-gated) CI GitHub Actions: lint (ruff, eslint), typecheck (mypy, tsc), tests (pytest, vitest), docker build

5. Repository layout (monorepo)

nadhir/
├── docker-compose.yml
├── .env.example
├── Makefile # make dev / test / seed / migrate
├── backend/
│ ├── pyproject.toml
│ ├── alembic/
│ ├── app/
│ │ ├── main.py # FastAPI app factory
│ │ ├── config.py # pydantic-settings, all env vars
│ │ ├── models/ # SQLAlchemy models (one file per domain)
│ │ ├── schemas/ # Pydantic DTOs
│ │ ├── api/v1/ # routers: fires, risk, zones, alerts, reports, auth, admin, public
│ │ ├── ingest/ # firms.py, fci.py, effis.py, weather.py, geo_seed.py
│ │ ├── fusion/ # clustering.py, lifecycle.py, confidence.py
│ │ ├── risk/ # fwi.py, levels.py
│ │ ├── alerts/ # rules.py, fanout.py, templates/, providers/
│ │ ├── ws.py # WebSocket hub
│ │ └── workers.py # Celery app + beat schedule
│ └── tests/ # pytest; fixtures/ contains sample payloads
├── web/ # React app (public site + /admin)
│ ├── src/
│ │ ├── pages/ # Map, Forecast, FireDetail, History, About, Report, Settings, Admin/*
│ │ ├── components/
│ │ ├── map/ # MapLibre style, layers, sources
│ │ ├── i18n/ # ar.json, fr.json, en.json, kab.json
│ │ └── design/tokens.ts
├── mobile/ # Expo app
│ ├── app/ # expo-router screens
│ ├── src/{components,i18n,offline,notifications}/
└── docs/ # this spec, ADRs, runbooks

6. Data sources & ingestion (exact specs)

Common rules for all workers:

Each run writes a row to ingest_runs (source, started_at, finished_at, status, records_in, records_new, error).

Idempotency: every raw record has a deterministic natural_key; upserts only.

Backoff: exponential with jitter, max 3 retries per run; circuit-break a source after 5 consecutive failed runs (status degraded, shown in admin + public status page).

Algeria bounding box constant: DZ_BBOX = (-8.7, 18.9, 12.0, 37.3) (W,S,E,N). Also clip to the Algeria multipolygon after bbox filter.

6.1 NASA FIRMS (baseline detections)

Endpoint: https://firms.modaps.eosdis.nasa.gov/api/country/csv/{MAP_KEY}/{SOURCE}/DZA/{DAY_RANGE} with SOURCE ∈ {VIIRS_SNPP_NRT, VIIRS_NOAA20_NRT, VIIRS_NOAA21_NRT, MODIS_NRT} and DAY_RANGE=1.

Auth: FIRMS_MAP_KEY env var. Respect documented limit (5000 tx / 10 min) — our usage is ~4 calls / 10 min, far below.

Cadence: every 10 min (beat). NRT latency is up to ~3 h; poll frequently to catch new granules early.

Parse: CSV columns latitude, longitude, bright_ti4/brightness, scan, track, acq_date, acq_time, satellite, instrument, confidence, version, bright_ti5, frp, daynight.

Map to detections table (§7): source='firms', sensor from instrument+satellite, confidence_raw (l/n/h for VIIRS, 0-100 for MODIS → normalize: l=0.3, n=0.6, h=0.9; MODIS value/100), frp_mw = frp.

natural_key: sha1 of (source,sensor,lat,lon,acq_date,acq_time).

Note (agent): if S-NPP products are discontinued (announced for late 2026), the worker MUST handle empty/410 responses for that sensor without failing the run.

6.2 EUMETSAT MTG FCI Active Fire Monitoring (fast path, 10-min cadence)

Product: EO:EUM:DAT:0682 (Active Fire Monitoring, netCDF, MTG 0°).

Access: EUMETSAT Data Store via eumdac Python library; OAuth2 client credentials (EUMETSAT_CONSUMER_KEY/SECRET). Free registration.

Cadence: poll every 10 min for new granules (search by sensing time window = last 40 min, dedupe by granule id).

Parse: open netCDF with xarray; extract pixels where the fire classification flag indicates fire/probable fire; compute pixel centroid lat/lon; map class → confidence_raw (probable=0.55, confirmed=0.85; exact variable names to be confirmed at implementation against the product's format spec — write the parser against a downloaded sample granule and commit the sample to tests/fixtures/fci/).

Clip to DZ_BBOX before insert. source='fci'.

Why it matters: this is the low-latency detector (full disc every 10 min) vs FIRMS' up-to-3 h.

6.3 EFFIS / GWIS fire danger (authoritative FWI forecast)

Access: EFFIS WMS/WFS services (free, see EFFIS "Data and services"); layers for FWI forecast (ECMWF, 1–9 days). GWIS mirrors global coverage incl. Algeria.

Cadence: daily at 06:00 UTC.

Ingest: fetch FWI raster for DZ_BBOX per forecast day (d0..d5) via WMS GetMap (GeoTIFF) → rasterio → zonal statistics (mean, p90) per commune polygon → upsert into risk_forecasts.

If WMS blocked/changed: fallback to computing FWI locally from Open-Meteo (§6.4 + §9). System MUST function fully with the fallback alone.

6.4 Open-Meteo weather (free, no key)

Endpoint: https://api.open-meteo.com/v1/forecast with hourly temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation for a fixed grid of sample points: centroid of each of the 58 wilayas + centroids of high-risk communes list (config file high_risk_communes.json, seeded with forested northern communes).

Cadence: hourly.

Use: (a) inputs to local FWI computation (§9.2), (b) wind vector attached to active fire clusters for spread-direction estimate, (c) display.

6.5 Static geodata (seed job)

Admin boundaries: wilayas (58) + communes (1541): download from geoBoundaries or GADM Algeria ADM1/ADM2 (env GEO_SOURCE_URL), load into admin_units with simplified geometries (tolerance 0.001°) + full geometries.

Settlements & POIs: OSM extract (Geofabrik algeria-latest.osm.pbf) → import place=city|town|village|hamlet nodes into settlements.

Land cover: ESA WorldCover 10 m (2021) clipped to DZ; store per-commune forest/shrub fraction (used in risk weighting §9.3). MAY defer raster storage; store computed fractions.

Re-run monthly for OSM; boundaries pinned by checksum.

6.6 Sentinel-2 burned area (post-fire, history)

After a cluster reaches state extinguished (§8.3) and area estimate > 10 ha: schedule a burned-area job for D+3..D+14: query Copernicus Data Space STAC API for Sentinel-2 L2A scenes over cluster bbox, cloud < 30%; compute dNBR against a pre-fire scene; store polygon in burned_areas (method='dnbr_auto', needs_review=true). Admin can approve/adjust. This powers the History page (§12.5).

7. Database schema (implement via Alembic; DDL-level description)

Conventions: id = UUIDv7 PK unless noted; created_at/updated_at timestamptz defaults; PostGIS geometry(…,4326); hypertables noted.

7.1 admin_units

id, level ('wilaya'|'commune'), code (ONS code, unique), name_ar, name_fr, name_kab nullable, parent_id FK, geom geometry(MultiPolygon), geom_simplified, centroid geometry(Point), forest_fraction float, population int nullable

7.2 settlements

id, osm_id bigint unique, name, name_ar, place_type, geom Point, commune_id FK admin_units

7.3 detections (Timescale hypertable on detected_at)

id, source ('firms'|'fci'), sensor text, detected_at timestamptz, geom Point, confidence_raw float (0-1 normalized), frp_mw float nullable, daynight char(1) nullable, natural_key text unique, cluster_id FK nullable (set by fusion), raw jsonb Indexes: GiST on geom, (cluster_id), (source, detected_at DESC).

7.4 fire_clusters (the core "fire object")

id, state ('unconfirmed'|'active'|'contained_guess'|'extinguished'|'false_positive'), first_detected_at, last_detected_at, centroid Point, hull geometry(Polygon) nullable, detection_count int, sources text[] (distinct), max_frp_mw float, confidence float (0-1, §8.4), est_area_ha float nullable, wind_speed_kmh float nullable, wind_dir_deg float nullable, spread_bearing_deg float nullable, commune_id FK, wilaya_id FK, nearest_settlement_id FK nullable, nearest_settlement_km float nullable, resolved_by FK users nullable, resolution_note text Trigger: state transitions append to cluster_events (cluster_id, event, at, payload jsonb).

7.5 risk_forecasts

(commune_id, forecast_date, horizon_days 0..5, source ('effis'|'local_fwi')) unique; fwi float, danger_level int 1..5, components jsonb (ffmc,dmc,dc,isi,bui when local)

7.6 weather_samples (hypertable)

(point_key text, ts timestamptz) unique; temp_c, rh_pct, wind_kmh, wind_dir_deg, precip_mm, geom Point

7.7 Users & subscriptions

users: id, phone unique nullable, email unique nullable, locale ('ar'|'fr'|'en'|'kab'), role ('user'|'moderator'|'admin'|'authority'), created_at, notification_prefs jsonb {push:bool,sms:bool,telegram:bool,email:bool, quiet_hours:{start,end}|null, min_confidence:float default 0.6}

devices: id, user_id, platform ('android'|'ios'|'web'), fcm_token, last_seen_at

zones: id, user_id, kind ('commune'|'point_radius'), commune_id nullable, center Point nullable, radius_km float nullable (1–50), label, muted bool — max 10 per user (enforce in API).

authority_webhooks: id, org_name, url, secret, events text[], active bool, failure_count

7.8 Alerts

alert_events: id, cluster_id nullable, commune_id nullable, type ('fire_new'|'fire_growth'|'fire_near_settlement'|'danger_extreme'|'all_clear'), severity ('info'|'watch'|'warning'|'emergency'), payload jsonb, created_at

alert_deliveries: id, alert_event_id, user_id, channel, status ('queued'|'sent'|'delivered'|'failed'|'suppressed'), provider_msg_id, error, sent_at (hypertable)

7.9 Citizen reports

reports: id, user_id, geom Point, photo_url nullable, note text, submitted_at, status ('pending'|'approved'|'rejected'|'merged'), cluster_id nullable, moderator_id nullable, exif_ok bool

7.10 Ops

ingest_runs, data_sources (name, status 'ok'|'degraded'|'unavailable', last_ok_at, note), audit_log (actor, action, entity, before, after, at)

8. Fusion engine (detections → fire objects)

Runs as Celery task fusion.run triggered after every ingestion batch that inserted ≥1 new detection (chained), plus a sweep every 5 min.

8.1 Clustering

Candidate set: detections from the last 24 h with cluster_id IS NULL, plus clusters in non-terminal states.

Algorithm: ST-DBSCAN-style greedy assignment — a detection joins an existing active cluster if within eps_km of the cluster hull (or centroid if no hull) AND within 12 h of last_detected_at. eps_km = 3.0 for FIRMS-only, 4.5 when matching FCI (coarser pixels). Otherwise it seeds a new cluster (state='unconfirmed').

After assignment: recompute centroid, concave hull (ST_ConcaveHull, target 0.8) when ≥4 points, est_area_ha = ST_Area(hull::geography)/10000 else detection_count × 14 (VIIRS pixel ≈ 375 m).

Attach context: nearest settlement (KNN GiST), commune/wilaya via ST_Contains, latest wind from nearest weather_samples point; spread_bearing_deg = wind_dir_deg (downwind).

8.2 False-positive suppression (pre-cluster filter)

Reject (flag raw->>'fp_reason', insert with cluster_id NULL, never cluster):

Static-source mask: persistent hotspots seen ≥20 distinct days over trailing 60 d within 750 m (materialized view static_hotspots, refreshed nightly) — gas flares (Hassi Messaoud etc.), industry.

Points over admin_units desert communes with forest_fraction < 0.01 AND no settlement within 15 km AND source confidence < 0.6 (sun-glint / bare-soil artifacts) — still stored, shown on map only at zoom ≥ 9 with "unverified" styling.

8.3 Cluster lifecycle FSM

unconfirmed ──(2+ detections OR any detection ≥0.8 conf OR FCI+FIRMS agreement)──▶ active
unconfirmed ──(no new detection for 6 h)──▶ false_positive(auto) [no alert ever sent]
active ──(no new detection for 12 h)──▶ contained_guess
contained_guess ──(new detection within eps)──▶ active # re-flare
contained_guess ──(no detection for 24 h)──▶ extinguished ──▶ schedule burned-area job (§6.6)
any ──(admin action)──▶ false_positive | extinguished

all_clear alert (§10) fires on active→contained_guess only if a fire_new/fire_near_settlement alert had been sent for the cluster.

8.4 Confidence score (0–1, drives alerting)

confidence = clamp( 0.45·max_source_conf + 0.20·multi_source + 0.15·persistence + 0.10·frp_signal + 0.10·context , 0, 1 )

multi_source = 1 if both fci and firms present else 0.

persistence = min(detections_last_6h / 3, 1).

frp_signal = min(max_frp_mw / 50, 1) (0 when null).

context = forest_fraction of commune (proxy for plausibility).

Approved citizen report merged into cluster: confidence = max(confidence, 0.75).

9. Risk engine (danger forecasting)

9.1 Danger levels (canonical, used everywhere)

Level Name key FWI range Color token 1 risk.low < 11.2 --risk-1 2 risk.moderate 11.2–21.3 --risk-2 3 risk.high 21.3–38.0 --risk-3 4 risk.very_high 38.0–50.0 --risk-4 5 risk.extreme ≥ 50.0 --risk-5 (EFFIS FWI class thresholds.) Each level maps to plain-language guidance strings risk.guidance.{level} in all 4 languages (write them: prevention behaviors, not panic).

9.2 Local FWI computation (fallback + refinement)

Implement the Canadian FWI System (Van Wagner 1987) in risk/fwi.py: FFMC, DMC, DC, ISI, BUI, FWI from daily noon temp, RH, wind, 24 h precip per sample point; carry moisture codes day-to-day in fwi_state (point_key, date, ffmc, dmc, dc). Initialize with standard defaults (FFMC 85, DMC 6, DC 15) on first run or after 60-day gap. Unit-test against the published Van Wagner reference tables (include fixture table).

9.3 Commune scoring

Daily task risk.compute (07:00 UTC): for each commune and horizon d0..d5: fwi_final = max(effis_p90, local_fwi_nearest_point) when both exist, else whichever exists; danger_level from §9.1 table, then bump one level (max 5) if forest_fraction > 0.4 AND wind_forecast_max > 30 km/h (wind-driven risk in forested terrain). Store provenance in components.

10. Alert engine

10.1 Alert rules (evaluated on cluster upsert + risk compute)

Rule Trigger Type/severity Audience R1 cluster enters active AND confidence ≥ user's min_confidence fire_new / warning users whose zone intersects cluster hull buffered by zone radius (default 10 km for commune zones) R2 active cluster: est_area_ha doubles OR max_frp doubles vs last alert, ≥45 min since last fire_growth / warning same audience R3 cluster within 5 km of any settlement, downwind sector (±45° of spread_bearing) intersects settlement fire_near_settlement / emergency (bypasses quiet hours) zones covering that settlement's commune + authorities R4 commune danger_level = 5 for d0 or d1 (first time in 72 h) danger_extreme / watch subscribers of that commune, daily 07:30 local R5 active→contained_guess all_clear / info previously alerted users

10.2 Throttling & dedup

Per (user, cluster): max 1 fire_new, fire_growth at most every 45 min, fire_near_settlement bypasses all throttles once per 2 h.

Quiet hours (user pref): suppress info/watch → mark suppressed, deliver in morning digest; never suppress emergency.

Global kill-switch env ALERTS_ENABLED + per-channel toggles in admin.

10.3 Fan-out

alerts.fanout(alert_event_id): resolve audience via PostGIS query → enqueue one alert_deliveries row per (user, channel per prefs) → channel worker sends → status updates. Batch FCM sends (500/request). All templates rendered server-side in user's locale.

10.4 Message templates (i18n keys, all 4 languages; SMS ≤ 160 GSM-7 chars where possible; Arabic SMS = UCS-2, keep ≤ 70 chars/segment, max 2 segments)

alert.fire_new: "🔥 {commune}: fire detected {distance} km from {settlement}. Confidence {pct}. Follow: {short_url}"

alert.fire_near_settlement: prefixed "⚠️ URGENT" equivalent per locale; includes bearing ("wind pushing NE").

alert.danger_extreme, alert.growth, alert.all_clear similarly. Short URLs via /f/{cluster_short_id} redirect.

10.5 Providers (drivers behind interfaces)

PushProvider(FCM), SmsProvider(TwilioDriver | HttpGenericDriver) — generic driver POSTs {to, body} with configurable auth header for Algerian aggregators; TelegramProvider (bot sends to users who linked via deep-link /start {token}; plus auto-post to per-wilaya public channels, channel ids in config); EmailProvider (SMTP env). Every provider implements send() -> ProviderResult and is covered by a mock in tests.

10.6 Webhooks (authorities)

POST JSON {event_type, cluster|commune payload, ts} with X-Nadhir-Signature: hmac-sha256(secret, body); retries 5× exponential; auto-disable after 20 consecutive failures (email admin).

11. Backend API (FastAPI, /api/v1; OpenAPI must be complete)

Public (no auth, rate-limit 60 rpm/IP via Redis):

GET /fires?bbox&since&state&format=json|geojson — clusters (paginated, max 500)

GET /fires/{id} — cluster detail + detection timeline + events

GET /risk/today?level=wilaya|commune — GeoJSON-ready danger levels

GET /risk/commune/{code}?days=6

GET /stats/summary?from&to — counts, burned ha, by wilaya (History page)

GET /status — data_sources health (public status)

WS /ws — subscribe {type:"bbox", bbox} or {type:"zones", token}; server pushes cluster_upsert, alert

Tiles (via Martin): /tiles/fires/{z}/{x}/{y}, /tiles/risk/{z}/{x}/{y}, /tiles/burned/{z}/{x}/{y}

Auth: POST /auth/otp/request (phone, captcha), POST /auth/otp/verify → JWT pair; POST /auth/email/request|verify; POST /auth/refresh.

User (JWT): CRUD /me, /me/zones (max 10), /me/devices, /me/prefs; GET /me/alerts?limit; POST /reports (multipart photo ≤ 8 MB, strip EXIF GPS after reading it server-side, store distance-to-claimed-location sanity flag).

Admin (role-gated, TOTP): /admin/clusters/{id}/resolve (state, note), /admin/reports/{id}/moderate, /admin/sources, /admin/alerts/test (send test to self), /admin/broadcast (manual alert to commune — two-person rule: requires second admin confirmation within 10 min before fan-out), /admin/users, /admin/webhooks.

Errors: RFC 7807 problem+json. All list endpoints cursor-paginated.

12. Web app — UI/UX specification

12.1 Design system (tokens in web/src/design/tokens.ts; mirror in mobile)

Aesthetic direction. This is a civic-safety tool for Algeria, not a startup dashboard. The visual identity draws from the landscape it protects: deep cedar-forest greens as the calm base, mineral sand neutrals, and a fire scale that is unmistakable and colorblind-checked. Interface is quiet; the data is the color. One signature element: the Danger Dial (§12.3) that renders the day's FWI level as a semicircular gauge echoing a compass/sundial — it appears on Home, commune pages, and the mobile widget, and is the thing people remember.

Palette
--ink: #1A2421 (near-black green; primary text)
--paper: #FAF7F0 (warm off-white background)
--cedar: #2F5D50 (primary brand; buttons, links, active states)
--sand: #C9B99B (borders, muted chips)
--night: #0E1613 (dark-mode background; dark mode REQUIRED)
Risk scale (fixed, AA-contrast labels, distinguishable under deuteranopia):
--risk-1: #7FB069 --risk-2: #F2C14E --risk-3: #F78154 --risk-4: #C1292E --risk-5: #6B0F1A
Alert accents: --emergency: #C1292E on #FFF3F0 banner; --info: cedar.

Typography. Display: Zodiak or Fraunces (self-host) — used only for page titles and the Danger Dial numeral. Body: Inter. Arabic: IBM Plex Sans Arabic (body) + Amiri only for the wordmark نذير. Tamazight (Latin) uses body face; ensure Tifinagh glyph fallback (Noto Sans Tifinagh) for the optional Tifinagh toggle on names. Type scale 1.25 ratio; base 16 px; numerals tabular in data tables.

Spacing/radius/motion. 4 px grid; radius 8 (cards) / 999 (chips); motion: 150–250 ms ease-out; map pulses for active fires (2 s loop, disabled under prefers-reduced-motion). Focus rings always visible (2 px cedar offset).

12.2 Information architecture (routes)

/ Home = Live Map (default view)
/forecast Danger forecast (choropleth + commune search)
/fire/:id Fire detail
/history Statistics & burned areas archive
/report Citizen report flow (auth-gated at submit)
/alerts My alerts feed (auth)
/settings Zones, channels, language, quiet hours (auth)
/about Methodology, data sources, disclaimers, API docs link
/status Source health
/admin/* Console (role-gated): Overview, Clusters, Reports, Broadcast, Sources, Users, Webhooks, Audit

Global shell: top bar (logo, language switcher ar/fr/en/kab, auth avatar), map-first layout — the map is the homepage, not a hero page. Mobile web: bottom tab bar mirroring the native app (§13).

12.3 Home / Live Map (the core screen)

Layers (toggle panel, top-right): Active fires (default on), Danger forecast choropleth d0 (default on at zoom < 8), Burned areas (off), Unverified detections (off, auto-on ≥ zoom 9), Wind arrows (on when a cluster selected).

Fire rendering: cluster = flame marker sized by est_area_ha (3 buckets), colored by state (active = --risk-4 pulsing; contained_guess = amber outline; extinguished = gray). Hull polygon on select. Confidence < 0.6 → 50% opacity + dashed ring + "unverified" chip.

Left rail (desktop) / bottom sheet (mobile): "Today in Algeria" summary — Danger Dial for the user's primary zone (or national max if anonymous), active fire count, list of active clusters sorted by severity (distance-to-settlement asc), each row: commune, first seen (relative time), area est, confidence chip, sparkline of FRP.

Selecting a cluster opens the sheet with: mini-map lock, timeline of detections (dot strip by source: FCI dots dense, FIRMS sparse — legend explains), wind arrow + "spreading toward NE ≈ {settlement}" sentence, nearest settlements table (name, km, bearing), CTA buttons: "Alert me about this fire" (creates point_radius zone), "Share" (OG-image card with map snapshot), "Report info" (link to /report prefilled).

Empty state (no active fires): Dial shows today's level, copy: map.empty = "No active fires detected right now. Danger level today: {level}." + prevention tip rotating.

Latency honesty: every cluster shows "last satellite pass {relative}"; a footer chip shows source freshness from /status. Never imply real-time when a source is degraded — show a dismissible amber banner status.degraded.

12.4 Forecast page

Choropleth (wilaya level < zoom 7, commune ≥ 7) for selected day (segmented control D0..D5). Search commune (typeahead, Arabic/French names). Commune panel: Danger Dial per day (6 mini-dials), FWI number, plain-language guidance risk.guidance.{level}, subscribe button. Legend always visible with the 5 named levels.

12.5 History page

Filters: year, wilaya. KPIs: fires count, est. burned ha, worst day. Charts (recharts): monthly fire count bar, cumulative burned area line, top-10 wilayas table. Burned-area polygons on a small map. Export CSV button (calls /stats endpoints). Methodology note linking /about.

12.6 Citizen report flow (3 steps, ≤ 60 s)

Location: map pin (default = device GPS) + accuracy note; 2. Photo (optional but encouraged; client strips nothing — server handles EXIF) + note (140 chars); 3. Confirm + legal note (false reports). Success screen: report id, "moderators will verify" + current nearest cluster if any. Anti-abuse: OTP-verified users only, 3 reports/day, captcha on submit.

12.7 Settings

Zones manager (list + map picker; commune search or point+radius slider 1–50 km), channel toggles with per-channel verification state, quiet hours, min-confidence slider (labeled "Alert me for: confirmed only ←→ all detections"), language, delete account (GDPR-style full erase).

12.8 Admin console (dense, desktop-first, always LTR layout but localized strings)

Overview: live ops board — ingest runs table (green/red), queue depths, alert send rates, FP rate (7 d).

Clusters: table + map; bulk resolve; every resolve writes audit_log; "false positive" requires reason enum (flare|glint|industry|agri_burn|other).

Reports queue: photo viewer, distance-sanity flag, approve→(merge to cluster picker | create manual cluster), reject with reason.

Broadcast: compose manual alert (commune multi-select, severity, 4-language fields with auto-translate prefill via nothing external — leave blank if not provided), preview per channel, second-admin confirmation flow (§11).

Sources / Webhooks / Users / Audit: CRUD + health as per §7.10.

12.9 States & quality floor (applies to every screen)

Loading = skeletons (never spinners > 300 ms); error = problem+json title + retry; offline (web) = banner + cached last data via service worker (Workbox: cache tiles LRU 50 MB, API stale-while-revalidate 10 min). Keyboard navigable; screen-reader landmarks; contrast AA; RTL mirrored layouts (chevrons, sheets, dial ticks) — test every page in ar.

13. Mobile app (Expo) — UI/UX specification

13.1 Tabs

Map (same behavior as §12.3, native bottom sheet) · Forecast · Alerts (feed of alert_deliveries, unread badges) · Settings. Deep links: nadhir://fire/{id}, nadhir://commune/{code} (from push taps).

13.2 Onboarding (first run, ≤ 4 screens, skippable except language)

Language pick (big ar/fr/en/kab buttons; sets RTL immediately). 2. "What Nadhir does" (one screen, Dial illustration). 3. Location permission ask (while-in-use) → suggests nearest commune as first zone; manual pick fallback. 4. Notification permission + channel prefs; phone OTP offered but skippable — anonymous users get push-only alerts tied to device token (server: users row with null phone, role user).

13.3 Offline-first (US-2)

expo-sqlite mirror of: my zones' current danger levels + guidance strings, active clusters within 100 km (refreshed on each app open + background fetch 2×/day), safety instructions pages (bundled). Offline banner shows data age. Alert history cached 30 d.

13.4 Notifications

Android channels: emergency (bypass DND where OS allows, custom siren-adjacent sound, red), warnings, info — user-visible names localized. Push payload carries cluster_id, type, localized title/body (server-rendered). Tapping opens Fire detail. iOS: critical alerts NOT assumed (needs entitlement) — use time-sensitive interruption level for emergency.

13.5 Native niceties

Home-screen widget (Android) + Live Activity-style ongoing notification during an active cluster within any zone: distance + state, updates ≤ every 15 min. Share sheet renders the OG card. App size target < 40 MB; works on Android 8+.

14. Public API & developer experience

/about#api links to auto-generated OpenAPI docs (Redoc) + a quickstart with curl examples.

API keys optional for public endpoints; keyed clients get 600 rpm. Header X-API-Key; self-serve key creation in Settings (authenticated).

Publish a CITATION.cff, license AGPL-3.0 for the platform, data outputs CC-BY 4.0 with mandatory attribution of upstream sources (NASA FIRMS, EUMETSAT, Copernicus/EFFIS, Open-Meteo, OSM) on /about and in API responses (attribution field in GeoJSON).

15. i18n / RTL / accessibility

i18next namespaces: common, map, risk, alerts, report, settings, admin, legal. Keys referenced in this spec are canonical.

ar default locale; full RTL including MapLibre text-writing-mode, mirrored bottom sheets, dial tick direction. Numerals: Western Arabic (0-9) everywhere for consistency with emergency numbers.

kab: Latin-script Kabyle strings; settlement names show Tifinagh alt when toggle enabled and data exists.

Emergency numbers block on Home + offline pages: Protection Civile 14, Forest fires green line 1070, general emergency 112 — as tappable tel: links.

WCAG 2.1 AA; all alert colors paired with icons + text (never color-only).

16. Non-functional requirements

Perf: API p95 < 200 ms (cached), tiles p95 < 150 ms; fusion batch < 30 s for 5k detections; alert fan-out 10k deliveries < 60 s.

Scale target: 500k users, 50k concurrent WS during a major event (WS hub horizontal-scalable via Redis pub/sub).

Security: OWASP ASVS L2; rate limits everywhere; JWT rotation; admin TOTP; webhook HMAC; photo uploads AV-scanned (clamav container) + EXIF stripped on serve; PII minimization (phone hashed at rest with pepper for lookup + original value encrypted via pgcrypto); backups nightly (pgBackRest), RPO 24 h.

Privacy: location zones are user data — never exposed publicly; analytics self-hosted (Plausible) or none.

Observability: Prometheus metrics per worker (ingest lag seconds per source = key SLI), Grafana dashboard json committed to docs/ops/; alertmanager rule: ingest_lag > 45 min for FCI or > 4 h FIRMS pages admin.

17. Infrastructure & deployment

17.1 docker-compose (production-ready single VM baseline)

Services: caddy (TLS, reverse proxy), api (×2 replicas), workers, beat, db, redis, martin, clamav, plausible (optional). Volumes for pg data + uploads (or S3-compatible via env S3_*).

17.2 Environments

dev (compose, seeded fake data via make seed-demo which inserts a synthetic fire scenario in Kabylie for UI work), staging, prod. Feature flags via env.

17.3 Env vars (exhaustive list in .env.example; highlights)

FIRMS_MAP_KEY, EUMETSAT_CONSUMER_KEY/SECRET, OPENMETEO_BASE (default public), FCM_SERVICE_ACCOUNT_JSON, SMS_DRIVER=twilio|http, TWILIO_, SMS_HTTP_, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNELS_JSON, SMTP_, JWT_SECRET, PHONE_PEPPER, ALERTS_ENABLED, APP_NAME, PUBLIC_URL, S3_, SENTRY_DSN

17.4 CI/CD

GH Actions: on PR → lint+typecheck+tests+build; on main → build images, push GHCR, deploy staging via SSH compose pull; manual approval → prod. Alembic migrations run in an init job with lock.

18. Testing strategy (minimum bar)

Unit: FWI implementation vs Van Wagner reference values (±0.1); confidence formula; FSM transitions (property tests over event sequences); SMS segmentation for Arabic; template rendering all 4 locales snapshot.

Parsers: fixtures for FIRMS CSV (incl. malformed rows), one real FCI granule, EFFIS GeoTIFF sample → assert normalized detections/rasters.

Integration (pytest + testcontainers): ingest→fusion→alert pipeline: inject synthetic detections forming a growing cluster near a seeded settlement → assert R1 then R3 fire with correct audiences, throttling honored, webhook HMAC valid.

API: schemathesis run against OpenAPI; authz matrix tests (user vs moderator vs admin).

Web: vitest + Testing Library for components; Playwright: map loads, cluster select, language switch to ar flips direction, report flow, admin resolve.

Mobile: Jest unit for offline sync reducer; Detox smoke optional.

Load: k6 script: 5k rps tiles, 1k rps API, WS 20k conns on staging profile.

19. Build phases (execute in order; each ends with green CI + criteria)

Foundation: repo scaffold, compose, DB models+migrations, geo seed (boundaries, settlements), CI. ✓ criteria: make dev up; /status 200; communes queryable.

Ingestion: FIRMS + Open-Meteo workers + ingest_runs + static-hotspot mask. ✓ real DZ detections landing.

Fusion: clustering, FSM, confidence; /fires + tiles; basic map page with live clusters. ✓ integration test P2 passes.

Risk: local FWI + EFFIS worker, /risk/*, Forecast page + Danger Dial component. ✓ FWI unit tests pass.

Accounts & zones: OTP auth, zones CRUD, settings pages (web).

Alerting: rules, fan-out, FCM + Telegram + email drivers, templates ×4 locales, quiet hours, /alerts feed, WS pushes. ✓ integration alert test passes end-to-end with mock providers.

Mobile app: tabs, onboarding, offline cache, push handling, widget. ✓ US-1, US-2 demo on device.

FCI fast path: eumdac worker + fusion eps tuning + latency SLI dashboards.

Citizen reports + moderation + admin console (all §12.8).

History & burned areas: Sentinel-2 dNBR job, stats endpoints, History page.

Hardening: SMS driver, webhooks, load tests, security pass (ASVS checklist in docs/), backups, runbooks, /about + legal pages, README + deployment guide.

20. Glossary

FWI (Fire Weather Index) · FRP (Fire Radiative Power, MW) · FIRMS (NASA fire data service) · FCI (Flexible Combined Imager on Meteosat MTG) · EFFIS/GWIS (European/Global fire information systems) · dNBR (differenced Normalized Burn Ratio) · Wilaya/Commune (Algerian ADM1/ADM2) · NRT (near-real-time).

End of specification. Total scope ≈ 11 build phases. Questions an implementing agent cannot resolve from this document should be logged as ADRs in docs/adr/ with the chosen assumption, not left blocking.
