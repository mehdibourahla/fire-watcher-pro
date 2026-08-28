# Nadhir (نذير)

Wildfire early-warning platform for Algeria. _Nadhir_ is Arabic for "the one who warns".

Nadhir ingests satellite hotspot detections, groups them into probable fires, computes a
daily fire-weather index for every commune, and notifies people who have subscribed to a
zone. The interface ships in Arabic (default, RTL), French, English and Kabyle.

> **Nadhir is not an official source.** It is not a government warning system and must not
> be presented as one. Detections are satellite estimates with real false-positive and
> latency characteristics; see the limitations below before relying on any of it.

## Data sources

| Source                                          | State                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| NASA FIRMS (SNPP, NOAA-20, NOAA-21, MODIS)      | connected, ingesting                                                                                                                  |
| Open-Meteo (weather, fire-weather index, winds) | connected                                                                                                                             |
| OpenStreetMap (admin boundaries, settlements)   | seeded from `data/geo/`, ODbL                                                                                                         |
| EUMETSAT MTG FCI                                | credentials valid, **feed health only** — the granules are netCDF, which the edge runtime cannot decode, so no detections are written |
| EFFIS / GWIS                                    | **not connected**; `/status` reports it unavailable                                                                                   |

Geography is 69 wilayas, 1536 communes and 10257 settlements, taken from OpenStreetMap via
Overpass rather than geoBoundaries or GADM — those have incomplete Algerian ADM2 coverage.

## Stack

TanStack Start (SSR React) with TypeScript and Tailwind, on Supabase Postgres. Ingestion
runs as server routes driven by `pg_cron` rather than a separate worker process. Geometry is
stored as plain lat/lon columns instead of PostGIS (ADR-001), so distance work happens in
application code.

Package manager is **bun**, not npm — the lockfile is `bun.lock` and every script below
assumes it.

## Running locally

```sh
bun install
cp .env.example .env.local   # then fill in the Supabase values
bun run dev                  # http://localhost:8080
```

The dev server listens on **8080**, not vite's usual 5173; the port is set explicitly in
`vite.config.ts`.

Only the Supabase URL and publishable key are needed to boot the UI. The service-role key
and ingestion credentials (`FIRMS_MAP_KEY`, `EUMETSAT_CONSUMER_KEY/SECRET`) are server-side
only and are needed just for ingestion. Missing credentials degrade gracefully: the relevant
worker marks itself unavailable in `data_sources` instead of crashing.

### Database

Migrations live in `supabase/migrations/` (21 of them). Before running `supabase db push`,
check that `supabase/config.toml` names the project you actually mean — a stale ref there
sends migrations to the wrong database, and CLI errors quote the stale id rather than the
linked one. `supabase/.temp/linked-project.json` is the real link target.

Seed geography once the schema is up:

```sh
bun run seed:geo            # add --prune to drop units no longer in data/geo/
```

## Commands

| Command                 | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `bun run dev`           | dev server on :8080                                 |
| `bun run build`         | production build                                    |
| `bun run test`          | vitest suite                                        |
| `bun run lint`          | eslint                                              |
| `bun run format`        | prettier                                            |
| `bun run seed:geo`      | reseed admin units and settlements from `data/geo/` |
| `bun run bootstrap:fwi` | fill `fwi_state` for communes that have none        |

## How it fits together

Detections arrive from FIRMS and are clustered into `fire_clusters`, each resolved to a
commune. Separately, the risk pipeline pulls daily weather per commune and advances the
Canadian Forest Fire Weather Index.

The FWI codes are **stateful**: yesterday's fuel-moisture codes are persisted in `fwi_state`
so each run advances one day instead of re-fetching months of history. This matters because
the drought code has a ~52-day time constant, so a commune with no stored state needs a
92-day spin-up — roughly a hundred times the weather-API cost of a normal daily run. Bootstrapping
a fresh commune set is therefore rate-limited by the Open-Meteo free tier, which is what
`bootstrap:fwi` exists to work around: it retries in passes, and progress is durable because
each batch is flushed as it completes.

Scheduling is `pg_cron` calling back into the deployed app over HTTP. The target host is the
vault secret `nadhir_app_url`; the cron function raises if it is unset, so the jobs fail
loudly rather than silently doing nothing when the app is not deployed.

A public read API is exposed at `/api/public/v1/fires`, `/api/public/v1/risk` and
`/api/public/v1/stats`. The risk endpoint takes `?commune=<code>` — the `admin_units.code`
value, not a place name. Fires also serve GeoJSON with `?format=geojson`.

## Deployment

Runs on Cloudflare Workers, built by nitro's `cloudflare-module` preset. The worker name is
set in `vite.config.ts`; nitro regenerates `.output/server/wrangler.json` on every build, so
edits there are lost.

```sh
bun run build
bunx wrangler deploy
```

Live at <https://nadhir.app> (plus `www`). The custom domains are declared as `routes` in
`vite.config.ts`, so Cloudflare re-attaches them on every deploy and issues the certificate
itself — there are no DNS records to add.

Declaring `routes` also flips wrangler's `workers_dev` default to false, so
`nadhir.mehdibrhl4.workers.dev` now returns 404 (Cloudflare error 1042). That is deliberate —
one canonical host — but it means the scheduler's `nadhir_app_url` must be updated in the same
change, or `pg_cron` keeps calling a hostname that no longer resolves to the Worker.

**This needs the Workers Paid plan.** React SSR costs more than the free plan's 10ms CPU
budget, so on the free plan roughly 70% of page loads return 503 `exceededCpu` while the JSON
API and static assets — which never render React — keep returning 200. That asymmetry is the
signature of the CPU limit rather than a broken deploy.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are baked into the client bundle at
build time. Everything else is a runtime secret set with `wrangler secret put <NAME>`:
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FIRMS_MAP_KEY`,
`EUMETSAT_CONSUMER_KEY`, `EUMETSAT_CONSUMER_SECRET`, `NADHIR_CRON_SECRET`.

After deploying, point the scheduler at the new host by setting the vault secret
`nadhir_app_url` to the deployment URL; until then every `pg_cron` job fails by design.
`NADHIR_CRON_SECRET` authenticates external callers of `/api/public/cron/*`; `pg_cron` itself
authenticates with the separate token in `public.internal_cron_token`.

`pg_cron` drives ingest and alerts. The daily FWI refresh does **not** run there — it is a
CPU-bound batch over 1536 communes that takes minutes, so it lives in
`.github/workflows/risk-refresh.yml` and the `nadhir-risk` job is unscheduled. Each Actions
run also gets a fresh IP, which matters because Open-Meteo's free quota is per-IP; dispatching
that workflow is the fastest way to fill `fwi_state` for a new commune set.

## Known limitations

- **The danger scale is not calibrated for Algeria.** The CFFDRS implementation is faithful
  to Van Wagner's published case to ±0.01 and is tested against it, but applied to an arid
  regime it was not designed for, most communes read "Extreme". Recalibrated thresholds, a
  northern-only scale, or deferring to EFFIS are the open options. The numbers are correct
  and the interpretation is wrong — do not "fix" the arithmetic.
- **No sub-5-minute detection.** That target depends on the geostationary FCI fast path,
  which is blocked on netCDF decoding in the edge runtime.
- **`forest_fraction` is 0 everywhere.** It needs ESA WorldCover; until then the wind bump in
  the risk model is implemented but never fires.
- Alert rules for growth and all-clear are not implemented; push, SMS, Telegram and email
  delivery are unwired.
- Citizen reports have no EXIF stripping, captcha, or antivirus scan.

## Licence

The application declares its code AGPL-3.0 and its derived data CC-BY 4.0, with attribution
to "Nadhir — NASA FIRMS, Open-Meteo". Source data stays under the licences of NASA FIRMS,
EUMETSAT, Copernicus, Open-Meteo and OpenStreetMap. No `LICENSE` file has been added to the
repository yet, so that declaration currently lives only in the app's own terms pages.
