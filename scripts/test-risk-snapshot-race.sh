#!/usr/bin/env bash
set -euo pipefail

: "${QA_DATABASE_URL:?set QA_DATABASE_URL to an isolated local database}"
: "${QA_REST_URL:?set QA_REST_URL to the isolated local Data API}"
: "${QA_ANON_KEY:?set QA_ANON_KEY to the isolated local anon key}"
: "${QA_SERVICE_ROLE_KEY:?set QA_SERVICE_ROLE_KEY to the isolated local service key}"
: "${QA_JWT_SECRET:?set QA_JWT_SECRET to the isolated local JWT secret}"
if [[ ! "$QA_DATABASE_URL" =~ ^postgres(ql)?://([^/?#@]+(:[^/?#@]*)?@)?(localhost|127[.]0[.]0[.]1):([0-9]{1,5})/[^/?#]+([?][^#]*)?$ ]]; then
  echo "refusing non-local database" >&2
  exit 2
fi
qa_database_port="${BASH_REMATCH[5]}"
if (( 10#$qa_database_port < 1 || 10#$qa_database_port > 65535 )); then
  echo "refusing non-local database" >&2
  exit 2
fi
if [[ ! "$QA_REST_URL" =~ ^http://(localhost|127[.]0[.]0[.]1):([0-9]{1,5})$ ]]; then
  echo "refusing non-local Data API URL" >&2
  exit 2
fi
qa_rest_port="${BASH_REMATCH[2]}"
if (( 10#$qa_rest_port < 1 || 10#$qa_rest_port > 65535 )); then
  echo "refusing non-local Data API URL" >&2
  exit 2
fi

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
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where application_name in ('risk-race-control', 'risk-race-a', 'risk-race-b')
      and pid <> pg_backend_pid();
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
  " >/dev/null
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
  select public.stage_risk_forecast_batch(
    snapshot.id,
    jsonb_agg(jsonb_build_object(
      'commune_id', unit.id,
      'forecast_date', date '$base_date' + horizon.day,
      'horizon_days', horizon.day,
      'fwi', snapshot.fwi,
      'danger_level', 5,
      'fuel_limited', false,
      'components', '{}'::jsonb
    ))
  )
  from public.admin_units as unit
  cross join generate_series(0, 5) as horizon(day)
  cross join (
    values
      ('$snapshot_a'::uuid, 71::double precision),
      ('$snapshot_b'::uuid, 72::double precision)
  ) as snapshot(id, fwi)
  where unit.level = 'commune'
  group by snapshot.id;
"

base64url() {
  openssl base64 -A | tr '/+' '_-' | tr -d '='
}

authenticated_jwt() {
  local header payload unsigned signature
  header="$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | base64url)"
  payload="$(printf '{"aud":"authenticated","exp":%s,"role":"authenticated","sub":"f0220000-0000-4000-8000-000000000201"}' "$(( $(date +%s) + 3600 ))" | base64url)"
  unsigned="$header.$payload"
  signature="$(printf '%s' "$unsigned" | openssl dgst -sha256 -hmac "$QA_JWT_SECRET" -binary | base64url)"
  printf '%s.%s' "$unsigned" "$signature"
}

data_api_get() {
  local api_key="$1" bearer="$2" path="$3" output="$4"
  curl --silent --show-error --output "$output" --write-out '%{http_code}' \
    --header "apikey: $api_key" \
    --header "Authorization: Bearer $bearer" \
    "$QA_REST_URL/rest/v1/$path"
}

data_api_mutate() {
  local method="$1" path="$2" body="$3" output="$4"
  curl --silent --show-error --output "$output" --write-out '%{http_code}' \
    --request "$method" \
    --header "apikey: $QA_SERVICE_ROLE_KEY" \
    --header "Authorization: Bearer $QA_SERVICE_ROLE_KEY" \
    --header "Content-Type: application/json" \
    --data "$body" \
    "$QA_REST_URL/rest/v1/$path"
}

result_a_file="$(mktemp)"
result_b_file="$(mktemp)"
api_result_file="$(mktemp)"
control_pid=""
pid_a=""
pid_b=""
finish() {
  for child_pid in "$control_pid" "$pid_a" "$pid_b"; do
    if [ -n "$child_pid" ]; then kill "$child_pid" 2>/dev/null || true; fi
  done
  rm -f "$result_a_file" "$result_b_file" "$api_result_file"
  cleanup
}
interrupted() {
  trap - EXIT
  finish
  exit 130
}
trap finish EXIT
trap interrupted INT TERM

PGAPPNAME="risk-race-control" psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "
  select pg_advisory_lock(hashtextextended('qa:risk-race-control', 0));
  select pg_sleep(60);
" >/dev/null 2>&1 &
control_pid=$!

for _ in {1..100}; do
  control_ready="$(psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
    select count(*) from pg_stat_activity
    where application_name = 'risk-race-control' and state = 'active';
  " | tr -d '[:space:]')"
  [ "$control_ready" = "1" ] && break
  sleep 0.05
done
test "${control_ready:-0}" = "1"

PGAPPNAME="risk-race-a" psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -qAtc "
  begin;
  select pg_advisory_xact_lock(hashtextextended('local_fwi:publication', 0));
  select pg_advisory_xact_lock(hashtextextended('qa:risk-race-control', 0));
  select public.publish_risk_forecast_snapshot(
    '$snapshot_a'::uuid, date '$base_date', '$scheduled_a'
  )->>'status';
  commit;
" | tr -d '[:space:]' >"$result_a_file" &
pid_a=$!

for _ in {1..100}; do
  first_holds_lock="$(psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
    select count(*)
    from pg_stat_activity activity
    join pg_locks held on held.pid = activity.pid
    where activity.application_name = 'risk-race-a'
      and held.locktype = 'advisory' and held.granted
      and exists (
        select 1 from pg_locks control_wait
        where control_wait.pid = activity.pid
          and control_wait.locktype = 'advisory' and not control_wait.granted
      );
  " | tr -d '[:space:]')"
  [ "$first_holds_lock" = "1" ] && break
  sleep 0.05
done
test "${first_holds_lock:-0}" = "1"

PGAPPNAME="risk-race-b" psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -qAtc "
  select public.publish_risk_forecast_snapshot(
    '$snapshot_b'::uuid, date '$base_date', '$scheduled_b'
  )->>'status';
" >"$result_b_file" &
pid_b=$!

for _ in {1..100}; do
  exact_contention="$(psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "
    select count(*)
    from pg_stat_activity holder_activity
    join pg_locks holder on holder.pid = holder_activity.pid and holder.granted
    join pg_locks waiter on waiter.locktype = holder.locktype
      and waiter.database is not distinct from holder.database
      and waiter.classid is not distinct from holder.classid
      and waiter.objid is not distinct from holder.objid
      and waiter.objsubid is not distinct from holder.objsubid
      and not waiter.granted
    join pg_stat_activity waiter_activity on waiter_activity.pid = waiter.pid
    where holder_activity.application_name = 'risk-race-a'
      and waiter_activity.application_name = 'risk-race-b'
      and holder.locktype = 'advisory';
  " | tr -d '[:space:]')"
  [ "$exact_contention" = "1" ] && break
  sleep 0.05
done
test "${exact_contention:-0}" = "1"

psql "$QA_DATABASE_URL" -v ON_ERROR_STOP=1 -qAtc "
  select pg_terminate_backend(pid)
  from pg_stat_activity
  where application_name = 'risk-race-control';
" | rg -q '^t$'
wait "$control_pid" 2>/dev/null || true
control_pid=""
wait "$pid_a"
pid_a=""
wait "$pid_b"
pid_b=""

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

auth_token="$(authenticated_jwt)"
anon_base_status="$(data_api_get "$QA_ANON_KEY" "$QA_ANON_KEY" 'risk_forecasts?select=id&limit=1' "$api_result_file")"
case "$anon_base_status" in 401 | 403) ;; *) echo "anon base table was not denied: $anon_base_status" >&2; exit 1 ;; esac
auth_base_status="$(data_api_get "$QA_ANON_KEY" "$auth_token" 'risk_forecasts?select=id&limit=1' "$api_result_file")"
case "$auth_base_status" in 401 | 403) ;; *) echo "authenticated base table was not denied: $auth_base_status" >&2; exit 1 ;; esac

anon_current_status="$(data_api_get "$QA_ANON_KEY" "$QA_ANON_KEY" "rpc/current_risk_forecasts?snapshot_id=eq.$snapshot_b&select=snapshot_id&limit=1" "$api_result_file")"
test "$anon_current_status" = "200"
jq -e --arg snapshot "$snapshot_b" 'length == 1 and .[0].snapshot_id == $snapshot' "$api_result_file" >/dev/null
auth_current_status="$(data_api_get "$QA_ANON_KEY" "$auth_token" "rpc/current_risk_forecasts?snapshot_id=eq.$snapshot_b&select=snapshot_id&limit=1" "$api_result_file")"
test "$auth_current_status" = "200"
jq -e --arg snapshot "$snapshot_b" 'length == 1 and .[0].snapshot_id == $snapshot' "$api_result_file" >/dev/null

historical_status="$(data_api_get "$QA_ANON_KEY" "$QA_ANON_KEY" "rpc/current_risk_forecasts?snapshot_id=eq.$snapshot_a&select=snapshot_id&limit=1" "$api_result_file")"
test "$historical_status" = "200"
jq -e 'length == 0' "$api_result_file" >/dev/null
legacy_status="$(data_api_get "$QA_ANON_KEY" "$QA_ANON_KEY" 'rpc/current_risk_forecasts?snapshot_id=is.null&select=snapshot_id&limit=1' "$api_result_file")"
test "$legacy_status" = "200"
jq -e 'length == 0' "$api_result_file" >/dev/null

service_status="$(data_api_get "$QA_SERVICE_ROLE_KEY" "$QA_SERVICE_ROLE_KEY" "risk_forecasts?snapshot_id=eq.$snapshot_b&select=snapshot_id&limit=1" "$api_result_file")"
test "$service_status" = "200"
jq -e --arg snapshot "$snapshot_b" 'length == 1 and .[0].snapshot_id == $snapshot' "$api_result_file" >/dev/null

for mutation_status in \
  "$(data_api_mutate POST 'risk_forecasts' '{}' "$api_result_file")" \
  "$(data_api_mutate PATCH "risk_forecasts?snapshot_id=eq.$snapshot_b" '{"fwi":77}' "$api_result_file")" \
  "$(data_api_mutate DELETE "risk_forecasts?snapshot_id=eq.$snapshot_b" '{}' "$api_result_file")"
do
  case "$mutation_status" in 401 | 403) ;; *) echo "service raw mutation was not denied: $mutation_status" >&2; exit 1 ;; esac
done

echo "concurrent immutable promotions remained atomic and monotonic: $result"
echo "observed the second backend blocked on the exact production advisory lock"
echo "Data API denied base rows and exposed only the current complete RPC"
echo "Data API denied service-role INSERT, UPDATE, and DELETE outside lifecycle RPCs"
