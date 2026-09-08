# Source successors — verified 2026-09-08

PR #31 remains superseded by FCI WFS ingestion, CAP Telegram delivery, local FWI
percentiles and cited Loi reconciliation. Its remaining terrain rotation, invented
burn circles and logistic calibration must not be carried forward. See the
[actual review](https://github.com/mehdibourahla/fire-watcher-pro/pull/31)
and GAPS §4.5. Per-fire terrain observations and measured fuel recovery need separate
scientific validation before affecting alerts or the shared downwind bearing.

## Interactive ensemble preview

`GET /api/private/ensemble?commune=0601` accepts a verified Supabase bearer belonging
to an operator/admin and exactly one existing commune code. It fetches today's 24
UTC hours from one ICON model for temperature, precipitation and wind speed. The
response includes all 40 member values (unsuffixed series, then member01–39), their minimum/maximum, grid coordinates,
forecast valid times and retrieval time. `model_run_at` stays null: the provider
response does not supply initialization time. Retrieval time is not observation time.

The optional `EnsemblePreview` admin component requests data only on submission.
There is no scheduled source, persistent forecast table or downstream decision
consumer. The normal source contract/discover/fetch/validate/commit workflow is
required before any future scheduled ingestion. Critical-source health stays independent.

Work is bounded to two requests/minute per user and twenty/hour globally through
the existing atomic database limiter, failing closed when unavailable. Each request
has a ten-second provider timeout, 256 KB response ceiling and no retries. Missing
members, nulls, invalid units, grid mismatches and stale/invalid dates reject the
whole preview. The private response is not cached.

[Official API](https://open-meteo.com/en/docs/ensemble-api): ICON global covers Algeria
at about 26 km, with 40 members, a 7.5-day forecast and 12-hour updates. Hourly
outputs may be interpolated. The preview deliberately requests one day only.
[Terms](https://open-meteo.com/en/terms): CC BY 4.0 data; free API use must be
noncommercial, under 10,000 weighted calls/day, 5,000/hour and 600/minute. Existing
weather consumers share provider capacity; these local preview limits do not reserve
the account's quota. Commercial use or greater volume needs a paid subscription.

Producer fixture: `src/lib/__tests__/fixtures/ensemble-icon-2026-09-08.json`, captured
without transformation from [this request](https://ensemble-api.open-meteo.com/v1/ensemble?latitude=36.75&longitude=5.08&hourly=temperature_2m,precipitation,wind_speed_10m&models=icon_global&forecast_days=1&timezone=UTC).
Keep the fixture's forecast date when testing; do not relabel it as current data.

## Remaining candidates

| Priority | Source and verified primary evidence                                                                                                                                                                      | Ready work / remaining blocker                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Ensemble preview above                                                                                                                                                                                    | Interactive operator inspection implemented; no probability or fire-risk calibration.                                                                                                                                                                                                                                                                                                                                                         |
| 2        | [GWIS burned areas](https://gwis.jrc.ec.europa.eu/about-gwis/technical-background/burnt-areas), [licence](https://gwis.jrc.ec.europa.eu/about-gwis/data-license)                                          | NRT perimeters are estimates from FIRMS MODIS/VIIRS thermal anomalies, not independent confirmation or optical burn scars. Public site links `nrt.ba` WMS; WFS schema was not verified (20-second probe returned no bytes). Capture actual polygons before an observational history adapter. CC BY 4.0. GlobFire/MCD64A1 has about two-month latency and date uncertainty of several days. Neither justifies an invented fuel-recovery curve. |
| 3        | [CLMS catalogue](https://documentation.dataspace.copernicus.eu/Data/CopernicusServices/CLMS.html), [OData](https://documentation.dataspace.copernicus.eu/APIs/OData.html)                                 | Global NDVI v3: 300 m, ten-day, 2014–present; SWI has a newer v4 product. Authenticated downloads, product-specific QA, licence and real raster fixtures remain to verify. Greenness/SWI must stay distinct from calibrated fuel availability.                                                                                                                                                                                                |
| 4        | [GHSL datasets](https://human-settlement.emergency.copernicus.eu/datasets.php), [downloads](https://human-settlement.emergency.copernicus.eu/download.php?ds=pop)                                         | GHS-POP R2023A: global, 100 m/1 km, five-year epochs. Anonymous tiles, attribution required. Capture chosen epoch/CRS tile and population-conserving aggregation fixture first. Modeled residents are not the people currently present or threatened.                                                                                                                                                                                         |
| 5        | [NASA IMERG](https://gpm.nasa.gov/data/imerg)                                                                                                                                                             | Early: half-hourly 0.1° estimates, about four-hour latency. Documented GeoTIFF download requires PPS registration. Validate actual file, scaling, rate versus accumulation and dataset reuse terms before ingestion. Existing weather already has model rainfall.                                                                                                                                                                             |
| 6        | [EUMETSAT LI guide](https://user.eumetsat.int/resources/user-guides/mtg-li-level-2-data-guide), [registration/licensing](https://user.eumetsat.int/resources/user-guides/data-registration-and-licensing) | Africa coverage; Data Store registration needed. Confirm exact LI product, core licence designation, quality flags and sensing-time fixture before ingestion. Lightning is not an observed wildfire.                                                                                                                                                                                                                                          |

Gusts, VPD and model soil moisture already exist in `weather.server.ts` and on the
fire page. CAMS PM2.5/dust already exist in `air-quality.ts`, with a recorded fixture
in `air-quality.test.ts`, and render in Survival Mode. This is modeled concentration;
source-attributed smoke transport is still a separate capability. The dated evidence
ensemble plan predates these implementations and is not a current missing-feature list.
