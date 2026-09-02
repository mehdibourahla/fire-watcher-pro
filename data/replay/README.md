# Replay data

`bun run replay:window` needs a data directory holding:

- `units.json`, `geoms.json`, `settlements.json` — the public `admin_units` (with `geom`
  for communes) and `settlements` rows, fetched with the publishable key.
- `fci/<tag>-*.json` — EUMETSAT WFS `mtg_fd:frp` GetFeature pages, `application/json`,
  time-filtered, BBOX lat-first `33.2,-3.2,37.6,9.7`. The layer serves months of archive.
- `firms/*-<SENSOR>.csv` — optional FIRMS area CSVs (`VIIRS_SNPP`, `VIIRS_NOAA20`,
  `VIIRS_NOAA21`, `MODIS`), available 10 days back with a `FIRMS_MAP_KEY`.

The 25–28 August 2026 window (Jijel) is the regression case: 44,534 FCI pixels. The
cache is not committed; the fetch recipe is in
`docs/superpowers/plans/2026-09-02-commune-alert-state.md`.
