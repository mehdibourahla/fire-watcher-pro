#!/usr/bin/env bash
set -euo pipefail

qa_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
qa_repo_root="$(cd -- "$qa_script_dir/.." && pwd)"
qa_migration="$qa_repo_root/supabase/migrations/20260901192500_enforce_profile_webhook_integrity.sql"
qa_database_url="${QA_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54822/postgres}"
qa_psql_bin="${QA_PSQL_BIN:-psql}"
qa_database_prefix="qa_profile_webhook_preflight_${$}_${RANDOM}"
qa_profile_database="${qa_database_prefix}_profile"
qa_webhook_database="${qa_database_prefix}_webhook"
qa_temp_databases=("$qa_profile_database" "$qa_webhook_database")
qa_tmp_dir=""
qa_migration_pid=""

refuse_database_target() {
  local message="$1"
  echo "$message" >&2
  exit 2
}

validate_database_target() {
  if [[ "$qa_database_url" == *"?"* || "$qa_database_url" == *"%"* ]]; then
    refuse_database_target "refusing database query overrides"
  fi
  if [[ ! "$qa_database_url" =~ ^postgres(ql)?://([^/?#@]+(:[^/?#@]*)?@)?127[.]0[.]0[.]1:54822/postgres$ ]]; then
    refuse_database_target "refusing non-local preflight database"
  fi
}

assert_guard_rejects() {
  local candidate="$1"
  local expected="$2"
  local output status

  set +e
  output="$(
    QA_DATABASE_URL="$candidate" \
      QA_PSQL_BIN=false \
      QA_SKIP_PREFLIGHT_GUARD_TESTS=1 \
      bash "$qa_script_dir/test-profile-webhook-preflight.sh" 2>&1
  )"
  status=$?
  set -e

  if [[ $status -ne 2 || "$output" != *"$expected"* ]]; then
    echo "database target guard accepted: $candidate" >&2
    exit 1
  fi
}

run_guard_regressions() {
  assert_guard_rejects \
    "postgresql://postgres@db.example.test:54822/postgres" \
    "refusing non-local preflight database"
  assert_guard_rejects \
    "postgresql://postgres@127.0.0.1:5432/postgres" \
    "refusing non-local preflight database"
  assert_guard_rejects \
    "postgresql://postgres@127.0.0.1:54822/postgres?host=db.example.test" \
    "refusing database query overrides"
  assert_guard_rejects \
    "postgresql://postgres@127.0.0.1:54822/postgres?hostaddr=203.0.113.9" \
    "refusing database query overrides"
  assert_guard_rejects \
    "postgresql://postgres@127.0.0.1:54822/postgres?port=5432" \
    "refusing database query overrides"
  assert_guard_rejects \
    "postgresql://postgres@127.0.0.1:54822/postgres?%68ost=db.example.test" \
    "refusing database query overrides"
}

controller_psql() {
  env -u PGHOST -u PGHOSTADDR -u PGPORT -u PGDATABASE \
    -u PGSERVICE -u PGSERVICEFILE \
    "$qa_psql_bin" "$qa_database_url" -X -v ON_ERROR_STOP=1 "$@"
}

database_psql() {
  local database="$1"
  shift
  local database_url="${qa_database_url%/postgres}/$database"

  env -u PGHOST -u PGHOSTADDR -u PGPORT -u PGDATABASE \
    -u PGSERVICE -u PGSERVICEFILE \
    "$qa_psql_bin" "$database_url" -X -v ON_ERROR_STOP=1 "$@"
}

drop_temp_databases() {
  local database
  local cleanup_status=0

  for database in "${qa_temp_databases[@]}"; do
    controller_psql -q -c "drop database if exists \"$database\" with (force);" \
      >/dev/null 2>&1 || cleanup_status=1
  done
  return "$cleanup_status"
}

cleanup() {
  local original_status=$?
  local cleanup_status=0

  trap - EXIT INT TERM HUP
  set +e
  if [[ -n "$qa_migration_pid" ]]; then
    kill -TERM "$qa_migration_pid" >/dev/null 2>&1 || true
    wait "$qa_migration_pid" >/dev/null 2>&1 || true
    qa_migration_pid=""
  fi
  drop_temp_databases || cleanup_status=1
  if [[ -n "$qa_tmp_dir" ]]; then
    rm -rf -- "$qa_tmp_dir"
  fi

  if [[ $original_status -ne 0 ]]; then
    exit "$original_status"
  fi
  if [[ $cleanup_status -ne 0 ]]; then
    echo "failed to remove preflight test databases" >&2
    exit 1
  fi
  exit 0
}

handle_signal() {
  exit 130
}

controller_fingerprint() {
  controller_psql -qAtc "
    select md5(jsonb_build_object(
      'profiles', coalesce(
        (select jsonb_agg(to_jsonb(profile) order by profile.id)
         from public.profiles profile),
        '[]'::jsonb
      ),
      'webhook_endpoints', coalesce(
        (select jsonb_agg(to_jsonb(endpoint) order by endpoint.id)
         from public.webhook_endpoints endpoint),
        '[]'::jsonb
      ),
      'constraints', coalesce(
        (select jsonb_agg(
           jsonb_build_array(constraint_record.conname, pg_get_constraintdef(constraint_record.oid))
           order by constraint_record.conname
         )
         from pg_constraint constraint_record
         where constraint_record.conrelid in (
           'public.profiles'::regclass,
           'public.webhook_endpoints'::regclass
         )),
        '[]'::jsonb
      )
    )::text);
  " | tr -d '[:space:]'
}

create_scenario_database() {
  local database="$1"

  controller_psql -q -c \
    "create database \"$database\" template template0 encoding 'UTF8';"
  database_psql "$database" -q <<'SQL'
create table public.profiles (
  id uuid primary key,
  locale text not null default 'ar',
  quiet_hours_start smallint,
  quiet_hours_end smallint,
  min_danger_level smallint not null default 3
);

create table public.webhook_endpoints (
  id uuid primary key,
  user_id uuid not null,
  label text not null,
  url text not null,
  secret text not null default 'local-preflight-secret',
  kinds text[] not null default array['fire', 'risk']::text[],
  min_severity smallint not null default 3,
  active boolean not null default true,
  last_status integer,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_endpoints_url_https check (
    url ~ '^https://[^/[:space:]]+'
    and url !~* '^https://(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[)'
    and url !~* '^https://[^/]*\.(local|internal)(:|/|$)'
  )
);
SQL
}

row_fingerprint() {
  local database="$1"
  local table="$2"

  database_psql "$database" -qAtc \
    "select md5(row_to_json(row_value)::text) || '|' || pg_column_size(row_value) from public.$table row_value;" \
    | tr -d '[:space:]'
}

assert_failed_migration_state() {
  local database="$1"
  local before="$2"
  local table="$3"
  local log_file="$4"
  local expected_diagnostic="$5"
  local after constraint_state

  after="$(row_fingerprint "$database" "$table")"
  if [[ "$after" != "$before" ]]; then
    echo "$table fixture changed after failed migration" >&2
    exit 1
  fi

  constraint_state="$(database_psql "$database" -qAtF '|' -c "
    select
      count(*) filter (where conname in (
        'profiles_locale_valid',
        'profiles_quiet_hours_start_valid',
        'profiles_quiet_hours_end_valid',
        'profiles_min_danger_level_valid',
        'webhook_endpoints_label_nonblank',
        'webhook_endpoints_label_length',
        'webhook_endpoints_kinds_nonempty',
        'webhook_endpoints_kinds_allowed',
        'webhook_endpoints_kinds_unique',
        'webhook_endpoints_min_severity_valid'
      )),
      count(*) filter (where conname = 'webhook_endpoints_url_https')
    from pg_constraint
    where conrelid in ('public.profiles'::regclass, 'public.webhook_endpoints'::regclass);
  " | tr -d '[:space:]')"
  if [[ "$constraint_state" != "0|1" ]]; then
    echo "failed migration left a partial constraint state: $constraint_state" >&2
    exit 1
  fi

  if ! grep -Fq "23514: $expected_diagnostic" "$log_file"; then
    echo "failed migration did not report the expected diagnostic" >&2
    cat "$log_file" >&2
    exit 1
  fi
}

run_migration_expect_failure() {
  local database="$1"
  local log_file="$2"
  local status

  set +e
  database_psql "$database" -v VERBOSITY=verbose -f "$qa_migration" \
    >"$log_file" 2>&1 &
  qa_migration_pid=$!
  wait "$qa_migration_pid"
  status=$?
  qa_migration_pid=""
  set -e

  if [[ $status -ne 3 ]]; then
    echo "migration unexpectedly exited with status $status" >&2
    cat "$log_file" >&2
    exit 1
  fi
}

validate_database_target
if [[ "${QA_SKIP_PREFLIGHT_GUARD_TESTS:-0}" != "1" ]]; then
  run_guard_regressions
fi
if [[ ! -f "$qa_migration" ]]; then
  echo "missing profile/webhook integrity migration" >&2
  exit 1
fi

qa_connection_info="$(controller_psql -Atc '\conninfo')"
qa_connected_host="$(printf '%s\n' "$qa_connection_info" | awk -F '|' '$1 == "Host" { print $2 }')"
qa_connected_address="$(printf '%s\n' "$qa_connection_info" | awk -F '|' '$1 == "Host Address" { print $2 }')"
qa_connected_port="$(printf '%s\n' "$qa_connection_info" | awk -F '|' '$1 == "Server Port" { print $2 }')"
qa_connected_database="$(printf '%s\n' "$qa_connection_info" | awk -F '|' '$1 == "Database" { print $2 }')"
if [[ "$qa_connected_host|$qa_connected_port|$qa_connected_database" != "127.0.0.1|54822|postgres" \
  || (-n "$qa_connected_address" && "$qa_connected_address" != "127.0.0.1") ]]; then
  refuse_database_target "refusing unexpected connected database server"
fi

qa_tmp_dir="$(mktemp -d)"
trap cleanup EXIT
trap handle_signal INT TERM HUP

qa_controller_before="$(controller_fingerprint)"
drop_temp_databases

create_scenario_database "$qa_profile_database"
database_psql "$qa_profile_database" -q <<'SQL'
insert into public.profiles (
  id, locale, quiet_hours_start, quiet_hours_end, min_danger_level
)
values (
  'f0190000-0000-4000-8000-000000000091', 'es', -1, 24, 6
);
SQL
qa_profile_before="$(row_fingerprint "$qa_profile_database" profiles)"
if [[ "${QA_PREFLIGHT_INTERRUPT_AFTER_SEED:-}" == "profile" ]]; then
  kill -TERM "$$"
fi
qa_profile_log="$qa_tmp_dir/profile.log"
run_migration_expect_failure "$qa_profile_database" "$qa_profile_log"
assert_failed_migration_state \
  "$qa_profile_database" \
  "$qa_profile_before" \
  profiles \
  "$qa_profile_log" \
  "profiles integrity preflight failed: locale=1, quiet_hours_start=1, quiet_hours_end=1, min_danger_level=1"

create_scenario_database "$qa_webhook_database"
database_psql "$qa_webhook_database" -q <<'SQL'
insert into public.profiles (id)
values ('f0210000-0000-4000-8000-000000000091');

insert into public.webhook_endpoints (
  id, user_id, label, url, kinds, min_severity
)
values (
  'f0211000-0000-4000-8000-000000000091',
  'f0210000-0000-4000-8000-000000000091',
  U&'\00A0\2003\202F\3000\FEFF',
  'https://hooks.example.com/preflight-invalid',
  array[]::text[],
  0
);
SQL
qa_webhook_before="$(row_fingerprint "$qa_webhook_database" webhook_endpoints)"
if [[ "${QA_PREFLIGHT_INTERRUPT_AFTER_SEED:-}" == "webhook" ]]; then
  kill -TERM "$$"
fi
qa_webhook_log="$qa_tmp_dir/webhook.log"
run_migration_expect_failure "$qa_webhook_database" "$qa_webhook_log"
assert_failed_migration_state \
  "$qa_webhook_database" \
  "$qa_webhook_before" \
  webhook_endpoints \
  "$qa_webhook_log" \
  "webhook_endpoints integrity preflight failed: blank_label=1, long_label=0, empty_kinds=1, unknown_kinds=0, duplicate_kinds=0, min_severity=1"

drop_temp_databases
qa_remaining_databases="$(controller_psql -qAtc "
  select count(*)
  from pg_database
  where datname in ('$qa_profile_database', '$qa_webhook_database');
" | tr -d '[:space:]')"
if [[ "$qa_remaining_databases" != "0" ]]; then
  echo "preflight test databases were not removed" >&2
  exit 1
fi

qa_controller_after="$(controller_fingerprint)"
if [[ "$qa_controller_after" != "$qa_controller_before" ]]; then
  echo "controller profile/webhook state changed during preflight tests" >&2
  exit 1
fi

echo "profile preflight rejected precise legacy counts without changing the row or installing constraints"
echo "webhook preflight rejected precise legacy counts without changing the row or installing constraints"
echo "target guards passed; disposable databases and fixtures were fully removed"
