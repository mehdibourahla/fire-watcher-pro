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
source_checkpoint_backup="$(psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
  select encode(convert_to(row_to_json(checkpoint)::text, 'UTF8'), 'base64')
  from public.source_checkpoints checkpoint
  where contract_key = 'local_fwi';
" | tr -d '[:space:]')"
if [ -z "$source_checkpoint_backup" ]; then
  echo "missing local_fwi source checkpoint" >&2
  exit 2
fi

cleanup() {
  psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "
    set session_replication_role = replica;
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
    with backup as (
      select jsonb_populate_record(
        null::public.source_checkpoints,
        convert_from(decode('$source_checkpoint_backup', 'base64'), 'UTF8')::jsonb
      ) as checkpoint
    )
    update public.source_checkpoints current
    set
      last_scheduled_for = (backup.checkpoint).last_scheduled_for,
      last_attempt_at = (backup.checkpoint).last_attempt_at,
      last_success_at = (backup.checkpoint).last_success_at,
      upstream_published_at = (backup.checkpoint).upstream_published_at,
      data_from = (backup.checkpoint).data_from,
      data_through = (backup.checkpoint).data_through,
      validated_at = (backup.checkpoint).validated_at,
      published_at = (backup.checkpoint).published_at,
      replay_cursor = (backup.checkpoint).replay_cursor,
      consecutive_failures = (backup.checkpoint).consecutive_failures,
      schema_fingerprint = (backup.checkpoint).schema_fingerprint,
      records_accepted = (backup.checkpoint).records_accepted,
      records_expected = (backup.checkpoint).records_expected,
      coverage_status = (backup.checkpoint).coverage_status,
      fallback_contract_key = (backup.checkpoint).fallback_contract_key,
      last_public_reason_code = (backup.checkpoint).last_public_reason_code,
      updated_at = (backup.checkpoint).updated_at
    from backup
    where current.contract_key = 'local_fwi';
    set session_replication_role = origin;
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
    count(distinct forecast.snapshot_id), min(forecast.snapshot_id::text),
    checkpoint.snapshot_id::text,
    source.last_scheduled_for = checkpoint.scheduled_for,
    source.data_through = checkpoint.base_date::timestamptz,
    source.published_at = checkpoint.published_at,
    source.coverage_status
  from public.risk_publication_checkpoint checkpoint
  join public.source_checkpoints source on source.contract_key = checkpoint.key
  join public.risk_forecasts forecast on forecast.snapshot_id = checkpoint.snapshot_id
  where checkpoint.key = 'local_fwi'
  group by checkpoint.snapshot_id, checkpoint.scheduled_for,
    checkpoint.base_date, checkpoint.published_at,
    source.last_scheduled_for, source.data_through,
    source.published_at, source.coverage_status;
"; } | tr -d '[:space:]')"

test "$result" = "$expected|1|72|72|1|$snapshot_b|$snapshot_b|t|t|t|complete"

generations="$({ psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -AtF '|' -c "
  select snapshot_id, count(*), count(distinct fwi)
  from public.risk_forecasts
  where snapshot_id in ('$snapshot_a', '$snapshot_b')
  group by snapshot_id
  order by snapshot_id;
"; } | tr '\n' ';')"
case "$generations" in
  "$snapshot_b|$expected|1;" | "$snapshot_a|$expected|1;$snapshot_b|$expected|1;") ;;
  *) echo "invalid immutable generations: $generations" >&2; exit 1 ;;
esac

echo "concurrent immutable promotions remained atomic and monotonic: $result"
