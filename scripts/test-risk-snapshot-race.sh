#!/usr/bin/env bash
set -euo pipefail

: "${QA_DATABASE_URL:?set QA_DATABASE_URL to an isolated local database}"
case "$QA_DATABASE_URL" in
  *127.0.0.1* | *localhost*) ;;
  *) echo "refusing non-local database" >&2; exit 2 ;;
esac

snapshot_a="f0220000-0000-4000-8000-000000000101"
snapshot_b="f0220000-0000-4000-8000-000000000102"
base_date="2098-01-01"

cleanup() {
  psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "
    delete from public.risk_forecast_staging
    where snapshot_id in ('$snapshot_a', '$snapshot_b');
    delete from public.risk_forecasts
    where source = 'local_fwi'
      and forecast_date between date '$base_date' and date '$base_date' + 5;
  "
}
trap cleanup EXIT
cleanup

expected="$({ psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
  select count(*) * 6
  from public.admin_units
  where level = 'commune';
"; } | tr -d '[:space:]')"

psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "
  insert into public.risk_forecast_staging (
    snapshot_id,
    commune_id,
    forecast_date,
    horizon_days,
    fwi,
    danger_level,
    fuel_limited,
    components
  )
  select
    snapshot.id,
    unit.id,
    date '$base_date' + horizon.day,
    horizon.day,
    snapshot.fwi,
    5,
    false,
    '{}'::jsonb
  from public.admin_units as unit
  cross join generate_series(0, 5) as horizon(day)
  cross join (
    values
      ('$snapshot_a'::uuid, 71::double precision),
      ('$snapshot_b'::uuid, 72::double precision)
  ) as snapshot(id, fwi)
  where unit.level = 'commune';
"

promote() {
  psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
    select public.publish_risk_forecast_snapshot('$1'::uuid);
  " | tr -d '[:space:]'
}

result_a_file="$(mktemp)"
result_b_file="$(mktemp)"
trap 'rm -f "$result_a_file" "$result_b_file"; cleanup' EXIT
promote "$snapshot_a" >"$result_a_file" &
pid_a=$!
promote "$snapshot_b" >"$result_b_file" &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

test "$(cat "$result_a_file")" = "$expected"
test "$(cat "$result_b_file")" = "$expected"

result="$({ psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -AtF '|' -c "
  select count(*), count(distinct fwi), min(fwi), max(fwi)
  from public.risk_forecasts
  where source = 'local_fwi'
    and forecast_date between date '$base_date' and date '$base_date' + 5;
"; } | tr -d '[:space:]')"

case "$result" in
  "$expected|1|71|71" | "$expected|1|72|72") ;;
  *) echo "mixed published generation: $result" >&2; exit 1 ;;
esac

echo "concurrent promotions remained atomic: $result"
