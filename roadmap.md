# Nadhir — build roadmap

Stack adaptation: TanStack Start + React + Supabase (Postgres) replaces
FastAPI/Celery/Redis. Ingestion runs as server routes + pg_cron jobs.
Geometry stored as lat/lon columns (ADR-001) instead of PostGIS.

## Live project

Supabase `nadhir` — ref `kuukthyenirwgdfkltlm`, region eu-west-3 (Paris).
Seed and ops credentials live in `~/.config/nadhir/`, never in this repo.

## Data sources actually connected

| Source                                        | State                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| NASA FIRMS (SNPP, NOAA-20, NOAA-21, MODIS)    | connected, ingesting                                                                   |
| Open-Meteo (weather + local FWI + winds)      | connected                                                                              |
| OpenStreetMap (admin boundaries, settlements) | seeded via `bun run seed:geo`                                                          |
| EUMETSAT MTG FCI                              | credentials valid; **feed health only** — netCDF is not decoded, no detections written |
| EFFIS / GWIS                                  | **not connected**; `/status` reports it as unavailable                                 |

## Phases

- [x] P1 Foundation: schema, design system, i18n (ar/fr/en/kab), app shell
- [x] P2 Live map, cluster markers, today panel
- [x] P3 Fire detail (timeline, wind, nearest settlements)
- [x] P4 Forecast page (6-day outlook, commune search)
- [x] P5 Accounts & zones (auth, zones CRUD, settings)
- [x] P6 Alerting (zone rules, dedup fan-out, alerts feed, cron endpoint)
- [x] P7 Ingestion workers + `ingest_runs` health journal
- [x] P8 Fusion + risk engines (clustering, FSM, confidence, CFFDRS FWI)
- [x] P9 Citizen reports + moderation console
- [x] P10 History & burned areas (unbounded archive query, recharts)
- [x] P11 Public API (v1 fires/risk), signed webhooks, rate limiting, legal pages
- [x] UI/UX rebuild — see `docs/superpowers/specs/2026-08-28-nadhir-ui-redesign-design.md`
- [x] Real geography — 69 wilayas, 1536 communes, 10257 settlements from OSM
- [x] FWI state persistence (`fwi_state`) so runs advance instead of re-fetching history

## Known gaps

The full, evidence-checked list lives in [GAPS.md](GAPS.md) — kept there rather than duplicated
here so the two cannot drift. Headline blockers: the danger scale reads Extreme for 68.8% of
communes and Low for none, registration cannot complete without SMTP, no alert reaches a human,
and fires across the Moroccan and Tunisian borders are labelled as Algerian communes.

## Operations

- Deployed to Cloudflare Workers as `nadhir` — <https://nadhir.app> and `www`. The
  `workers.dev` hostname is off: declaring `routes` sets `workers_dev` false.
  Ship with `bun run build && bunx wrangler deploy`. Requires the Workers **Paid** plan
  (active): React SSR exceeds the free plan's 10ms CPU budget, so pages 503 there while the
  JSON API still answers.
- Daily FWI refresh runs in GitHub Actions (`.github/workflows/risk-refresh.yml`), not
  `pg_cron` — it is minutes of CPU-bound work. The `nadhir-risk` cron job is unscheduled;
  `nadhir-ingest` and `nadhir-alerts` still run in the database.
- `bun run seed:geo --prune` — reseed geography from `data/geo/` (monthly, idempotent).
- Scheduler URL is a vault secret `nadhir_app_url`; the cron function raises if unset.
- Secrets needed by the deployed app: `FIRMS_MAP_KEY`, `EUMETSAT_CONSUMER_KEY/SECRET`,
  `NADHIR_CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
