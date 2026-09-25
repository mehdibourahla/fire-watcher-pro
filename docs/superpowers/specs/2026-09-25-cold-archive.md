# Cold archive and storage efficiency

Decision of 2026-09-25: keep every row forever, but not in Postgres. Bulk time series older
than 90 days move to Parquet files in a private Storage bucket; nothing is deleted from
Postgres until its file is proven. Incidents, warnings and reports stay hot forever.

## Measured in prod (2026-09-25)

- Incidents of every kind: under 2 MB. Not a storage concern.
- Growth is bulk: about 20 MB/day in Postgres, led by `risk_forecasts` (173 MB, 10k rows/day),
  `weather_snapshots` (75 MB), `source_runs` and `source_jobs` (57 MB), `broadcast_audit`.
- `onm_vigilance` stores its area polygon on every warning: 450 rows/day, 31 MB, but only 58
  distinct polygons, exactly one per wilaya.
- `broadcast_audit` holds 86,287 "suppressed onm_duplicate" rows for 944 warnings: the relay
  re-logs every still-suppressed warning on every run.
- `airport_weather` keeps only the newest report per airport; sandstorm history is lost.
- `prune_reliability_history()` (2026-09-08) deletes `source_runs` and `operational_incidents`
  after 180 days, keeping only daily counts. It has deleted nothing yet (history starts
  2026-08-28), and nothing reads its count tables.

## Cold tables

| table                  | day column     | hot for | stays hot regardless                                |
| ---------------------- | -------------- | ------- | --------------------------------------------------- |
| `weather_snapshots`    | `scheduled_at` | 90 days |                                                     |
| `risk_forecasts`       | `created_at`   | 90 days | rows of the currently published snapshot            |
| `broadcast_audit`      | `at`           | 90 days |                                                     |
| `airport_observations` | `observed_at`  | 90 days |                                                     |
| `source_runs`          | `started_at`   | 90 days | runs that resolved a gap                            |
| `source_jobs`          | `created_at`   | 92 days | jobs a hot run, snapshot or investigation points at |

Days are UTC. Jobs wait two extra days so the runs that point at them leave first. A row
kept hot by a reference stays hot forever; cold and hot never overlap. One SQL function,
`private.cold_candidates(table, day)`, defines the rows of a day for both export and delete.

## Export (daily GitHub Actions job)

For each cold table, every day past its hot window with no `cold_exports` row, oldest first:

1. DuckDB reads the day's candidate rows from Postgres through the `cold_reader` role
   (select only, read-only transactions, cannot delete) and writes
   `cold/<table>/<yyyy>/<mm>/<dd>.parquet`, zstd. Parquet keeps the column types.
2. Upload to the private bucket `cold-archive`, download it back, and check the SHA-256 and
   that DuckDB reads the same row count and key digest (MD5 of the sorted ids) from it.
3. `cold_archive_commit` (service role) deletes the same candidates in one transaction and
   recomputes count and digest over what it deleted. Any mismatch raises: the delete rolls
   back with the manifest row, and the next run retries the day.
4. The manifest row `cold_exports(table, day, rows, key_digest, sha256, bytes, path)` is
   written first in that same transaction. `broadcast_audit` and published `risk_forecasts`
   are immutable by trigger; the triggers now allow a DELETE only when the row's day has a
   manifest row, and still refuse every UPDATE. Deleted run idempotency keys go to
   `source_run_retired_keys`, as the 180-day prune did.

A day with no candidates gets a manifest row with 0 rows and no file. The commit also
refuses a day inside the hot window, whatever the caller sends. Runs catch up: GitHub drops
scheduled runs, so a missed day is exported by the next run. `workflow_dispatch` with
`trial_table` and `trial_day` exports and verifies one day to `trial/...` and deletes nothing.

Reading the archive later: `duckdb -c "select * from 'cold/risk_forecasts/*/*/*.parquet'"`
over a download, or over S3-compatible access to the bucket.

`prune_reliability_history()`, its cron entry, and its two count tables are removed.
Operational incidents stay hot (85 rows). The retired-key guard stays.

## Storage fixes (same PR)

- **ONM areas stored once.** `onm_areas(id = md5 of the polygon, polygon)`; warnings carry
  `area_id`. Content-addressed, so a changed ONM outline keeps old warnings exact and the 13
  warnings without a wilaya dedupe too. Readers embed `onm_areas(polygon)`.
- **Suppression logged once per warning.** The relay looks up warnings it already logged as
  `suppressed/onm_duplicate` (a partial index serves the lookup) and skips them.
  `broadcast_audit` is append-only, so the 86k existing repeats are not rewritten: they leave
  Postgres through the cold archive like every other audit row.
- **Every airport report kept.** `airport_observations(station, observed_at, ...)` keeps
  every METAR; `airport_weather` becomes a view of the newest report per station, with the
  same columns, so readers do not change.

## Owner actions

1. Set a password on `cold_reader` and store the pooler connection string as the repository
   secret `COLD_ARCHIVE_DB_URL`.
2. Run the workflow once with `trial_table: risk_forecasts`, `trial_day: 2026-08-28`, and read
   its checks.
3. First real delete: 2026-11-26, the first day with data older than 90 days.

## Later

R2 instead of Supabase Storage if analysis egress becomes a cost. `source_captures` (the
raw-archive index, 37 MB) could join the cold tables once replay tooling reads Parquet.
