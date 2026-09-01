#!/usr/bin/env bash
set -euo pipefail

qa_tmp_dir=$(mktemp -d)
qa_admins_file="$qa_tmp_dir/original-admins"
qa_session_a="$qa_tmp_dir/session-a"
qa_session_b="$qa_tmp_dir/session-b"
qa_gate="$qa_tmp_dir/gate"
qa_admin_a="f0140000-0000-4000-8000-000000000010"
qa_admin_b="f0140000-0000-4000-8000-000000000011"
qa_psql=(psql -h 127.0.0.1 -p 54822 -U postgres -d postgres -X -v ON_ERROR_STOP=1)
export PGPASSWORD=postgres

cleanup() {
  qa_original_status=$?
  qa_cleanup_status=0
  trap - EXIT
  set +e
  if [[ -f "$qa_admins_file" ]]; then
    while IFS= read -r qa_admin_id; do
      if [[ ! "$qa_admin_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
        qa_cleanup_status=1
        continue
      fi
      "${qa_psql[@]}" -q <<SQL || qa_cleanup_status=1
insert into public.user_roles (user_id, role)
values ('$qa_admin_id'::uuid, 'admin')
on conflict (user_id, role) do nothing;
SQL
    done < "$qa_admins_file"
  else
    qa_cleanup_status=1
  fi
  "${qa_psql[@]}" -qAtc \
    "delete from public.user_roles where user_id in ('$qa_admin_a', '$qa_admin_b')" \
    || qa_cleanup_status=1
  "${qa_psql[@]}" -qAtc \
    "delete from auth.users where id in ('$qa_admin_a', '$qa_admin_b')" \
    || qa_cleanup_status=1
  rm -rf "$qa_tmp_dir"
  if [[ $qa_original_status -ne 0 || $qa_cleanup_status -ne 0 ]]; then
    exit 1
  fi
  exit 0
}
trap cleanup EXIT

"${qa_psql[@]}" -qAtc \
  "select user_id from public.user_roles where role = 'admin' and user_id not in ('$qa_admin_a', '$qa_admin_b') order by user_id" \
  > "$qa_admins_file"

if [[ ! -s "$qa_admins_file" ]]; then
  echo "race test requires an existing non-fixture admin" >&2
  exit 1
fi

"${qa_psql[@]}" -q <<SQL
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '$qa_admin_a', 'authenticated', 'authenticated', 'f014-race-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '$qa_admin_b', 'authenticated', 'authenticated', 'f014-race-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;
insert into public.user_roles (user_id, role)
values ('$qa_admin_a', 'admin'), ('$qa_admin_b', 'admin')
on conflict (user_id, role) do nothing;
delete from public.user_roles
where role = 'admin' and user_id not in ('$qa_admin_a', '$qa_admin_b');
SQL

if [[ $("${qa_psql[@]}" -qAtc "select count(*) from public.user_roles where role = 'admin'") != "2" ]]; then
  echo "race setup did not isolate exactly two admins" >&2
  exit 1
fi

PGAPPNAME=f014_race_gate "${qa_psql[@]}" -qAtc \
  "select pg_advisory_lock(14014, 1); select pg_sleep(1); select pg_advisory_unlock(14014, 1)" \
  > "$qa_gate" 2>&1 &
qa_gate_pid=$!

for _ in {1..50}; do
  if [[ $("${qa_psql[@]}" -qAtc "select count(*) from pg_stat_activity where application_name = 'f014_race_gate' and wait_event = 'PgSleep'") == "1" ]]; then
    break
  fi
  sleep 0.05
done

if [[ $("${qa_psql[@]}" -qAtc "select count(*) from pg_stat_activity where application_name = 'f014_race_gate' and wait_event = 'PgSleep'") != "1" ]]; then
  echo "race gate did not become ready" >&2
  exit 1
fi

PGAPPNAME=f014_race_a "${qa_psql[@]}" > "$qa_session_a" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$qa_admin_a', true);
select pg_advisory_xact_lock_shared(14014, 1);
delete from public.user_roles where user_id = '$qa_admin_a' and role = 'admin';
commit;
SQL
qa_pid_a=$!

PGAPPNAME=f014_race_b "${qa_psql[@]}" > "$qa_session_b" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$qa_admin_b', true);
select pg_advisory_xact_lock_shared(14014, 1);
delete from public.user_roles where user_id = '$qa_admin_b' and role = 'admin';
commit;
SQL
qa_pid_b=$!

set +e
wait "$qa_pid_a"
qa_status_a=$?
wait "$qa_pid_b"
qa_status_b=$?
wait "$qa_gate_pid"
qa_gate_status=$?
set -e

if [[ $qa_gate_status -ne 0 ]]; then
  echo "race gate failed" >&2
  exit 1
fi

if ! { [[ $qa_status_a -eq 0 && $qa_status_b -ne 0 ]] || [[ $qa_status_a -ne 0 && $qa_status_b -eq 0 ]]; }; then
  echo "expected exactly one admin removal to fail" >&2
  exit 1
fi

if ! grep -q "last_admin_required" "$qa_session_a" "$qa_session_b"; then
  echo "failed removal did not report last_admin_required" >&2
  exit 1
fi

qa_remaining=$("${qa_psql[@]}" -qAtc "select count(*) from public.user_roles where role = 'admin'")
if [[ $qa_remaining -lt 1 ]]; then
  echo "concurrent removals left no administrator" >&2
  exit 1
fi

echo "concurrent admin removals: one committed, one rejected, $qa_remaining admin remains"
