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
scheduled_a="2098-01-01T00:00:00Z"
scheduled_b="2098-01-01T01:00:00Z"

cleanup() {
  psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "
    delete from public.risk_forecast_staging
    where snapshot_id in ('$snapshot_a', '$snapshot_b');
    delete from public.risk_publication_checkpoint
    where snapshot_id in ('$snapshot_a', '$snapshot_b');
    delete from public.risk_forecasts
    where snapshot_id in ('$snapshot_a', '$snapshot_b');
    delete from public.risk_publications
    where snapshot_id in ('$snapshot_a', '$snapshot_b');
    delete from public.risk_forecast_snapshot_runs
    where snapshot_id in ('$snapshot_a', '$snapshot_b');
  "
}
trap cleanup EXIT
cleanup

checkpoint_count="$(psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
  select count(*) from public.risk_publication_checkpoint;
" | tr -d '[:space:]')"
if [ "$checkpoint_count" != "0" ]; then
  echo "refusing to replace an existing local risk publication" >&2
  exit 2
fi

expected="$({ psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
  select count(*) * 6
  from public.admin_units
  where level = 'commune';
"; } | tr -d '[:space:]')"

psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "
  select public.begin_risk_forecast_snapshot(
    '$snapshot_a', date '$base_date', '$scheduled_a', now() - interval '6 hours'
  );
  select public.begin_risk_forecast_snapshot(
    '$snapshot_b', date '$base_date', '$scheduled_b', now() - interval '6 hours'
  );
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
  local snapshot="$1"
  local scheduled="$2"
  psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
    select public.publish_risk_forecast_snapshot(
      '$snapshot'::uuid, date '$base_date', '$scheduled'
    )->>'status';
  " | tr -d '[:space:]'
}

result_a_file="$(mktemp)"
result_b_file="$(mktemp)"
trap 'rm -f "$result_a_file" "$result_b_file"; cleanup' EXIT
promote "$snapshot_a" "$scheduled_a" >"$result_a_file" &
pid_a=$!
promote "$snapshot_b" "$scheduled_b" >"$result_b_file" &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

case "$(cat "$result_a_file")" in promoted | superseded) ;; *) exit 1 ;; esac
test "$(cat "$result_b_file")" = "promoted"

result="$({ psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -AtF '|' -c "
  select
    count(*), count(distinct fwi), min(fwi), max(fwi),
    count(distinct snapshot_id), min(snapshot_id::text),
    (select snapshot_id::text from public.risk_publication_checkpoint where key = 'local_fwi')
  from public.risk_forecasts
  where source = 'local_fwi'
    and forecast_date between date '$base_date' and date '$base_date' + 5;
"; } | tr -d '[:space:]')"

test "$result" = "$expected|1|72|72|1|$snapshot_b|$snapshot_b"

echo "concurrent promotions remained atomic and monotonic: $result"
